import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as ContextMenu from '@radix-ui/react-context-menu';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Select from '@radix-ui/react-select';
import clsx from 'clsx';
import {
  Bot,
  Brain,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Columns3,
  FilePlus2,
  FolderOpen,
  GitBranch,
  Loader2,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Trash2,
  X
} from 'lucide-react';
import { api } from '../../lib/api';
import { Button, IconButton, SectionTitle } from '../../components/ui';
import { promptAttachmentBlock, pastedImageAttachments } from '../../lib/attachments';
import {
  addDays,
  applyThemeColor,
  buildMemoryCandidate,
  dateKey,
  executorRank,
  feedbackDisplay,
  formatCalendarLabel,
  formatDate,
  formatDuration,
  memoryBelongsToProject,
  memoryOwnerLabel,
  memorySummary,
  priorityClass,
  projectStack,
  runResultSummary,
  startOfNaturalWeek,
  taskColumns,
  taskStatusLabel,
  workItemEffectiveStatus,
  workItemStatusLabel,
  weekOfYearSunday
} from '../../lib/workflow';
import type {
  AgentRecord,
  AppSettings,
  AppState,
  CodexHealthResult,
  ConversationRecord,
  ExecutorRunRecord,
  GitBranchInfoResult,
  MemoryRecord,
  MemoryScope,
  ProjectRecord,
  PromptAttachment,
  SaveMemoryInput,
  TaskGroupRecord,
  TaskPriority,
  TaskRecord,
  TaskStatus,
  WorkItemRecord,
  WorkflowModule
} from '../../../shared/types';

import { TaskCard } from './TaskCard';

export function KanbanModule({
  tasks,
  workItems,
  taskGroups,
  projects,
  runs,
  selectedProject,
  selectedTaskGroupId,
  scope,
  onScopeChange,
  onSelectGroup,
  onMoveGroupToReady,
  onAddProjectToGroup,
  onOpenExecutor,
  onStatus,
  onScheduleTask,
  onCreateWorkItem,
  onUpdateWorkItem,
  onDeleteWorkItem,
  onGenerateWeeklyReport,
  isBusy,
  onOpenWorkItem,
  onOpenTaskExecutor,
  onOpenToday,
  onDeleteTask,
  onDeleteTaskGroup
}: {
  tasks: TaskRecord[];
  workItems: WorkItemRecord[];
  taskGroups: TaskGroupRecord[];
  projects: ProjectRecord[];
  runs: ExecutorRunRecord[];
  selectedProject?: ProjectRecord;
  selectedTaskGroupId?: string;
  scope: 'all' | 'current';
  onScopeChange: (scope: 'all' | 'current') => void;
  onSelectGroup: (groupId: string) => void;
  onMoveGroupToReady: (groupId: string) => void;
  onAddProjectToGroup: (groupId: string, projectId: string) => void;
  onOpenExecutor: (groupId: string) => void;
  onStatus: (taskId: string, status: TaskStatus) => void;
  onScheduleTask: (taskId: string, scheduledFor?: string) => void;
  onCreateWorkItem: (input: { title: string; notes?: string; priority?: TaskPriority; scheduledFor?: string; projectId?: string }) => void;
  onUpdateWorkItem: (input: Partial<WorkItemRecord> & { id: string }) => void;
  onDeleteWorkItem: (id: string) => void | Promise<void>;
  onGenerateWeeklyReport: (input: { since: string; until: string }) => Promise<string | undefined>;
  isBusy: boolean;
  onOpenWorkItem: (item: WorkItemRecord) => void;
  onOpenTaskExecutor: (taskId: string) => void;
  onOpenToday: () => void;
  onDeleteTask: (taskId: string) => void;
  onDeleteTaskGroup: (groupId: string) => void;
}) {
  const [distributionProjectId, setDistributionProjectId] = useState('');
  const [newWorkTitle, setNewWorkTitle] = useState('');
  const [newWorkDate, setNewWorkDate] = useState(dateKey(new Date()));
  const [newWorkPriority, setNewWorkPriority] = useState<TaskPriority>('medium');
  const [newWorkNotes, setNewWorkNotes] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [weekStart, setWeekStart] = useState(() => startOfNaturalWeek(new Date()));
  const [weeklyReportDraft, setWeeklyReportDraft] = useState('');
  const [weeklyReportOpen, setWeeklyReportOpen] = useState(false);
  const [editingWorkItemId, setEditingWorkItemId] = useState<string>();
  const [editingDraft, setEditingDraft] = useState<{
    title: string;
    notes: string;
    scheduledFor: string;
    priority: TaskPriority;
  }>();
  const [draftSaved, setDraftSaved] = useState(false);
  const [flowDialogStatus, setFlowDialogStatus] = useState<TaskStatus | 'all'>();
  const visibleTasks = scope === 'current' && selectedProject ? tasks.filter((task) => task.projectId === selectedProject.id) : tasks;
  const visibleGroups = taskGroups
    .map((group) => {
      const groupTasks = visibleTasks.filter((task) => task.groupId === group.id);
      return { group, tasks: groupTasks };
    })
    .filter((item) => item.tasks.length > 0)
    .slice(0, 5);
  const selectedGroup = taskGroups.find((group) => group.id === selectedTaskGroupId) ?? visibleGroups[0]?.group;
  const selectedGroupTasks = selectedGroup ? visibleTasks.filter((task) => task.groupId === selectedGroup.id) : [];
  const groupCounts = taskColumns.map((column) => ({
    ...column,
    count: selectedGroupTasks.filter((task) => task.status === column.id).length
  }));
  const canMoveGroup = selectedGroupTasks.some((task) => ['inbox', 'blocked'].includes(task.status));
  const distributableProjects = selectedGroup
    ? projects.filter((project) => !tasks.some((task) => task.groupId === selectedGroup.id && task.projectId === project.id))
    : [];
  const selectedDistributionProjectId = distributionProjectId || distributableProjects[0]?.id || '';
  const calendarDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const openTasks = visibleTasks.filter((task) => task.status !== 'done');
  const flowTasks = flowDialogStatus && flowDialogStatus !== 'all'
    ? tasks.filter((task) => task.status === flowDialogStatus)
    : tasks;
  const priorityGroups: Array<{ id: 'high' | 'medium' | 'low'; label: string }> = [
    { id: 'high', label: 'High' },
    { id: 'medium', label: 'Medium' },
    { id: 'low', label: 'Low' }
  ];
  const editingWorkItem = workItems.find((item) => item.id === editingWorkItemId);
  const weeklyReportRange = {
    since: calendarDays[0].toISOString(),
    until: addDays(calendarDays[6], 1).toISOString()
  };
  const weeklyReportStorageKey = `weekly-report:${dateKey(calendarDays[0])}:${dateKey(calendarDays[6])}`;
  const weeklyIssueCount = tasks.filter((task) => {
    const scheduledKey = task.scheduledFor;
    const createdKey = dateKey(new Date(task.createdAt));
    const updatedKey = dateKey(new Date(task.updatedAt));
    const startKey = dateKey(calendarDays[0]);
    const endKey = dateKey(calendarDays[6]);
    return [scheduledKey, createdKey, updatedKey].some((value) => Boolean(value && value >= startKey && value <= endKey));
  }).length;

  useEffect(() => {
    if (!editingWorkItem) {
      setEditingDraft(undefined);
      setDraftSaved(false);
      return;
    }
    setEditingDraft({
      title: editingWorkItem.title,
      notes: editingWorkItem.notes,
      scheduledFor: editingWorkItem.scheduledFor || '',
      priority: editingWorkItem.priority
    });
    setDraftSaved(false);
  }, [editingWorkItem?.id]);

  function saveEditingDraft(item: WorkItemRecord) {
    if (!editingDraft?.title.trim()) return;
    onUpdateWorkItem({
      id: item.id,
      title: editingDraft.title.trim(),
      notes: editingDraft.notes,
      scheduledFor: editingDraft.scheduledFor || undefined,
      priority: editingDraft.priority
    });
  }

  function createQuickWorkItem() {
    const title = newWorkTitle.trim();
    if (!title) return;
    onCreateWorkItem({
      title,
      notes: newWorkNotes.trim() || undefined,
      priority: newWorkPriority,
      scheduledFor: newWorkDate || undefined
    });
    setNewWorkTitle('');
    setNewWorkNotes('');
    setCreateDialogOpen(false);
  }

  async function buildCalendarWeeklyReport({ force = false }: { force?: boolean } = {}) {
    if (weeklyIssueCount === 0) {
      setWeeklyReportDraft('本周没有工作内容。');
      setWeeklyReportOpen(true);
      return;
    }

    if (!force) {
      const cached = window.localStorage.getItem(weeklyReportStorageKey);
      if (cached) {
        setWeeklyReportDraft(cached);
        setWeeklyReportOpen(true);
        return;
      }
    }

    const report = await onGenerateWeeklyReport(weeklyReportRange);
    if (report) {
      window.localStorage.setItem(weeklyReportStorageKey, report);
      setWeeklyReportDraft(report);
      setWeeklyReportOpen(true);
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-3">
      <section className="flex min-h-0 flex-1 flex-col rounded-md bg-md-surfaceContainer p-3 pb-0">
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
          <div>
            <SectionTitle icon={CalendarDays} title="Global Calendar" />
            <h2 className="text-lg font-semibold text-md-text">
              {weekStart.getFullYear()} 第 {weekOfYearSunday(weekStart)} 周
            </h2>
            <p className="text-xs text-md-muted">
              {dateKey(calendarDays[0])} - {dateKey(calendarDays[6])}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="tonal" onClick={() => setFlowDialogStatus('all')}>
              <Columns3 size={16} />
              Flow
            </Button>
            <Button variant="tonal" onClick={() => void buildCalendarWeeklyReport()} disabled={isBusy}>
              <ClipboardList size={16} />
              Weekly Report
            </Button>
            <IconButton title="Previous week" onClick={() => setWeekStart((value) => addDays(value, -7))}>
              <ChevronLeft />
            </IconButton>
            <Button
              variant="tonal"
              onClick={() => {
                setWeekStart(startOfNaturalWeek(new Date()));
                onOpenToday();
              }}
            >
              Today
            </Button>
            <IconButton title="Next week" onClick={() => setWeekStart((value) => addDays(value, 7))}>
              <ChevronRight />
            </IconButton>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-x-auto">
          <div className="grid h-full min-w-[2100px] grid-cols-7 gap-3">
            {calendarDays.map((day) => {
              const key = dateKey(day);
              const dayWorkItems = workItems
                .filter((item) => item.scheduledFor === key)
                .sort((a, b) => {
                  const statusA = workItemEffectiveStatus(a, tasks);
                  const statusB = workItemEffectiveStatus(b, tasks);
                  if (statusA === 'done' && statusB !== 'done') return 1;
                  if (statusA !== 'done' && statusB === 'done') return -1;
                  return priorityGroups.findIndex((item) => item.id === a.priority) - priorityGroups.findIndex((item) => item.id === b.priority);
                });
              return (
                <div key={key} className="flex min-h-0 min-w-[300px] flex-col rounded-md bg-md-surface p-3">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-md-text">{formatCalendarLabel(day)}</h3>
                      <p className="text-xs text-md-muted">{key}</p>
                    </div>
                    <span className="rounded-full bg-md-surfaceContainer px-2 py-0.5 text-xs font-semibold text-md-muted">
                      {dayWorkItems.length}
                    </span>
                  </div>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                    {dayWorkItems.map((item) => {
                      const effectiveStatus = workItemEffectiveStatus(item, tasks);
                      const isDone = effectiveStatus === 'done';
                      return (
                        <ContextMenu.Root key={item.id}>
                          <ContextMenu.Trigger asChild>
                            <button
                              type="button"
                              className={clsx(
                                'w-full rounded-md border border-md-outline/20 bg-md-surfaceContainerHigh p-3 text-left transition hover:border-md-primary/50 hover:bg-md-surfaceContainer',
                                isDone && 'opacity-70'
                              )}
                              onClick={() => {
                                if (!isDone && !item.conversationId && !item.taskId && !item.notes.trim()) {
                                  setEditingWorkItemId(item.id);
                                  return;
                                }
                                onOpenWorkItem(item);
                              }}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <h4 className={clsx('line-clamp-3 text-sm font-semibold text-md-text', isDone && 'line-through')}>
                                    {item.title}
                                  </h4>
                                  <p className="mt-1 truncate text-xs text-md-muted">
                                    {item.projectId ? projects.find((project) => project.id === item.projectId)?.name : 'No project yet'}
                                  </p>
                                  <p className="mt-1 text-xs text-md-muted">{workItemStatusLabel(effectiveStatus)}</p>
                                </div>
                                <span className={clsx('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', priorityClass(item.priority))}>
                                  {item.priority}
                                </span>
                              </div>
                            </button>
                          </ContextMenu.Trigger>
                          <ContextMenu.Portal>
                            <ContextMenu.Content className="menu-surface w-40">
                              <ContextMenu.Item className="menu-item" onClick={() => setEditingWorkItemId(item.id)}>
                                Edit
                              </ContextMenu.Item>
                              {!isDone ? (
                                <ContextMenu.Item className="menu-item" onClick={() => onUpdateWorkItem({ id: item.id, status: 'done' })}>
                                  Mark done
                                </ContextMenu.Item>
                              ) : null}
                              <ContextMenu.Item
                                className="menu-item text-red-600"
                                onClick={() => {
                                  if (window.confirm(`删除工作记录 "${item.title}"？`)) {
                                    void onDeleteWorkItem(item.id);
                                  }
                                }}
                              >
                                Delete
                              </ContextMenu.Item>
                            </ContextMenu.Content>
                          </ContextMenu.Portal>
                        </ContextMenu.Root>
                    );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <Dialog.Root open={Boolean(editingWorkItem)} onOpenChange={(open) => !open && setEditingWorkItemId(undefined)}>
        <Dialog.Portal>
          {editingWorkItem ? (
            <Dialog.Content className="dialog-content dialog-content-wide" key={editingWorkItem.id}>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-md-muted transition hover:bg-md-surfaceContainer hover:text-md-text"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </Dialog.Close>
              <Dialog.Title className="text-base font-semibold text-md-text">Edit work item</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-md-muted">
                关闭不会保存或流转。保存草稿只更新记录，Next 会保存后进入下一步流转。
              </Dialog.Description>
              <div className="dialog-body space-y-3">
                <label className="field-label">Title</label>
                <input
                  className="field-input h-10"
                  value={editingDraft?.title || ''}
                  onChange={(event) => {
                    setDraftSaved(false);
                    setEditingDraft((draft) => draft ? { ...draft, title: event.target.value } : draft);
                  }}
                />
                <label className="field-label">Notes</label>
                <textarea
                  className="field-textarea min-h-[240px]"
                  value={editingDraft?.notes || ''}
                  onChange={(event) => {
                    setDraftSaved(false);
                    setEditingDraft((draft) => draft ? { ...draft, notes: event.target.value } : draft);
                  }}
                  placeholder="补充上下文，周报素材，或者后续要澄清的问题"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    className="field-input h-10"
                    value={editingDraft?.scheduledFor || ''}
                    onChange={(event) => {
                      setDraftSaved(false);
                      setEditingDraft((draft) => draft ? { ...draft, scheduledFor: event.target.value } : draft);
                    }}
                  />
                  <select
                    className="field-input h-10"
                    value={editingDraft?.priority || editingWorkItem.priority}
                    onChange={(event) => {
                      setDraftSaved(false);
                      setEditingDraft((draft) => draft ? { ...draft, priority: event.target.value as TaskPriority } : draft);
                    }}
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
              <div className="dialog-footer flex justify-between gap-2">
                <Button
                  variant="text"
                  onClick={async () => {
                    if (!window.confirm(`删除工作记录 "${editingWorkItem.title}"？`)) return;
                    await onDeleteWorkItem(editingWorkItem.id);
                    setEditingWorkItemId(undefined);
                  }}
                >
                  <Trash2 size={16} />
                  Delete
                </Button>
                <div className="flex gap-2">
                  {draftSaved ? <span className="self-center text-xs font-medium text-emerald-700">Draft saved</span> : null}
                  <Button
                    variant="tonal"
                    disabled={!editingDraft?.title.trim()}
                    onClick={() => {
                      saveEditingDraft(editingWorkItem);
                      setDraftSaved(true);
                    }}
                  >
                    Save Draft
                  </Button>
                  <Button
                    disabled={!editingDraft?.title.trim()}
                    onClick={() => {
                      saveEditingDraft(editingWorkItem);
                      const nextItem = {
                        ...editingWorkItem,
                        title: editingDraft?.title.trim() || editingWorkItem.title,
                        notes: editingDraft?.notes ?? editingWorkItem.notes,
                        scheduledFor: editingDraft?.scheduledFor || undefined,
                        priority: editingDraft?.priority || editingWorkItem.priority
                      };
                      setEditingWorkItemId(undefined);
                      onOpenWorkItem(nextItem);
                    }}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </Dialog.Content>
          ) : null}
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <Dialog.Trigger asChild>
          <button
            type="button"
            className="absolute bottom-5 right-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-md-primary text-md-onPrimary shadow-lg transition hover:brightness-95"
            title="快速记录工作"
          >
            <Plus size={24} />
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Close asChild>
              <button
                type="button"
                className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-md-muted transition hover:bg-md-surfaceContainer hover:text-md-text"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </Dialog.Close>
            <Dialog.Title className="text-base font-semibold text-md-text">快速记录工作</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-md-muted">
              先记录工作安排，之后再选择项目并流转到 Prompt。
            </Dialog.Description>
            <div className="dialog-body space-y-3">
              <input
                className="field-input h-11"
                value={newWorkTitle}
                onChange={(event) => setNewWorkTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) createQuickWorkItem();
                }}
                placeholder="工作标题"
              />
              <textarea
                className="field-textarea min-h-[100px]"
                value={newWorkNotes}
                onChange={(event) => setNewWorkNotes(event.target.value)}
                placeholder="备注、周报素材、后续要确认的问题"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  className="field-input h-10"
                  value={newWorkDate}
                  onChange={(event) => setNewWorkDate(event.target.value)}
                />
                <select
                  className="field-input h-10"
                  value={newWorkPriority}
                  onChange={(event) => setNewWorkPriority(event.target.value as TaskPriority)}
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>
            <div className="dialog-footer flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button variant="tonal">Cancel</Button>
              </Dialog.Close>
              <Button onClick={createQuickWorkItem} disabled={!newWorkTitle.trim()}>
                <Plus size={17} />
                Add
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={weeklyReportOpen}
        onOpenChange={(open) => {
          setWeeklyReportOpen(open);
          if (!open) setWeeklyReportDraft('');
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content dialog-content-wide">
            <Dialog.Close asChild>
              <button
                type="button"
                className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-md-muted transition hover:bg-md-surfaceContainer hover:text-md-text"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </Dialog.Close>
            <Dialog.Title className="text-base font-semibold text-md-text">本周工作周报</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-md-muted">
              Codex 会根据本周任务、项目状态、执行结果和提交记录生成精简总结。
            </Dialog.Description>
            <div className="dialog-body">
              <textarea
                className="field-textarea min-h-[460px] font-mono text-sm"
                value={weeklyReportDraft}
                onChange={(event) => setWeeklyReportDraft(event.target.value)}
              />
            </div>
            <div className="dialog-footer flex flex-wrap justify-end gap-2">
              <Button
                variant="tonal"
                disabled={isBusy || weeklyIssueCount === 0}
                onClick={() => void buildCalendarWeeklyReport({ force: true })}
              >
                <RefreshCw size={16} />
                Regenerate
              </Button>
              <Button
                variant="tonal"
                onClick={() => void navigator.clipboard.writeText(weeklyReportDraft)}
              >
                Copy
              </Button>
              <Dialog.Close asChild>
                <Button>Done</Button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={Boolean(flowDialogStatus)} onOpenChange={(open) => !open && setFlowDialogStatus(undefined)}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content dialog-content-wide">
            <Dialog.Close asChild>
              <button
                type="button"
                className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-md-muted transition hover:bg-md-surfaceContainer hover:text-md-text"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </Dialog.Close>
            <div className="dialog-header flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="text-base font-semibold text-md-text">全局流程快照</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-md-muted">
                  按流程状态集中查看所有项目 issue，点击任务进入对应 Executor。
                </Dialog.Description>
              </div>
              <span className="rounded-full bg-md-surfaceContainer px-3 py-1 text-xs font-semibold text-md-muted mr-6">
                {flowTasks.length} issues
              </span>
            </div>
            <div className="dialog-body space-y-4">
              <div className="grid grid-cols-7 gap-2">
                <button
                  type="button"
                  className={clsx(
                    'rounded-md p-3 text-left transition',
                    flowDialogStatus === 'all' ? 'bg-md-primary text-md-onPrimary' : 'bg-md-surfaceContainer text-md-text hover:bg-md-surfaceContainerHigh'
                  )}
                  onClick={() => setFlowDialogStatus('all')}
                >
                  <div className="text-lg font-semibold">{tasks.length}</div>
                  <div className={clsx('text-xs', flowDialogStatus === 'all' ? 'text-md-onPrimary' : 'text-md-muted')}>All</div>
                </button>
                {taskColumns.map((column) => {
                  const active = flowDialogStatus === column.id;
                  return (
                    <button
                      key={column.id}
                      type="button"
                      className={clsx(
                        'rounded-md p-3 text-left transition',
                        active ? 'bg-md-primary text-md-onPrimary' : 'bg-md-surfaceContainer text-md-text hover:bg-md-surfaceContainerHigh'
                      )}
                      onClick={() => setFlowDialogStatus(column.id)}
                    >
                      <div className="text-lg font-semibold">{tasks.filter((task) => task.status === column.id).length}</div>
                      <div className={clsx('text-xs', active ? 'text-md-onPrimary' : 'text-md-muted')}>{column.label}</div>
                    </button>
                  );
                })}
              </div>
              <div className="space-y-2 rounded-md bg-md-surfaceContainer p-3">
                {flowTasks.length === 0 ? (
                  <p className="rounded-md bg-md-surface p-4 text-sm text-md-muted">当前分类没有任务。</p>
                ) : null}
                {flowTasks.map((task) => {
                  const project = projects.find((item) => item.id === task.projectId);
                  return (
                    <button
                      key={task.id}
                      type="button"
                      className="w-full rounded-md bg-md-surface p-3 text-left transition hover:bg-md-surfaceContainerHigh"
                      onClick={() => {
                        setFlowDialogStatus(undefined);
                        onOpenTaskExecutor(task.id);
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="line-clamp-2 text-sm font-semibold text-md-text">{task.title}</div>
                          <div className="mt-1 text-xs text-md-muted">
                            {project?.name || 'Unknown project'} · {taskStatusLabel(task.status)}
                          </div>
                        </div>
                        <span className={clsx('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', priorityClass(task.priority))}>
                          {task.priority}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="dialog-footer flex justify-end">
              <Dialog.Close asChild>
                <Button variant="tonal">Close</Button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-4 rounded-md bg-md-surface p-3">
        <div>
          <h2 className="text-sm font-semibold text-md-text">Planning scope</h2>
          <p className="text-xs text-md-muted">Kanban defaults to all agents so cross-project work stays visible.</p>
        </div>
        <div className="flex rounded-full bg-md-surfaceContainer p-1">
          {[
            ['all', 'All Projects'],
            ['current', 'Current Project']
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => onScopeChange(id as 'all' | 'current')}
              className={clsx(
                'rounded-full px-4 py-2 text-sm font-medium transition',
                scope === id ? 'bg-md-primary text-md-onPrimary' : 'text-md-muted hover:bg-md-surface'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {visibleGroups.length > 0 ? (
        <div className="grid grid-cols-5 gap-3">
          {visibleGroups.map(({ group, tasks: groupTasks }) => (
            <button
              key={group.id}
              type="button"
              onClick={() => onSelectGroup(group.id)}
              className={clsx(
                'rounded-md border p-3 text-left transition',
                selectedGroup?.id === group.id
                  ? 'border-md-primary bg-md-primary/10'
                  : 'border-md-outline/20 bg-md-surface hover:border-md-primary/50'
              )}
            >
              <h3 className="truncate text-sm font-semibold text-md-text">{group.title}</h3>
              <p className="mt-1 text-xs text-md-muted">
                {groupTasks.filter((task) => task.status === 'done').length}/{groupTasks.length} done
              </p>
            </button>
          ))}
        </div>
      ) : null}

      {selectedGroup && selectedGroupTasks.length > 0 ? (
        <section className="grid grid-cols-[minmax(0,1fr)_280px] gap-3 rounded-md border border-md-outline/20 bg-md-surface p-4">
          <div className="min-w-0">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-md-muted">Task Group</p>
                <h2 className="truncate text-base font-semibold text-md-text">{selectedGroup.title}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-md-muted">{selectedGroup.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="tonal" onClick={() => onOpenExecutor(selectedGroup.id)}>
                  <Play size={16} />
                  Execute
                </Button>
                <Button
                  variant="tonal"
                  onClick={() => {
                    if (window.confirm(`删除任务组 "${selectedGroup.title}" 以及组内任务和执行记录？`)) {
                      onDeleteTaskGroup(selectedGroup.id);
                    }
                  }}
                >
                  Delete
                </Button>
                <Button onClick={() => onMoveGroupToReady(selectedGroup.id)} disabled={!canMoveGroup}>
                  <Check size={16} />
                  Move to Ready
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {selectedGroupTasks.map((task) => {
                const latestRun = runs.find((run) => run.taskId === task.id);
                return (
                  <article key={task.id} className="rounded-md bg-md-surfaceContainer p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-md-text">
                          {projects.find((project) => project.id === task.projectId)?.name || 'Unknown project'}
                        </h3>
                        <p className="mt-1 line-clamp-2 text-xs text-md-muted">{task.description}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-md-surface px-2 py-0.5 text-xs font-semibold text-md-muted">
                        {taskStatusLabel(task.status)}
                      </span>
                    </div>
                    <p className="mt-3 truncate text-xs text-md-muted">
                      {latestRun ? `${latestRun.status} · ${formatDate(latestRun.updatedAt)}` : `No run · ${formatDate(task.updatedAt)}`}
                    </p>
                    {latestRun?.error ? <p className="mt-1 line-clamp-2 text-xs text-red-600">{latestRun.error}</p> : null}
                  </article>
                );
              })}
            </div>
            {distributableProjects.length > 0 ? (
              <div className="mt-3 flex items-center gap-2 rounded-md bg-md-surfaceContainer p-3">
                <select
                  className="h-10 min-w-0 flex-1 rounded-md border border-md-outline/30 bg-md-surface px-3 text-sm text-md-text outline-none"
                  value={selectedDistributionProjectId}
                  onChange={(event) => setDistributionProjectId(event.target.value)}
                >
                  {distributableProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <Button
                  variant="tonal"
                  onClick={() => {
                    if (selectedDistributionProjectId) onAddProjectToGroup(selectedGroup.id, selectedDistributionProjectId);
                    setDistributionProjectId('');
                  }}
                >
                  Add Project
                </Button>
              </div>
            ) : null}
          </div>
          <div className="rounded-md bg-md-surfaceContainer p-3">
            <h3 className="text-sm font-semibold text-md-text">Group Status</h3>
            <div className="mt-3 space-y-2">
              {groupCounts.map((column) => (
                <div key={column.id} className="flex items-center justify-between text-sm">
                  <span className="text-md-muted">{column.label}</span>
                  <span className="font-semibold text-md-text">{column.count}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)] gap-3">
        <section className="min-h-0 overflow-y-auto rounded-md bg-md-surfaceContainer p-3">
          <SectionTitle icon={Sparkles} title="Priority Queue" />
          <div className="space-y-3">
            {priorityGroups.map((priority) => {
              const priorityTasks = openTasks
                .filter((task) => task.priority === priority.id)
                .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
              return (
                <div key={priority.id} className="rounded-md bg-md-surface p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-md-text">{priority.label}</h3>
                    <span className="text-xs font-semibold text-md-muted">{priorityTasks.length}</span>
                  </div>
                  <div className="space-y-2">
                    {priorityTasks.slice(0, 6).map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        project={projects.find((project) => project.id === task.projectId)}
                        onStatus={onStatus}
                        onDelete={onDeleteTask}
                      />
                    ))}
                    {priorityTasks.length === 0 ? (
                      <p className="rounded-md bg-md-surfaceContainer p-3 text-sm text-md-muted">No active tasks.</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <section className="min-h-0 overflow-x-auto rounded-md bg-md-surfaceContainer p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <SectionTitle icon={CalendarDays} title="Next 7 Days" />
            <p className="text-xs text-md-muted">Use the date picker on each task to place it on the calendar.</p>
          </div>
          <div className="grid min-h-[520px] min-w-[980px] grid-cols-7 gap-2">
            {calendarDays.map((day) => {
              const key = dateKey(day);
              const dayTasks = openTasks
                .filter((task) => task.scheduledFor === key)
                .sort((a, b) => priorityGroups.findIndex((item) => item.id === a.priority) - priorityGroups.findIndex((item) => item.id === b.priority));
              return (
                <div key={key} className="flex min-h-0 flex-col rounded-md bg-md-surface p-3">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-md-text">{formatCalendarLabel(day)}</h3>
                      <p className="text-xs text-md-muted">{key}</p>
                    </div>
                    <span className="rounded-full bg-md-surfaceContainer px-2 py-0.5 text-xs font-semibold text-md-muted">
                      {dayTasks.length}
                    </span>
                  </div>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                    {dayTasks.map((task) => (
                      <article key={task.id} className="rounded-md border border-md-outline/20 bg-md-surfaceContainer p-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="line-clamp-2 text-xs font-semibold text-md-text">{task.title}</h4>
                            <p className="mt-1 truncate text-xs text-md-muted">
                              {projects.find((project) => project.id === task.projectId)?.name || 'Unknown project'}
                            </p>
                          </div>
                          <span
                            className={clsx(
                              'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                              task.priority === 'high' && 'bg-red-100 text-red-700',
                              task.priority === 'medium' && 'bg-amber-100 text-amber-800',
                              task.priority === 'low' && 'bg-emerald-100 text-emerald-700'
                            )}
                          >
                            {task.priority}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <select
                            className="h-8 min-w-0 flex-1 rounded-md border border-md-outline/30 bg-md-surface px-2 text-xs text-md-text outline-none"
                            value={task.status}
                            onChange={(event) => onStatus(task.id, event.target.value as TaskStatus)}
                          >
                            {taskColumns.map((column) => (
                              <option key={column.id} value={column.id}>
                                {column.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => onScheduleTask(task.id, undefined)}
                            className="rounded-md px-2 py-1 text-xs font-semibold text-md-muted hover:bg-md-surface"
                          >
                            Clear
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 rounded-md bg-md-surface p-3">
            <h3 className="mb-2 text-sm font-semibold text-md-text">Unscheduled</h3>
            <div className="flex flex-wrap gap-2">
              {openTasks
                .filter((task) => !task.scheduledFor)
                .slice(0, 24)
                .map((task) => (
                  <div key={task.id} className="flex items-center gap-2 rounded-md border border-md-outline/20 bg-md-surfaceContainer px-2 py-2">
                    <span className="max-w-[220px] truncate text-sm font-medium text-md-text">{task.title}</span>
                    <input
                      type="date"
                      className="h-8 rounded-md border border-md-outline/30 bg-md-surface px-2 text-xs text-md-text outline-none"
                      value={task.scheduledFor || ''}
                      onChange={(event) => onScheduleTask(task.id, event.target.value || undefined)}
                    />
                  </div>
                ))}
              {openTasks.filter((task) => !task.scheduledFor).length === 0 ? (
                <p className="text-sm text-md-muted">All active tasks are scheduled.</p>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
