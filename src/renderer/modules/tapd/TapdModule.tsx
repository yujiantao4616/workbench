import { useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import clsx from 'clsx';
import { Bug, CheckSquare, ClipboardList, ExternalLink, FileSpreadsheet, Loader2, RefreshCw, Search, Sparkles, Trash2, X } from 'lucide-react';
import { Button, SectionTitle } from '../../components/ui';
import { priorityClass, taskStatusLabel, workItemStatusLabel } from '../../lib/workflow';
import { parseTapdDefectFile } from '../../lib/tapdImport';
import type {
  ProjectRecord,
  TapdDefectRecord,
  TaskPriority,
  TaskRecord,
  WorkItemRecord
} from '../../../shared/types';

export function TapdModule({
  defects,
  projects,
  workItems,
  tasks,
  onSyncBugs,
  onImportFile,
  onDeleteDefects,
  onSendToPrompt,
  onOpenExternal,
  onOpenSettings,
  isBusy
}: {
  defects: TapdDefectRecord[];
  projects: ProjectRecord[];
  workItems: WorkItemRecord[];
  tasks: TaskRecord[];
  onSyncBugs: () => Promise<{ syncedCount: number; currentOwner: string; workspaceCount?: number; warning?: string }>;
  onImportFile: (defects: TapdDefectRecord[]) => Promise<number>;
  onDeleteDefects: (ids: string[]) => Promise<void>;
  onSendToPrompt: (input: { defectIds: string[]; projectId: string }) => Promise<void>;
  onOpenExternal: (url: string) => void;
  onOpenSettings: () => void;
  isBusy: boolean;
}) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TapdDefectRecord['type'] | ''>('');
  const [statusFilter, setStatusFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendProjectId, setSendProjectId] = useState(projects[0]?.id || '');
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const autoSyncStartedRef = useRef(false);
  const linkedByDefectId = useMemo(() => buildLinkedDefectMap(workItems, tasks), [tasks, workItems]);
  const statusOptions = useMemo(
    () =>
      Array.from(new Set(defects.map((defect) => defect.status).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'zh-Hans-CN')
      ),
    [defects]
  );
  const visibleDefects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const normalizedAssignee = assigneeFilter.trim().toLowerCase();
    return defects
      .filter((defect) => {
        if (typeFilter && (defect.type || 'bug') !== typeFilter) return false;
        if (statusFilter && defect.status !== statusFilter) return false;
        if (normalizedAssignee && !defect.assignee?.toLowerCase().includes(normalizedAssignee)) return false;
        if (!normalizedQuery) return true;
        return [defect.defectId, defect.title, defect.description, defect.status, defect.priority, defect.severity, defect.assignee]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => (b.updatedAt || b.syncedAt).localeCompare(a.updatedAt || a.syncedAt));
  }, [assigneeFilter, defects, query, statusFilter, typeFilter]);
  const typeCounts = useMemo(() => ({
    bug: defects.filter((item) => (item.type || 'bug') === 'bug').length,
    task: defects.filter((item) => item.type === 'task').length,
    story: defects.filter((item) => item.type === 'story').length
  }), [defects]);
  const selectedDefects = defects.filter((defect) => selectedIds.includes(defect.id));
  const visibleSelectedDefects = visibleDefects.filter((defect) => selectedIds.includes(defect.id));
  const hiddenSelectedCount = selectedDefects.length - visibleSelectedDefects.length;
  const selectedTypeCounts = useMemo(() => ({
    bug: visibleSelectedDefects.filter((item) => (item.type || 'bug') === 'bug').length,
    task: visibleSelectedDefects.filter((item) => item.type === 'task').length,
    story: visibleSelectedDefects.filter((item) => item.type === 'story').length
  }), [visibleSelectedDefects]);
  const promptableSelectedDefects = visibleSelectedDefects.filter((defect) => !linkedByDefectId.get(defect.defectId));
  const canSend = promptableSelectedDefects.length > 0 && projects.length > 0;

  useEffect(() => {
    if (autoSyncStartedRef.current) return;
    autoSyncStartedRef.current = true;
    void syncBugs({ silent: true });
  }, []);

  function toggleDefect(defect: TapdDefectRecord) {
    setSelectedIds((value) => (value.includes(defect.id) ? value.filter((id) => id !== defect.id) : [...value, defect.id]));
  }

  function toggleAll() {
    const allSelected = visibleDefects.length > 0 && visibleDefects.every((defect) => selectedIds.includes(defect.id));
    const visibleIds = new Set(visibleDefects.map((defect) => defect.id));
    setSelectedIds((value) => (
      allSelected
        ? value.filter((id) => !visibleIds.has(id))
        : Array.from(new Set([...value, ...visibleDefects.map((defect) => defect.id)]))
    ));
  }

  async function sendToPrompt() {
    const projectId = sendProjectId || projects[0]?.id;
    if (!canSend || !projectId) return;
    await onSendToPrompt({ defectIds: promptableSelectedDefects.map((defect) => defect.id), projectId });
    setSelectedIds([]);
    setSendDialogOpen(false);
  }

  async function deleteSelected() {
    if (selectedIds.length === 0) return;
    await onDeleteDefects(selectedIds);
    setSelectedIds([]);
      setImportMessage(`已删除 ${selectedIds.length} 条本地 TAPD 工作记录。`);
  }

  async function syncBugs(options: { silent?: boolean } = {}) {
    setSyncing(true);
    if (!options.silent) setImportMessage('正在同步 TAPD My Work...');
    try {
      const result = await onSyncBugs();
      setImportMessage(
        `已同步 ${result.syncedCount} 条待办，用户=${result.currentOwner}，项目=${result.workspaceCount ?? '-'}。${result.warning ? ` 部分失败：${result.warning}` : ''}`
      );
      setSelectedIds([]);
    } catch (error) {
      setImportMessage(`同步失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSyncing(false);
    }
  }

  async function importSelectedFile(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    setImportMessage(`正在解析 ${file.name}...`);
    try {
      const importedDefects = await parseTapdDefectFile(file, 'import');
      if (importedDefects.length === 0) {
        setImportMessage(`没有从 ${file.name} 解析到缺陷。请确认第一行是表头，且包含标题或 ID。`);
        return;
      }
      const importedCount = await onImportFile(importedDefects);
      setImportMessage(`已导入 ${importedCount} 条缺陷：${file.name}`);
      setSelectedIds([]);
    } catch (error) {
      setImportMessage(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-md border border-md-outline/20 bg-md-surface">
      <div className="border-b border-md-outline/20 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <SectionTitle icon={ClipboardList} title="TAPD My Work" />
            <h2 className="text-lg font-semibold text-md-text">我的工作</h2>
            <p className="mt-1 text-xs text-md-muted">
              跨项目同步我负责的未完成缺陷、任务和需求；也可以导入 TAPD 导出的 Excel/CSV 作为补充。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="tonal" onClick={() => void syncBugs()} disabled={isBusy || syncing || importing}>
              {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              {syncing ? 'Syncing' : 'Sync'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".xlsx,.xls,.csv"
              onChange={(event) => void importSelectedFile(event.currentTarget.files?.[0])}
            />
            <Button variant="tonal" onClick={() => fileInputRef.current?.click()} disabled={isBusy || importing || syncing}>
              {importing ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
              {importing ? 'Importing' : 'Import'}
            </Button>
            <Button variant="tonal" onClick={onOpenSettings}>
              Settings
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex gap-2 text-xs font-semibold text-md-muted">
            <TypeFilterChip label="缺陷" count={typeCounts.bug} type="bug" activeType={typeFilter} onToggle={setTypeFilter} />
            <TypeFilterChip label="任务" count={typeCounts.task} type="task" activeType={typeFilter} onToggle={setTypeFilter} />
            <TypeFilterChip label="需求" count={typeCounts.story} type="story" activeType={typeFilter} onToggle={setTypeFilter} />
          </div>
          <div className="flex h-11 min-w-[280px] flex-1 items-center gap-2 rounded-md border border-md-outline/20 bg-md-surfaceContainer px-3">
            <Search size={16} className="text-md-muted" />
            <input
              className="h-full flex-1 bg-transparent text-sm text-md-text outline-none placeholder:text-md-muted"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索 ID、标题、状态、处理人"
            />
          </div>
          <select className="field-input h-11 max-w-[180px]" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">All status</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <input
            className="field-input h-11 max-w-[220px]"
            value={assigneeFilter}
            onChange={(event) => setAssigneeFilter(event.target.value)}
            placeholder="处理人包含"
          />
          {(typeFilter || statusFilter || assigneeFilter) ? (
            <Button
              variant="tonal"
              onClick={() => {
                setTypeFilter('');
                setStatusFilter('');
                setAssigneeFilter('');
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
        {importMessage ? (
          <div className="mt-3 rounded-md bg-md-surfaceContainer px-3 py-2 text-xs text-md-muted">
            {importMessage}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-md-surfaceContainer/35 p-4">
        <div className="mb-3 flex items-center justify-between rounded-md bg-md-surface px-3 py-2">
          <button type="button" className="inline-flex items-center gap-2 text-sm font-semibold text-md-text" onClick={toggleAll}>
            <CheckSquare size={16} />
            {visibleSelectedDefects.length > 0 ? `${visibleSelectedDefects.length} selected` : `${visibleDefects.length} records`}
          </button>
          <span className="text-xs text-md-muted">
            当前筛选内：缺陷 {selectedTypeCounts.bug} / 任务 {selectedTypeCounts.task} / 需求 {selectedTypeCounts.story}
            {hiddenSelectedCount > 0 ? `，筛选外另有 ${hiddenSelectedCount} 个已选` : ''}
          </span>
        </div>

        <div className="space-y-2">
          {visibleDefects.length === 0 ? (
            <div className="rounded-md bg-md-surface p-6 text-center text-sm text-md-muted">
              没有符合条件的 TAPD 工作记录。可以 Sync 或 Import TAPD 导出的 Excel/CSV。
            </div>
          ) : null}
          {visibleDefects.map((defect) => {
            const linkedStatus = linkedByDefectId.get(defect.defectId);
            const selected = selectedIds.includes(defect.id);
            const locked = Boolean(linkedStatus);
            return (
              <button
                key={defect.id}
                type="button"
                className={clsx(
                  'w-full rounded-md border p-3 text-left transition',
                  selected ? 'border-md-primary bg-md-surfaceContainerHigh' : 'border-md-outline/15 bg-md-surface hover:bg-md-surfaceContainer',
                  locked && 'opacity-70'
                )}
                onClick={() => toggleDefect(defect)}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={clsx(
                      'mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                      selected ? 'border-md-primary bg-md-primary text-md-onPrimary' : 'border-md-outline/50'
                    )}
                  >
                    {selected ? '✓' : ''}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-md-surfaceContainer px-2 py-0.5 text-xs font-semibold text-md-muted  inline-flex items-center gap-1">
                        {tapdTypeIcon(defect.type)} {tapdTypeLabel(defect.type)}
                      </span>
                      <span className="text-xs font-semibold text-md-muted">#{displayTapdId(defect)}</span>
                      <span className="rounded-full bg-md-surfaceContainer px-2 py-0.5 text-xs font-semibold text-md-muted">{defect.status}</span>
                      {linkedStatus ? (
                        <span className="rounded-full bg-md-primary px-2 py-0.5 text-xs font-semibold text-md-onPrimary">
                          Local {linkedStatus}
                        </span>
                      ) : null}
                    </div>
                    <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-md-text">{defect.title}</h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-md-muted">{cleanTapdText(defect.description) || 'No TAPD description'}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-md-muted">
                      <span>{defect.workspaceName || defect.workspaceId}</span>
                      <span>Owner: {defect.assignee || 'unknown'}</span>
                      <span>Updated: {defect.updatedAt || defect.syncedAt}</span>
                      <span className={clsx('rounded-full px-2 py-0.5 font-semibold', priorityClass(priorityFromTapd(defect.priority, defect.severity)))}>
                        {defect.priority || defect.severity || 'medium'}
                      </span>
                      {defect.url ? (
                        <span
                          role="button"
                          tabIndex={0}
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold text-md-primary hover:bg-md-surfaceContainer"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenExternal(defect.url!);
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;
                            event.stopPropagation();
                            onOpenExternal(defect.url!);
                          }}
                        >
                          <ExternalLink size={12} />
                          TAPD
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-md-outline/20 bg-md-surface px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-md-muted">
            {visibleSelectedDefects.length > 0
              ? `当前筛选内已选择 ${visibleSelectedDefects.length} 个：缺陷 ${selectedTypeCounts.bug} / 任务 ${selectedTypeCounts.task} / 需求 ${selectedTypeCounts.story}，${promptableSelectedDefects.length} 个可进入 Prompt。${hiddenSelectedCount > 0 ? `筛选外还有 ${hiddenSelectedCount} 个已选。` : ''}`
              : '多选 TAPD 工作记录后可批量删除，未关联的记录可进入 Prompt。'}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="tonal" disabled={selectedIds.length === 0 || isBusy || importing} onClick={() => void deleteSelected()}>
              <Trash2 size={16} />
              Delete selected
            </Button>
            <Button disabled={!canSend || isBusy || importing} onClick={() => setSendDialogOpen(true)}>
              <Sparkles size={16} />
              Send to Prompt
            </Button>
          </div>
        </div>
      </div>
      <Dialog.Root open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content w-[min(520px,calc(100vw-32px))]">
            <Dialog.Close asChild>
              <button
                type="button"
                className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-md-muted transition hover:bg-md-surfaceContainer hover:text-md-text"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </Dialog.Close>
            <Dialog.Title className="text-lg font-semibold text-md-text">关联项目并流转到 Prompt</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-6 text-md-muted">
              选择这些 TAPD 工作记录对应的本地项目。确认后会创建日历工作记录、Prompt 会话和关联 issue。
            </Dialog.Description>
            <div className="dialog-body space-y-4">
              <label className="block">
                <span className="field-label">Project</span>
                <select
                  className="field-input h-11"
                  value={sendProjectId || projects[0]?.id || ''}
                  onChange={(event) => setSendProjectId(event.target.value)}
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rounded-md bg-md-surfaceContainer px-3 py-2 text-sm text-md-muted">
                已选择 {promptableSelectedDefects.length} 个未关联记录。已关联过本地任务的记录不会重复发送。
              </div>
            </div>
            <div className="dialog-footer flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button variant="tonal">Cancel</Button>
              </Dialog.Close>
              <Button disabled={!canSend || isBusy || importing} onClick={() => void sendToPrompt()}>
                <Sparkles size={16} />
                Create Prompt
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}

function buildLinkedDefectMap(workItems: WorkItemRecord[], tasks: TaskRecord[]) {
  const result = new Map<string, string>();
  for (const item of workItems) {
    for (const source of item.externalSources || []) {
      if (source.provider !== 'tapd') continue;
      const linkedTask =
        (item.taskId ? tasks.find((task) => task.id === item.taskId) : undefined) ??
        (item.conversationId ? tasks.find((task) => task.conversationId === item.conversationId) : undefined);
      result.set(source.defectId, linkedTask ? taskStatusLabel(linkedTask.status) : workItemStatusLabel(item.status));
    }
  }
  return result;
}

function priorityFromTapd(priority?: string, severity?: string): TaskPriority {
  const value = `${priority || ''} ${severity || ''}`.toLowerCase();
  if (/high|urgent|严重|紧急|高|p0|p1/.test(value)) return 'high';
  if (/low|低|p3|p4/.test(value)) return 'low';
  return 'medium';
}

function TypeFilterChip({
  label,
  count,
  type,
  activeType,
  onToggle
}: {
  label: string;
  count: number;
  type: NonNullable<TapdDefectRecord['type']>;
  activeType: TapdDefectRecord['type'] | '';
  onToggle: (type: TapdDefectRecord['type'] | '') => void;
}) {
  const active = activeType === type;
  return (
    <button
      type="button"
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-2 transition',
        active
          ? 'bg-md-primary text-md-onPrimary shadow-sm'
          : 'bg-md-surfaceContainer text-md-muted hover:bg-md-surfaceContainerHigh'
      )}
      onClick={() => onToggle(active ? '' : type)}
    >
      <span>{label}</span>
      <span className={clsx('text-sm font-bold', active ? 'text-md-onPrimary' : 'text-md-text')}>{count}</span>
    </button>
  );
}

function tapdTypeLabel(type?: TapdDefectRecord['type']) {
  if (type === 'task') return 'Task';
  if (type === 'story') return 'Story';
  return 'Bug';
}

function tapdTypeIcon(type?: TapdDefectRecord['type']) {
  const Icon = type === 'task' ? CheckSquare : type === 'story' ? ClipboardList : Bug;
  return <Icon size={12} aria-hidden />;
}

function displayTapdId(record: TapdDefectRecord) {
  return record.defectId.replace(/^(bug|task|story)_/, '');
}

function cleanTapdText(value?: string) {
  return (value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
