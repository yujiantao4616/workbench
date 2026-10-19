import * as XLSX from 'xlsx';
import type { TapdDefectRecord } from '../../shared/types';

export async function parseTapdDefectFile(file: File, workspaceId: string) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
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
        description: pickRowValue(row, ['详细描述', '描述', '缺陷描述', '复现步骤', 'description', 'content', 'steps']),
        status: pickRowValue(row, ['状态', '处理状态', 'status', 'state']) || 'unknown',
        priority: pickRowValue(row, ['优先级', 'priority']),
        severity: pickRowValue(row, ['严重程度', '严重级别', 'severity']),
        assignee: pickRowValue(row, ['处理人', '当前处理人', '负责人', 'current_owner', 'owner', 'handler', 'assignee']),
        reporter: pickRowValue(row, ['创建人', '报告人', 'reporter', 'creator']),
        url,
        raw: { ...row, __source: 'file' },
        createdAt: pickRowValue(row, ['创建时间', 'created', 'created_at', 'create_time']),
        updatedAt: pickRowValue(row, ['最后修改时间', '更新时间', '修改时间', 'modified', 'updated_at', 'update_time']),
        syncedAt
      };
    })
    .filter((defect) => defect.defectId && defect.title);
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
  const rowKeys = Object.keys(row);
  for (const expected of keys) {
    const match = rowKeys.find((key) => key.trim().toLowerCase() === expected.trim().toLowerCase());
    const value = match ? row[match] : undefined;
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return '';
}

function pickUrl(row: Record<string, unknown>) {
  const explicit = pickRowValue(row, ['链接', '详情链接', '缺陷链接', '项目链接', 'url', 'URL', 'link']);
  const explicitUrl = firstUrl(explicit);
  if (explicitUrl) return explicitUrl;
  const links = pickRowValue(row, ['__links']);
  return firstUrl(links) || explicit;
}

function firstUrl(value: string) {
  return value.match(/https?:\/\/\S+/)?.[0]?.trim() || '';
}

function extractTapdId(value: string) {
  return value.match(/(?:bug|bugs|defect|defects)[/?#=&_-]*(\d{3,})/i)?.[1] || value.match(/(\d{5,})/)?.[1] || '';
}
