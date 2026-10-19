import * as XLSX from 'xlsx';
import type { AppSettings, TapdDefectRecord } from '../../shared/types.js';

type TapdRawRecord = Record<string, unknown>;
type TapdWorkType = NonNullable<TapdDefectRecord['type']>;
type TapdWorkspace = { id: string; name: string; status: string; raw: TapdRawRecord };

const terminalStatusKeywords = [
  'closed',
  'resolved',
  'done',
  'finished',
  'completed',
  '已关闭',
  '已完成',
  '我已完成',
  '已验收'
];
const workspaceCacheTtlMs = 8 * 60 * 1000;
let workspaceCache: { at: number; tokenKey: string; workspaces: TapdWorkspace[] } | undefined;

export async function syncTapdBugs(settings: AppSettings) {
  const authToken = settings.tapdAuthToken.trim();
  const baseUrl = (settings.tapdApiBaseUrl || 'https://api.tapd.cn').replace(/\/+$/, '');
  if (!authToken) throw new Error('TAPD auth token is required.');

  const userInfo = await fetchTapdUserInfo(baseUrl, settings);
  const currentOwner = extractTapdUserName(userInfo);
  if (!currentOwner) throw new Error('TAPD /users/info did not return a usable name.');

  const workspaces = await fetchParticipantWorkspaces(baseUrl, settings);
  const startedAt = Date.now();
  const errors: string[] = [];
  const records: TapdDefectRecord[] = [];
  const jobs = workspaces.flatMap((workspace) =>
    (['bug', 'task', 'story'] as const).map((type) => async () => {
      if (Date.now() - startedAt > 60_000) return;
      try {
        records.push(...await fetchTapdWorkItems(baseUrl, settings, workspace, type, currentOwner));
      } catch (error) {
        errors.push(`${workspace.name} ${type}: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  );

  await runWithConcurrency(jobs, 9);
  records.sort((a, b) => (b.updatedAt || b.syncedAt).localeCompare(a.updatedAt || a.syncedAt));

  return {
    defects: records,
    syncedCount: records.length,
    currentOwner,
    workspaceCount: workspaces.length,
    warning: errors.length > 0 ? errors.slice(0, 8).join(' | ') : undefined
  };
}

async function fetchTapdUserInfo(baseUrl: string, settings: AppSettings) {
  const response = await fetchWithTimeout(`${baseUrl}/users/info`, {
    headers: buildTapdHeaders(settings)
  });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`TAPD /users/info failed: HTTP ${response.status}${errorBody ? ` - ${errorBody.slice(0, 220)}` : ''}`);
  }
  return response.json();
}

async function fetchParticipantWorkspaces(baseUrl: string, settings: AppSettings) {
  const tokenKey = settings.tapdAuthToken.trim().slice(-12);
  if (workspaceCache && workspaceCache.tokenKey === tokenKey && Date.now() - workspaceCache.at < workspaceCacheTtlMs) {
    return workspaceCache.workspaces;
  }

  const response = await fetchWithTimeout(`${baseUrl}/workspaces/user_participant_projects`, {
    headers: buildTapdHeaders(settings)
  });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`TAPD participant workspaces failed: HTTP ${response.status}${errorBody ? ` - ${errorBody.slice(0, 220)}` : ''}`);
  }
  const payload = await response.json();
  const workspaces = extractTapdDataArray(payload)
    .map((item) => normalizeRawWorkspace(item))
    .map((raw) => ({
      id: stringField(raw, ['id', 'workspace_id', 'project_id']),
      name: stringField(raw, ['name', 'workspace_name', 'project_name', 'title']),
      status: stringField(raw, ['status']),
      raw
    }))
    .filter((workspace) => workspace.id && workspace.status === 'normal');

  workspaceCache = { at: Date.now(), tokenKey, workspaces };
  return workspaces;
}

async function fetchTapdWorkItems(
  baseUrl: string,
  settings: AppSettings,
  workspace: TapdWorkspace,
  type: TapdWorkType,
  currentOwner: string
) {
  const endpoint = type === 'bug' ? '/bugs' : type === 'task' ? '/tasks' : '/stories';
  const ownerField = type === 'bug' ? 'current_owner' : 'owner';
  const titleField = type === 'bug' ? 'title' : 'name';
  const params = new URLSearchParams({
    workspace_id: workspace.id,
    limit: '200',
    fields: ['id', titleField, 'description', 'status', ownerField, 'priority', 'severity', 'modified'].join(','),
    __format: 'json'
  });
  const response = await fetchWithTimeout(`${baseUrl}${endpoint}?${params.toString()}`, {
    headers: buildTapdHeaders(settings)
  });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}${errorBody ? ` - ${errorBody.slice(0, 160)}` : ''}`);
  }
  const payload = await response.json();
  const syncedAt = new Date().toISOString();
  return extractTapdDataArray(payload)
    .map((item): TapdDefectRecord => {
      const raw = type === 'bug' ? normalizeRawBug(item) : type === 'task' ? normalizeRawTask(item) : normalizeRawStory(item);
      const itemId = stringField(raw, ['id', 'bug_id', 'task_id', 'story_id']);
      const title = stringField(raw, [titleField, 'title', 'name', 'summary']);
      const owner = stringField(raw, [ownerField, 'current_owner', 'owner']);
      const status = stringField(raw, ['status', 'state']) || 'unknown';
      return {
        id: `tapd_${workspace.id}_${type}_${itemId || title}`,
        type,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        projectId: workspace.id,
        defectId: `${type}_${itemId || title}`,
        title: title || `TAPD ${type} ${itemId || ''}`.trim(),
        description: stringField(raw, ['description', 'details', 'content', 'steps']),
        status,
        priority: stringField(raw, ['priority']),
        severity: stringField(raw, ['severity']),
        assignee: owner,
        url: buildTapdItemUrl(workspace.id, type, itemId),
        raw: { ...raw, __source: 'tapd_my_work', __workspaceName: workspace.name },
        updatedAt: stringField(raw, ['modified', 'updated_at', 'update_time']),
        syncedAt
      };
    })
    .filter((record) => record.defectId && record.title)
    .filter((record) => ownerMatches(record.assignee, currentOwner))
    .filter((record) => !isTerminalStatus(record.status) || isReopenStatus(record.status));
}

export async function updateTapdBugStatus(settings: AppSettings, bug: TapdDefectRecord, status: string) {
  if ((bug.type || 'bug') !== 'bug') return { ok: false, skipped: true, error: 'Only TAPD Bug status sync is supported.' };
  const bugId = displayTapdBugId(bug);
  if (!bug.workspaceId || !bugId) return { ok: false, error: 'Missing TAPD workspace_id or bug id.' };
  const baseUrl = (settings.tapdApiBaseUrl || 'https://api.tapd.cn').replace(/\/+$/, '');
  const body = new URLSearchParams({
    workspace_id: bug.workspaceId,
    id: bugId,
    v_status: status,
    __format: 'json'
  });
  const response = await fetchWithTimeout(`${baseUrl}/bugs`, {
    method: 'POST',
    headers: {
      ...buildTapdHeaders(settings),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    return { ok: false, error: `HTTP ${response.status}${errorBody ? ` - ${errorBody.slice(0, 180)}` : ''}` };
  }
  const payload = await response.json().catch(() => undefined);
  const payloadRecord = payload && typeof payload === 'object' ? payload as TapdRawRecord : undefined;
  const success = payloadRecord?.status === 1 || payloadRecord?.status === '1' || payloadRecord?.info === 'success';
  if (!success) {
    return { ok: false, error: `TAPD update failed${payloadRecord?.info ? `: ${String(payloadRecord.info)}` : ''}` };
  }
  return { ok: true };
}

async function runWithConcurrency(jobs: Array<() => Promise<void>>, limit: number) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (index < jobs.length) {
      const job = jobs[index];
      index += 1;
      await job();
    }
  });
  await Promise.all(workers);
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function ownerMatches(owner: string | undefined, currentOwner: string) {
  const normalizedOwner = normalizeOwner(owner || '');
  const normalizedCurrent = normalizeOwner(currentOwner);
  if (!normalizedOwner || !normalizedCurrent) return false;
  return normalizedOwner === normalizedCurrent || normalizedOwner.split(/[;,，、\s]+/).includes(normalizedCurrent);
}

function normalizeOwner(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function isTerminalStatus(status: string) {
  const normalized = status.trim().toLowerCase();
  return terminalStatusKeywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function isReopenStatus(status: string) {
  const normalized = status.trim().toLowerCase();
  return ['重新打开', '重新处理', 'reopen', 'reopened'].some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function displayTapdBugId(record: TapdDefectRecord) {
  return record.defectId.replace(/^bug_/, '');
}

function buildTapdItemUrl(workspaceId: string, type: TapdWorkType, itemId: string) {
  if (!itemId) return '';
  if (type === 'bug') return `https://www.tapd.cn/${workspaceId}/bugtrace/bugs/view/${itemId}`;
  if (type === 'task') return `https://www.tapd.cn/${workspaceId}/prong/tasks/view/${itemId}`;
  return `https://www.tapd.cn/${workspaceId}/prong/stories/view/${itemId}`;
}

function buildTapdHeaders(settings: AppSettings) {
  return {
    Authorization: buildTapdAuthorization(settings),
    Accept: 'application/json'
  };
}

function buildTapdAuthorization(settings: AppSettings) {
  const authToken = settings.tapdAuthToken.trim();
  if (authToken.toLowerCase().startsWith('bearer ') || authToken.toLowerCase().startsWith('basic ')) return authToken;
  return `Bearer ${authToken}`;
}

function extractTapdUserName(payload: unknown) {
  const data = extractTapdDataArray(payload);
  const candidates = data.length > 0 ? data : [payload];
  for (const candidate of candidates) {
    const raw = normalizeRawUser(candidate);
    const name = stringField(raw, ['name']);
    if (name) return name;
  }
  return '';
}

function extractTapdDataArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as TapdRawRecord;
  if (Array.isArray(record.data)) return record.data;
  if (record.data && typeof record.data === 'object') {
    const dataRecord = record.data as TapdRawRecord;
    if (Array.isArray(dataRecord.items)) return dataRecord.items;
    if (Array.isArray(dataRecord.list)) return dataRecord.list;
    if (Array.isArray(dataRecord.bugs)) return dataRecord.bugs;
    if (Array.isArray(dataRecord.tasks)) return dataRecord.tasks;
    if (Array.isArray(dataRecord.stories)) return dataRecord.stories;
    return [record.data];
  }
  return [];
}

function normalizeRawUser(item: unknown): TapdRawRecord {
  if (!item || typeof item !== 'object') return {};
  const record = item as TapdRawRecord;
  const nested = record.User || record.user;
  if (nested && typeof nested === 'object') return nested as TapdRawRecord;
  return record;
}

function normalizeRawWorkspace(item: unknown): TapdRawRecord {
  if (!item || typeof item !== 'object') return {};
  const record = item as TapdRawRecord;
  const nested = record.Workspace || record.workspace;
  if (nested && typeof nested === 'object') return nested as TapdRawRecord;
  return record;
}

function normalizeRawBug(item: unknown): TapdRawRecord {
  if (!item || typeof item !== 'object') return {};
  const record = item as TapdRawRecord;
  const nested = record.Bug || record.bug || record.Defect || record.defect;
  if (nested && typeof nested === 'object') return nested as TapdRawRecord;
  return record;
}

function normalizeRawTask(item: unknown): TapdRawRecord {
  if (!item || typeof item !== 'object') return {};
  const record = item as TapdRawRecord;
  const nested = record.Task || record.task;
  if (nested && typeof nested === 'object') return nested as TapdRawRecord;
  return record;
}

function normalizeRawStory(item: unknown): TapdRawRecord {
  if (!item || typeof item !== 'object') return {};
  const record = item as TapdRawRecord;
  const nested = record.Story || record.story;
  if (nested && typeof nested === 'object') return nested as TapdRawRecord;
  return record;
}

function stringField(source: TapdRawRecord, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return '';
}

export function importTapdDefectsFromSheet(filePath: string, workspaceId = 'import') {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = sheetToRows(sheet);
  const syncedAt = new Date().toISOString();
  const normalizedWorkspaceId = workspaceId || 'import';

  return rows
    .map((row, index): TapdDefectRecord => {
      const title = pickRowValue(row, ['标题', '缺陷标题', '名称', 'title', 'name', 'summary']);
      const url = pickUrl(row);
      const defectId =
        pickRowValue(row, ['ID', 'Id', 'id', '缺陷ID', '缺陷编号', '编号', 'bug id', 'bug_id']) ||
        extractTapdId(url) ||
        `${index + 1}`;

      return {
        id: `tapd_${normalizedWorkspaceId}_bug_${defectId}`,
        type: 'bug',
        workspaceId: normalizedWorkspaceId,
        workspaceName: pickRowValue(row, ['项目', '项目名称', 'workspace_name', 'project_name']),
        projectId: pickRowValue(row, ['项目ID', '项目 id', 'project_id', 'workspace_id']),
        defectId: `bug_${defectId}`,
        title: title || `TAPD defect ${defectId}`,
        description: pickRowValue(row, ['描述', '详细描述', '缺陷描述', '复现步骤', 'description', 'content', 'steps']),
        status: pickRowValue(row, ['状态', '处理状态', 'status', 'state']) || 'unknown',
        priority: pickRowValue(row, ['优先级', 'priority']),
        severity: pickRowValue(row, ['严重程度', '严重级别', 'severity']),
        assignee: pickRowValue(row, ['处理人', '当前处理人', '负责人', 'current_owner', 'owner', 'handler', 'assignee']),
        reporter: pickRowValue(row, ['创建人', '报告人', 'reporter', 'creator']),
        url,
        raw: { ...row, __source: 'file' },
        createdAt: pickRowValue(row, ['创建时间', 'created', 'created_at', 'create_time']),
        updatedAt: pickRowValue(row, ['更新时间', '修改时间', 'modified', 'updated_at', 'update_time']),
        syncedAt
      };
    })
    .filter((defect) => defect.title && defect.defectId);
}

function sheetToRows(sheet: XLSX.WorkSheet) {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
  const headers: string[] = [];
  for (let col = range.s.c; col <= range.e.c; col += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: col })];
    headers.push(String(cell?.v ?? `Column ${col + 1}`).trim());
  }

  const rows: Array<Record<string, string>> = [];
  for (let rowIndex = range.s.r + 1; rowIndex <= range.e.r; rowIndex += 1) {
    const row: Record<string, string> = {};
    const links: string[] = [];
    let hasValue = false;
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const header = headers[col - range.s.c] || `Column ${col + 1}`;
      const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: col })];
      const value = String(cell?.w ?? cell?.v ?? '').trim();
      if (value) hasValue = true;
      row[header] = value;
      const target = cell?.l?.Target;
      if (target) links.push(String(target));
    }
    if (links.length > 0) row.__links = links.join('\n');
    if (hasValue) rows.push(row);
  }
  return rows;
}

function pickRowValue(row: Record<string, unknown>, keys: string[]) {
  const normalizedKeys = Object.keys(row);
  for (const expected of keys) {
    const match = normalizedKeys.find((key) => key.trim().toLowerCase() === expected.trim().toLowerCase());
    const value = match ? row[match] : undefined;
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }

  if (keys.includes('__links')) {
    const value = row.__links;
    if (typeof value === 'string' && value.trim()) return firstUrl(value) || value.trim();
  }

  return '';
}

function pickUrl(row: Record<string, unknown>) {
  const explicit = pickRowValue(row, ['链接', '详情链接', '缺陷链接', 'url', 'URL', 'link']);
  const explicitUrl = firstUrl(explicit);
  if (explicitUrl) return explicitUrl;
  const linkedTarget = pickRowValue(row, ['__links']);
  const linkedUrl = firstUrl(linkedTarget);
  if (linkedUrl) return linkedUrl;
  return explicit;
}

function firstUrl(value: string) {
  return value.match(/https?:\/\/\S+/)?.[0]?.trim();
}

function extractTapdId(value: string) {
  return value.match(/(?:bug|bugs|defect|defects)[/?#=&_-]*(\d{3,})/i)?.[1] || value.match(/(\d{5,})/)?.[1] || '';
}
