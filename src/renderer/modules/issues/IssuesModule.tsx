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
  Zap,
  Trash2,
  X
} from 'lucide-react';
import { api } from '../../lib/api';
import { Button, IconButton, SectionTitle } from '../../components/ui';
import { pastedImageAttachments } from '../../lib/attachments';
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
  workItemLinkedTask,
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


export function IssuesModule({
  project,
  tasks,
  workItems,
  conversations,
  runs,
  onOpenExecutor,
  onOpenPromptThread,
  onOpenWorkItem,
  onDeleteWorkItem,
  onDeleteTask,
  onQuickChange,
  isBusy
}: {
  project?: ProjectRecord;
  tasks: TaskRecord[];
  workItems: WorkItemRecord[];
  conversations: ConversationRecord[];
  runs: ExecutorRunRecord[];
  onOpenExecutor: (taskId: string) => void;
  onOpenPromptThread: (task: TaskRecord) => void;
  onOpenWorkItem: (item: WorkItemRecord) => void;
  onDeleteWorkItem: (workItemId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onQuickChange: (input: { title: string; description: string; attachments: PromptAttachment[] }) => Promise<void>;
  isBusy: boolean;
}) {
  const [quickChangeOpen, setQuickChangeOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickDescription, setQuickDescription] = useState('');
  const [quickAttachments, setQuickAttachments] = useState<PromptAttachment[]>([]);
  const sortedTasks = [...tasks].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const unfinishedTasks = sortedTasks.filter((task) => task.status !== 'done');
  const pendingWorkItems = [...workItems]
    .filter((item) => item.projectId === project?.id && item.status !== 'done' && !workItemLinkedTask(item, tasks))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const unfinishedCount = unfinishedTasks.length + pendingWorkItems.length;

  const resetQuickChange = () => {
    setQuickTitle('');
    setQuickDescription('');
    setQuickAttachments([]);
  };

  const attachQuickChangeFiles = async () => {
    const files = await api.selectPromptFiles();
    if (files.length > 0) setQuickAttachments((value) => [...value, ...files]);
  };

  const submitQuickChange = async () => {
    const description = quickDescription.trim();
    if (!description || isBusy) return;
    const title = quickTitle.trim() || description.split('\n')[0].slice(0, 60);
    await onQuickChange({ title, description, attachments: quickAttachments });
    resetQuickChange();
    setQuickChangeOpen(false);
  };

  if (!project) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-md bg-md-surface p-8 text-center">
        <div>
          <ClipboardList className="mx-auto mb-3 text-md-muted" size={28} />
          <h2 className="text-lg font-semibold text-md-text">Select a project</h2>
          <p className="mt-2 text-sm text-md-muted">项目 issue 属于项目上下文。选择左侧项目后，这里会展示它关联的 issue。</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="flex min-h-0 flex-1 flex-col rounded-md bg-md-surface p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-md-text">Project Issues</h2>
          <p className="text-sm text-md-muted">小改动可以直接执行；复杂需求仍通过 Prompt 规划。</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-md-surfaceContainer px-3 py-1 text-sm font-semibold text-md-muted" title={`${sortedTasks.length + pendingWorkItems.length} total`}>
            {unfinishedCount} unfinished
          </span>
          <Button onClick={() => setQuickChangeOpen(true)} disabled={isBusy}>
            <Zap size={16} />
            快速修改
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {sortedTasks.length === 0 && pendingWorkItems.length === 0 ? (
          <p className="rounded-md bg-md-surfaceContainer p-4 text-sm text-md-muted">
            No issues yet. You can create one from Prompt, or send a Work Calendar item to Prompt first.
          </p>
        ) : null}
        {sortedTasks.map((task) => {
          const conversation = conversations.find((item) => item.id === task.conversationId);
          const latestRun = runs.find((run) => run.taskId === task.id);
          return (
            <article key={task.id} className="rounded-md border border-md-outline/20 bg-md-surfaceContainer p-3">
              <button type="button" className="w-full text-left" onClick={() => onOpenExecutor(task.id)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-md-text">{task.title}</h3>
                    <p className="mt-1 line-clamp-2 text-xs text-md-muted">{task.description}</p>
                  </div>
                  <span className={clsx('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold', priorityClass(task.priority))}>
                    {task.priority}
                  </span>
                </div>
              </button>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-md-muted">
                <span className="rounded-full bg-md-surface px-2 py-1">{taskStatusLabel(task.status)}</span>
                {task.workflowMode === 'quick-change' ? (
                  <span className="rounded-full bg-blue-100 px-2 py-1 font-semibold text-blue-700">快速修改</span>
                ) : null}
                {latestRun ? <span>{latestRun.status} · {formatDate(latestRun.updatedAt)}</span> : <span>No run yet</span>}
                {conversation ? (
                  <button
                    type="button"
                    className="font-semibold text-md-primary"
                    onClick={() => onOpenPromptThread(task)}
                  >
                    View Prompt
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ml-auto font-semibold text-red-600"
                  onClick={() => {
                    if (window.confirm(`删除 issue "${task.title}"？相关执行记录也会删除。`)) onDeleteTask(task.id);
                  }}
                >
                  Delete
                </button>
              </div>
            </article>
          );
        })}
        {pendingWorkItems.length > 0 ? (
          <div className="pt-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-md-muted">
              Pending Work Items
            </div>
            <div className="space-y-2">
              {pendingWorkItems.map((item) => (
                <article key={item.id} className="rounded-md border border-md-outline/20 bg-md-surfaceContainer p-3">
                  <button type="button" className="w-full text-left" onClick={() => onOpenWorkItem(item)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-md-text">{item.title}</h3>
                        <p className="mt-1 line-clamp-2 text-xs text-md-muted">{item.notes || '还没有生成关联 issue，点击继续进入 Prompt。'}</p>
                      </div>
                      <span className={clsx('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold', priorityClass(item.priority))}>
                        {item.priority}
                      </span>
                    </div>
                  </button>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-md-muted">
                    <span className="rounded-full bg-md-surface px-2 py-1">{workItemStatusLabel(item.status)}</span>
                    <span>{formatDate(item.updatedAt)}</span>
                    <button type="button" className="ml-auto font-semibold text-md-primary" onClick={() => onOpenWorkItem(item)}>
                      Continue Prompt
                    </button>
                    <button
                      type="button"
                      className="font-semibold text-red-600"
                      onClick={() => {
                        if (window.confirm(`删除工作记录 "${item.title}"？`)) onDeleteWorkItem(item.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
    <Dialog.Root
      open={quickChangeOpen}
      onOpenChange={(open) => {
        setQuickChangeOpen(open);
        if (!open) resetQuickChange();
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
          <Dialog.Title className="flex items-center gap-2 text-base font-semibold text-md-text">
            <Zap size={18} className="text-md-primary" />
            快速修改 · {project.name}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-md-muted">
            跳过 Prompt 和 Kanban，使用当前工作区立即执行。执行前仍会保存 Git 快照，并支持 Undo。
          </Dialog.Description>
          <div className="dialog-body space-y-3">
            <label>
              <span className="field-label">标题（可选）</span>
              <input
                autoFocus
                className="field-input h-10"
                value={quickTitle}
                onChange={(event) => setQuickTitle(event.target.value)}
                placeholder="不填则自动使用修改要求的第一行"
              />
            </label>
            <label>
              <span className="field-label">要修改什么</span>
              <textarea
                className="field-textarea min-h-[180px]"
                value={quickDescription}
                onChange={(event) => setQuickDescription(event.target.value)}
                onPaste={async (event) => {
                  const files = await pastedImageAttachments(event);
                  if (files.length > 0) setQuickAttachments((value) => [...value, ...files]);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void submitQuickChange();
                  }
                }}
                placeholder="例如：把 Issues 页的状态标签移到标题右侧，并缩小上下间距。保持其他交互不变。"
              />
            </label>
            {quickAttachments.length > 0 ? (
              <div className="flex flex-wrap gap-2 rounded-md bg-md-surfaceContainer p-3">
                {quickAttachments.map((file, index) => (
                  <span key={`${file.path}-${index}`} className="inline-flex max-w-[260px] items-center gap-2 rounded-full bg-md-surface px-3 py-1 text-xs text-md-text">
                    <FilePlus2 size={13} />
                    <span className="truncate">{file.name}</span>
                    <button type="button" className="text-md-muted hover:text-red-600" onClick={() => setQuickAttachments((value) => value.filter((_, itemIndex) => itemIndex !== index))}>×</button>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="rounded-md bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">
              如果 Codex 判断改动涉及跨项目、架构调整、数据迁移或需求不明确，会停止修改并建议转为标准任务。
            </div>
          </div>
          <div className="dialog-footer flex items-center justify-between gap-2">
            <Button variant="tonal" onClick={() => void attachQuickChangeFiles()} disabled={isBusy}>
              <FilePlus2 size={16} />
              添加附件
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-md-muted">⌘/Ctrl + Enter</span>
              <Button onClick={() => void submitQuickChange()} disabled={isBusy || !quickDescription.trim()}>
                {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                立即修改
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    </>
  );
}
