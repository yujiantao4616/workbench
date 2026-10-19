import { useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as ContextMenu from '@radix-ui/react-context-menu';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Select from '@radix-ui/react-select';
import clsx from 'clsx';
import {
  AlertCircle,
  ArrowDown,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  Pencil,
  FilePlus2,
  FileSearch,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Square,
  Terminal,
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
  runActivitySummary,
  runDisplaySummary,
  runLiveProgress,
  projectStack,
  runResultSummary,
  startOfNaturalWeek,
  taskColumns,
  taskStatusLabel,
  weekOfYearSunday
} from '../../lib/workflow';
import type {
  AppState,
  CodexHealthResult,
  ConversationRecord,
  ExecutorRunRecord,
  ProjectRecord,
  PromptAttachment,
  SaveMemoryInput,
  TaskGroupRecord,
  TaskRecord,
  TaskStatus,
  WorkItemRecord,
} from '../../../shared/types';

import { TaskCard } from '../kanban/TaskCard';

export function ExecutorModule({
  tasks,
  conversations,
  workItems,
  taskGroups,
  projects,
  runs,
  codexHealth,
  selectedProject,
  selectedTaskId,
  selectedTaskGroupId,
  onSelectGroup,
  onStatus,
  onStartRun,
  onCancelRun,
  onUndoRun,
  onCompleteTask,
  onSaveMemory,
  onDeleteTask,
  onReviseTask,
  isBusy
}: {
  tasks: TaskRecord[];
  conversations: ConversationRecord[];
  workItems: WorkItemRecord[];
  taskGroups: TaskGroupRecord[];
  projects: ProjectRecord[];
  runs: ExecutorRunRecord[];
  codexHealth?: CodexHealthResult;
  selectedProject?: ProjectRecord;
  selectedTaskId?: string;
  selectedTaskGroupId?: string;
  onSelectGroup: (groupId: string | undefined) => void;
  onStatus: (taskId: string, status: TaskStatus) => void;
  onStartRun: (taskId: string, feedback?: string) => void;
  onCancelRun: (runId: string) => void;
  onUndoRun: (runId: string) => void;
  onCompleteTask: (taskId: string, runId: string | undefined, saveMemory: boolean) => void;
  onSaveMemory: (input: SaveMemoryInput) => void | Promise<void>;
  onDeleteTask: (taskId: string) => void;
  onReviseTask: (task: TaskRecord) => void;
  isBusy: boolean;
}) {
  const [, setClockTick] = useState(0);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const reviewInputRef = useRef<HTMLTextAreaElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchTargetRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const reviewFeedbackRef = useRef('');
  const draftSaveTimerRef = useRef<number | undefined>(undefined);
  const searchTimerRef = useRef<number | undefined>(undefined);
  const [hasReviewDraft, setHasReviewDraft] = useState(false);
  const [reviewAttachments, setReviewAttachments] = useState<PromptAttachment[]>([]);
  const [copiedFeedbackRunId, setCopiedFeedbackRunId] = useState<string>();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archivePrd, setArchivePrd] = useState('');
  const [archiveResult, setArchiveResult] = useState('已验证完成。');
  const [saveExperienceMemory, setSaveExperienceMemory] = useState(false);
  const [experienceMemory, setExperienceMemory] = useState('');
  const selectedGroup = taskGroups.find((group) => group.id === selectedTaskGroupId);
  const groupedTasks = selectedGroup ? tasks.filter((task) => task.groupId === selectedGroup.id) : [];
  const scopedTasks = selectedGroup ? groupedTasks : tasks.filter((task) => task.projectId === selectedProject?.id);
  const executableTasks = tasks
    .filter((task) => scopedTasks.some((scopedTask) => scopedTask.id === task.id))
    .filter((task) => ['ready', 'in-progress', 'blocked', 'review', 'need-changes'].includes(task.status))
    .sort((a, b) => executorRank(a.status) - executorRank(b.status));
  const projectTasks = selectedProject ? tasks.filter((task) => task.projectId === selectedProject.id) : [];
  const selectedProjectTask = selectedTaskId
    ? projectTasks.find((task) => task.id === selectedTaskId)
    : undefined;
  const current = selectedProjectTask ?? [...projectTasks].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  const isQuickChange = current?.workflowMode === 'quick-change';
  const currentRuns = runs.filter((run) => run.taskId === current?.id);
  const latestRun = currentRuns[0];
  const feedbackRuns = currentRuns.filter((run) => run.feedback?.trim());
  const isRunning = latestRun?.status === 'running';
  const totalRunDuration = formatRunTotalDuration(currentRuns);
  const currentProject = projects.find((project) => project.id === current?.projectId);
  const memoryCandidate = current ? buildMemoryCandidate(current, currentProject, latestRun) : '';
  const linkedWorkItem = current ? workItems.find((item) => item.taskId === current.id || item.conversationId === current.conversationId) : undefined;
  const currentConversation = current?.conversationId ? conversations.find((conversation) => conversation.id === current.conversationId) : undefined;
  const archiveDraft = useMemo(() => {
    if (!current) return '';
    return buildTaskArchiveDraft({
      task: current,
      project: currentProject,
      conversation: currentConversation,
      workItem: linkedWorkItem,
      run: latestRun,
      prd: archivePrd,
      finalResult: archiveResult
    });
  }, [archivePrd, archiveResult, current, currentConversation, currentProject, latestRun, linkedWorkItem]);
  const groupOptions = taskGroups
    .map((group) => ({
      group,
      tasks: tasks.filter((task) => task.groupId === group.id)
    }))
    .filter((item) => item.tasks.length > 0)
    .slice(0, 8);
  const searchMatches = useMemo(() => {
    const query = searchQuery.trim();
    if (!query || !current) return [];
    const entries: Array<{ key: string; text: string; count: number }> = [];
    [...currentRuns].reverse().forEach((run) => {
      if (run.feedback?.trim()) {
        entries.push({
          key: `feedback-${run.id}`,
          text: feedbackDisplay(run.feedback),
          count: countTextMatches(feedbackDisplay(run.feedback), query)
        });
      }
      const resultText = run.status === 'running'
        ? runLiveProgress(run)
        : `${runDisplaySummary(run)}\n${runLiveProgress(run)}`;
      entries.push({
        key: `result-${run.id}`,
        text: resultText,
        count: countTextMatches(resultText, query)
      });
      if (run.error) {
        entries.push({
          key: `error-${run.id}`,
          text: run.error,
          count: countTextMatches(run.error, query)
        });
      }
    });
    return entries.flatMap((entry) => Array.from({ length: entry.count }, () => ({ key: entry.key, text: entry.text })));
  }, [current, currentRuns, searchQuery]);
  const activeSearchMatch = searchMatches[activeSearchIndex];

  useEffect(() => {
    return () => {
      if (draftSaveTimerRef.current) window.clearTimeout(draftSaveTimerRef.current);
      if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setSearchOpen(true);
        window.setTimeout(() => searchInputRef.current?.select(), 0);
      }
      if (event.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [searchOpen]);

  useEffect(() => {
    if (latestRun?.status !== 'running') return;
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [latestRun?.id, latestRun?.status]);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: 'smooth'
    });
  }, [currentRuns.length, latestRun?.status]);

  useEffect(() => {
    setReviewDraftValue(current ? window.localStorage.getItem(executorDraftStorageKey(current.id)) || '' : '', { save: false });
    setReviewAttachments([]);
    setArchiveDialogOpen(false);
    setArchivePrd('');
    setArchiveResult('已验证完成。');
    setSaveExperienceMemory(false);
    setExperienceMemory('');
    setSearchQuery('');
    setActiveSearchIndex(0);
    if (searchInputRef.current) searchInputRef.current.value = '';
  }, [current?.id]);

  useEffect(() => {
    setActiveSearchIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    if (!activeSearchMatch) return;
    const target = searchTargetRefs.current[activeSearchMatch.key];
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeSearchMatch]);

  const attachReviewFiles = async () => {
    const files = await api.selectPromptFiles();
    if (files.length === 0) return;
    setReviewAttachments((value) => [...value, ...files]);
  };

  const resizeReviewInput = (element = reviewInputRef.current) => {
    if (!element) return;
    const maxHeight = 180;
    element.style.height = 'auto';
    const nextHeight = Math.min(element.scrollHeight, maxHeight);
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden';
  };

  const scheduleDraftSave = (taskId: string, value: string) => {
    if (draftSaveTimerRef.current) window.clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = window.setTimeout(() => {
      const key = executorDraftStorageKey(taskId);
      if (value.trim()) {
        window.localStorage.setItem(key, value);
      } else {
        window.localStorage.removeItem(key);
      }
    }, 500);
  };

  const setReviewDraftValue = (value: string, options: { save: boolean }) => {
    reviewFeedbackRef.current = value;
    setHasReviewDraft(Boolean(value.trim()));
    if (reviewInputRef.current) {
      reviewInputRef.current.value = value;
      resizeReviewInput(reviewInputRef.current);
    }
    if (options.save && current) {
      scheduleDraftSave(current.id, value);
    }
  };

  const sendContinueFeedback = () => {
    const text = reviewFeedbackRef.current.trim();
    const attachmentContent = reviewAttachments.length > 0 ? promptAttachmentBlock(reviewAttachments) : '';
    const feedback = [text, attachmentContent].filter(Boolean).join('\n\n');
    if (!feedback || !current) return;
    window.localStorage.removeItem(executorDraftStorageKey(current.id));
    setReviewDraftValue('', { save: false });
    setReviewAttachments([]);
    onStartRun(current.id, feedback);
  };

  const copyFeedback = async (run: ExecutorRunRecord) => {
    if (!run.feedback) return;
    await navigator.clipboard.writeText(run.feedback);
    setCopiedFeedbackRunId(run.id);
    window.setTimeout(() => setCopiedFeedbackRunId((value) => (value === run.id ? undefined : value)), 1200);
  };

  const editFeedback = (run: ExecutorRunRecord) => {
    if (!run.feedback || !current) return;
    setReviewDraftValue(run.feedback, { save: false });
    window.localStorage.setItem(executorDraftStorageKey(current.id), run.feedback);
    window.setTimeout(() => {
      reviewInputRef.current?.focus();
      reviewInputRef.current?.setSelectionRange(run.feedback?.length || 0, run.feedback?.length || 0);
      chatScrollRef.current?.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }, 0);
  };

  const goToSearchMatch = (direction: 1 | -1) => {
    if (searchMatches.length === 0) return;
    setActiveSearchIndex((value) => (value + direction + searchMatches.length) % searchMatches.length);
  };

  const scheduleSearch = (value: string) => {
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    searchTimerRef.current = window.setTimeout(() => {
      setSearchQuery(value);
    }, 260);
  };

  const clearSearch = () => {
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    if (searchInputRef.current) searchInputRef.current.value = '';
    setSearchOpen(false);
    setSearchQuery('');
    setActiveSearchIndex(0);
  };

  async function completeWithArchive() {
    if (!current) return;
    await onSaveMemory({
      scope: 'project',
      ownerId: current.projectId,
      title: `任务归档：${current.title}`,
      content: archiveDraft
    });
    if (saveExperienceMemory && experienceMemory.trim()) {
      await onSaveMemory({
        scope: 'project',
        ownerId: current.projectId,
        title: `经验记忆：${current.title}`,
        content: ['类型：经验记忆', '', experienceMemory.trim()].join('\n')
      });
    }
    onCompleteTask(current.id, latestRun?.id, false);
    setArchiveDialogOpen(false);
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4">
      <section className="hidden min-h-0 overflow-y-auto rounded-md border border-md-outline/20 bg-md-surface p-3">
        <SectionTitle icon={ClipboardList} title="Executor Queue" />
        <div className="mb-3 rounded-md bg-md-surfaceContainer p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-md-text">Execution scope</h2>
            <button
              type="button"
              onClick={() => onSelectGroup(undefined)}
              className={clsx(
                'rounded-full px-3 py-1 text-xs font-semibold',
                selectedGroup ? 'text-md-muted hover:bg-md-surface' : 'bg-md-primary text-md-onPrimary'
              )}
            >
              Current Project
            </button>
          </div>
          <div className="space-y-2">
            {groupOptions.map(({ group, tasks: groupTasks }) => (
              <button
                key={group.id}
                type="button"
                onClick={() => onSelectGroup(group.id)}
                className={clsx(
                  'w-full rounded-md border p-2 text-left transition',
                  selectedGroup?.id === group.id
                    ? 'border-md-primary bg-md-primary/10'
                    : 'border-md-outline/20 bg-md-surface hover:border-md-primary/50'
                )}
              >
                <div className="truncate text-xs font-semibold text-md-text">{group.title}</div>
                <div className="mt-1 text-xs text-md-muted">
                  {groupTasks.filter((task) => task.status === 'done').length}/{groupTasks.length} done
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          {executableTasks.length === 0 ? (
            <p className="rounded-md bg-md-surfaceContainer p-3 text-sm text-md-muted">
              {selectedGroup ? 'Move tasks in this group to Ready before execution.' : 'Move current project tasks to Ready before execution.'}
            </p>
          ) : null}
          {executableTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              project={projects.find((project) => project.id === task.projectId)}
              onStatus={onStatus}
              onDelete={onDeleteTask}
            />
          ))}
        </div>
      </section>
      <section className="flex min-h-0 flex-col rounded-md border border-md-outline/20 bg-md-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <SectionTitle icon={Play} title="Codex Run Flow" />
          <span
            className={clsx(
              'rounded-full px-3 py-1 text-xs font-semibold mb-3',
              codexHealth?.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
            )}
          >
            {codexHealth?.ok ? 'Codex CLI' : codexHealth?.error || 'Checking Codex CLI'}
          </span>
        </div>
        {current ? (
          <>
            <div className="rounded-md bg-md-surfaceContainer p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-md-muted">
                    {isQuickChange ? 'Quick change' : 'Current project queue'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-md-text">{current.title}</h2>
                    {isQuickChange ? (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">快速修改</span>
                    ) : null}
                  </div>
                  <p className="text-sm text-md-muted">
                    {currentProject?.name} · {taskStatusLabel(current.status)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isRunning ? (
                    <Button variant="tonal" onClick={() => onCancelRun(latestRun.id)}>
                      Cancel
                    </Button>
                  ) : null}
                  {!latestRun ? (
                    <Button onClick={() => onStartRun(current.id)} disabled={isBusy}>
                      <Play size={17} />
                      Start
                    </Button>
                  ) : null}
                  {isQuickChange && latestRun && !isRunning && current.status !== 'done' ? (
                    <Button variant="tonal" onClick={() => setArchiveDialogOpen(true)} disabled={isBusy}>
                      归档
                    </Button>
                  ) : null}
                  {current.status !== 'done' ? (
                    <Button
                      disabled={isBusy || isRunning}
                      onClick={() => {
                        if (latestRun && !isQuickChange) {
                          setArchiveDialogOpen(true);
                          return;
                        }
                        onCompleteTask(current.id, undefined, false);
                      }}
                    >
                      <Check size={17} />
                      {isQuickChange ? '完成' : 'Done'}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="mt-4 min-h-0 flex-1">
              <section className="flex h-full min-h-0 flex-col rounded-md bg-md-surfaceContainer p-4">
                <div className="flex items-center justify-between gap-3">
                  <SectionTitle icon={ClipboardList} title="Result & Review" />
                  {latestRun ? (
                    <span
                      className={clsx(
                        'rounded-full px-3 py-1 text-xs font-semibold mb-3',
                        latestRun.status === 'succeeded' && 'bg-emerald-100 text-emerald-700',
                        latestRun.status === 'failed' && 'bg-red-100 text-red-700',
                        latestRun.status === 'running' && 'bg-blue-100 text-blue-700',
                        latestRun.status === 'cancelled' && 'bg-md-surface text-md-muted'
                      )}
                    >
                      {latestRun.status} · Total {totalRunDuration}
                    </span>
                  ) : null}
                </div>
                <div className="mb-3 flex flex-wrap gap-2">
                  <Dialog.Root>
                    <Dialog.Trigger asChild>
                      <Button variant="tonal">{isQuickChange ? '修改要求' : 'Issue'}</Button>
                    </Dialog.Trigger>
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
                          <Dialog.Title className="text-base font-semibold text-md-text">{isQuickChange ? '快速修改要求' : 'Issue details'}</Dialog.Title>
                        <div className="dialog-body space-y-3 text-sm leading-6 text-md-text">
                          <p className="whitespace-pre-wrap rounded-md bg-md-surfaceContainer p-3">{current.description}</p>
                          <pre className="whitespace-pre-wrap rounded-md bg-md-surfaceContainer p-3 text-xs leading-5">
                            {current.executionPrompt}
                          </pre>
                        </div>
                      </Dialog.Content>
                    </Dialog.Portal>
                  </Dialog.Root>
                  {isQuickChange && current.status !== 'done' ? (
                    <Button variant="text" onClick={() => onReviseTask(current)} disabled={isBusy || isRunning}>
                      升级为标准任务
                    </Button>
                  ) : null}
                  {latestRun ? (
                    <Dialog.Root>
                      <Dialog.Trigger asChild>
                        <Button variant="tonal">Codex Result</Button>
                      </Dialog.Trigger>
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
                          <Dialog.Title className="text-base font-semibold text-md-text">Codex result</Dialog.Title>
                          <div className="dialog-body">
                            {latestRun.status === 'running' ? (
                              <div className="space-y-3 rounded-md bg-md-surfaceContainer p-3 text-sm text-md-muted">
                                <div className="flex items-center gap-2">
                                  <Loader2 size={16} className="animate-spin" />
                                  <span>Codex 正在执行，下面展示整理后的关键过程。</span>
                                </div>
                                <RunTimeline run={latestRun} query={searchQuery} />
                              </div>
                            ) : (
                              <div className="space-y-3 rounded-md bg-md-surfaceContainer p-3">
                                <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-md-text">
                                  {runDisplaySummary(latestRun)}
                                </pre>
                                <RunTimeline run={latestRun} query={searchQuery} />
                              </div>
                            )}
                          </div>
                        </Dialog.Content>
                      </Dialog.Portal>
                    </Dialog.Root>
                  ) : null}
                  {current.status === 'review' ? (
                    <Dialog.Root>
                      <Dialog.Trigger asChild>
                        <Button variant="tonal">Memory Draft</Button>
                      </Dialog.Trigger>
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
                          <Dialog.Title className="text-base font-semibold text-md-text">Memory candidate</Dialog.Title>
                          <div className="dialog-body">
                            <pre className="whitespace-pre-wrap rounded-md bg-md-surfaceContainer p-3 text-xs leading-5 text-md-text">
                              {memoryCandidate}
                            </pre>
                          </div>
                        </Dialog.Content>
                      </Dialog.Portal>
                    </Dialog.Root>
                  ) : null}
                  <Dialog.Root open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
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
                        <Dialog.Title className="text-base font-semibold text-md-text">任务归档草稿</Dialog.Title>
                        <Dialog.Description className="mt-1 text-sm text-md-muted">
                          Codex 执行过的任务会先保存任务归档，再标记 Done。PRD/设计稿可选。
                        </Dialog.Description>
                        <div className="dialog-body grid gap-3">
                          <label>
                            <span className="field-label">PRD / 设计稿</span>
                            <input
                              className="field-input"
                              value={archivePrd}
                              onChange={(event) => setArchivePrd(event.target.value)}
                              placeholder="可填 PRD 链接、设计稿链接或简短说明"
                            />
                          </label>
                          <label>
                            <span className="field-label">最终结果 / 备注</span>
                            <textarea
                              className="field-textarea min-h-[90px]"
                              value={archiveResult}
                              onChange={(event) => setArchiveResult(event.target.value)}
                              placeholder="记录你验证后的最终结论"
                            />
                          </label>
                          <label>
                            <span className="field-label">任务归档内容</span>
                            <textarea
                              className="field-textarea min-h-[260px] font-mono text-xs"
                              value={archiveDraft}
                              readOnly
                            />
                          </label>
                          <label className="flex items-center gap-2 rounded-md bg-md-surfaceContainer px-3 py-2 text-sm text-md-text">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-[rgb(var(--md-primary))]"
                              checked={saveExperienceMemory}
                              onChange={(event) => setSaveExperienceMemory(event.target.checked)}
                            />
                            同时沉淀为经验记忆
                          </label>
                          {saveExperienceMemory ? (
                            <textarea
                              className="field-textarea min-h-[110px]"
                              value={experienceMemory}
                              onChange={(event) => setExperienceMemory(event.target.value)}
                              placeholder="只记录真正可复用的项目约定、业务规则、组件用法或坑点"
                            />
                          ) : null}
                        </div>
                        <div className="dialog-footer flex justify-end gap-2">
                          <Dialog.Close asChild>
                            <Button variant="tonal">Cancel</Button>
                          </Dialog.Close>
                          <Button onClick={() => void completeWithArchive()} disabled={isBusy}>
                            <Check size={17} />
                            Save Archive & Done
                          </Button>
                        </div>
                      </Dialog.Content>
                    </Dialog.Portal>
                  </Dialog.Root>
                </div>
                {latestRun ? (
                  <div className="relative min-h-0 flex-1">
                    {searchOpen ? (
                      <div className="absolute right-3 top-3 z-20 flex h-10 items-center gap-1 rounded-full border border-md-outline/20 bg-md-surface px-2 shadow-lg">
                        <Search size={15} className="ml-1 text-md-muted" />
                        <input
                          ref={searchInputRef}
                          className="h-8 w-52 bg-transparent text-sm text-md-text outline-none placeholder:text-md-muted"
                          defaultValue={searchQuery}
                          onChange={(event) => scheduleSearch(event.currentTarget.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
                              setSearchQuery(event.currentTarget.value);
                              goToSearchMatch(event.shiftKey ? -1 : 1);
                            }
                          }}
                          placeholder="Search in executor"
                        />
                        <span className={clsx('min-w-12 text-center text-xs', searchQuery && searchMatches.length === 0 ? 'text-red-600' : 'text-md-muted')}>
                          {searchQuery ? `${searchMatches.length === 0 ? 0 : activeSearchIndex + 1}/${searchMatches.length}` : '0/0'}
                        </span>
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-md-muted transition hover:bg-md-surfaceContainer hover:text-md-text disabled:opacity-40"
                          title="Previous"
                          disabled={searchMatches.length === 0}
                          onClick={() => goToSearchMatch(-1)}
                        >
                          <ChevronLeft size={15} />
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-md-muted transition hover:bg-md-surfaceContainer hover:text-md-text disabled:opacity-40"
                          title="Next"
                          disabled={searchMatches.length === 0}
                          onClick={() => goToSearchMatch(1)}
                        >
                          <ChevronRight size={15} />
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-md-muted transition hover:bg-md-surfaceContainer hover:text-md-text"
                          title="Close search"
                          onClick={clearSearch}
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ) : null}
                    <div ref={chatScrollRef} className="h-full min-h-0 space-y-3 overflow-y-auto rounded-md bg-md-surface/60 p-3">
                    {latestRun.error ? (
                      <div
                        ref={(element) => {
                          searchTargetRefs.current[`error-${latestRun.id}`] = element;
                        }}
                        className={clsx(
                          'flex items-start justify-between gap-3 rounded-md border p-3 text-sm leading-6 text-red-700',
                          activeSearchMatch?.key === `error-${latestRun.id}` ? 'border-md-primary bg-md-primary/10' : 'border-red-200 bg-red-50'
                        )}
                      >
                        <span className="min-w-0">
                          <HighlightText text={latestRun.error} query={searchQuery} />
                        </span>
                        <button
                          type="button"
                          className="shrink-0 rounded-md bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => onStartRun(current.id)}
                          disabled={isBusy || latestRun.status === 'running'}
                        >
                          Rerun
                        </button>
                      </div>
                    ) : null}
                    {[...currentRuns].reverse().map((run) => {
                      const canUndoRun = run.status !== 'running' && Boolean(run.changePatch?.trim()) && !run.undoneAt;
                      const undoUnavailable = run.status !== 'running' && !canUndoRun && !run.undoneAt && Boolean(run.changePatchError);
                      return (
                      <div key={run.id} className="space-y-2">
                        {run.feedback ? (
                          <div className="flex justify-end">
                            <div
                              ref={(element) => {
                                searchTargetRefs.current[`feedback-${run.id}`] = element;
                              }}
                              className={clsx(
                                'max-w-[78%] rounded-lg px-3 py-2 text-sm leading-6 shadow-sm',
                                activeSearchMatch?.key === `feedback-${run.id}`
                                  ? 'bg-md-primary text-md-onPrimary ring-4 ring-md-primary/25'
                                  : 'bg-md-primary text-md-onPrimary'
                              )}
                            >
                              <div className="mb-1 flex items-center justify-end gap-1 text-[11px] font-medium text-md-onPrimary/75">
                                <span>{formatDate(run.createdAt)}</span>
                                <button
                                  type="button"
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-full transition hover:bg-md-onPrimary/10"
                                  title="Copy message"
                                  onClick={() => void copyFeedback(run)}
                                >
                                  {copiedFeedbackRunId === run.id ? <Check size={13} /> : <Copy size={13} />}
                                </button>
                                {run.status !== 'running' ? (
                                  <button
                                    type="button"
                                    className="inline-flex h-6 w-6 items-center justify-center rounded-full transition hover:bg-md-onPrimary/10"
                                    title="Edit as draft"
                                    onClick={() => editFeedback(run)}
                                  >
                                    <Pencil size={13} />
                                  </button>
                                ) : null}
                              </div>
                              <pre className="whitespace-pre-wrap font-sans">
                                <HighlightText text={feedbackDisplay(run.feedback)} query={searchQuery} />
                              </pre>
                            </div>
                          </div>
                        ) : null}
                        <div className="flex justify-start">
                          <div
                            ref={(element) => {
                              searchTargetRefs.current[`result-${run.id}`] = element;
                            }}
                            className={clsx(
                              'max-w-[78%] rounded-lg bg-md-surface px-3 py-2 text-sm leading-6 text-md-text shadow-sm',
                              activeSearchMatch?.key === `result-${run.id}` && 'ring-4 ring-md-primary/20'
                            )}
                          >
                            <div className="mb-2 flex items-center justify-between gap-3 text-xs font-medium text-md-muted">
                              <span className="inline-flex items-center gap-1.5">
                                {run.status === 'running' ? <Loader2 size={13} className="animate-spin" /> : <Bot size={13} />}
                                Codex · {run.status} · {formatDuration(run.startedAt, run.finishedAt)}
                                {run.undoneAt ? <span className="text-md-muted">· undone</span> : null}
                              </span>
                              {canUndoRun ? (
                                <button
                                  type="button"
                                  className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 transition hover:bg-md-surfaceContainer hover:text-md-text disabled:cursor-not-allowed disabled:opacity-50"
                                  title="撤销这次 Codex 产生的未提交改动"
                                  onClick={() => onUndoRun(run.id)}
                                  disabled={isBusy}
                                >
                                  <RotateCcw size={14} />
                                  Undo
                                </button>
                              ) : undoUnavailable ? (
                                <span
                                  className="inline-flex shrink-0 rounded-full px-2 py-1 text-[11px] text-md-muted"
                                  title={run.changePatchError}
                                >
                                  No undo
                                </span>
                              ) : null}
                            </div>
                            {run.undoError ? (
                              <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
                                {run.undoError}
                              </p>
                            ) : null}
                            {run.status === 'running' ? (
                              <div className="space-y-3">
                                <p className="text-sm text-md-muted">Codex 正在处理，下面只显示整理后的关键过程。</p>
                                <RunTimeline run={run} query={searchQuery} />
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <pre className="whitespace-pre-wrap font-sans">
                                  <HighlightText text={runDisplaySummary(run)} query={searchQuery} />
                                </pre>
                                <RunTimeline run={run} query={searchQuery} />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                    })}
                    </div>
                    <button
                      type="button"
                      className="absolute bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-md-primary text-md-onPrimary shadow-lg transition hover:brightness-95"
                      title="Scroll to bottom"
                      onClick={() => {
                        chatScrollRef.current?.scrollTo({
                          top: chatScrollRef.current.scrollHeight,
                          behavior: 'smooth'
                        });
                      }}
                    >
                      <ArrowDown size={17} />
                    </button>
                  </div>
                ) : (
                  <div className="rounded-md bg-md-surface p-3 text-sm text-md-muted">
                    No run yet. Click Start to execute this issue.
                  </div>
                )}
                {latestRun ? (
                  <div className="mt-3 rounded-lg border border-md-outline/20 bg-md-surface p-2">
                    {reviewAttachments.length > 0 ? (
                      <div className="mb-2 flex flex-wrap gap-2 border-b border-md-outline/10 pb-2">
                        {reviewAttachments.map((file, index) => (
                          <div
                            key={`${file.path}-${index}`}
                            className={clsx(
                              'inline-flex max-w-[240px] items-center gap-2 rounded-full border px-3 py-1 text-xs',
                              file.supported
                                ? 'border-md-outline/20 bg-md-surfaceContainer text-md-text'
                                : 'border-red-200 bg-red-50 text-red-700'
                            )}
                            title={file.path}
                          >
                            <FilePlus2 size={13} className="shrink-0" />
                            <span className="truncate">{file.name}</span>
                            {file.truncated ? <span className="shrink-0 text-md-muted">truncated</span> : null}
                            <button
                              type="button"
                              className="ml-1 shrink-0 text-md-muted hover:text-red-600"
                              onClick={() => setReviewAttachments((value) => value.filter((_, itemIndex) => itemIndex !== index))}
                              aria-label={`Remove ${file.name}`}
                            >
                              x
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="flex items-start gap-2">
                      <textarea
                        ref={reviewInputRef}
                        className="min-h-12 min-w-0 flex-1 resize-none overflow-hidden bg-transparent px-2 py-2 text-sm leading-6 text-md-text outline-none placeholder:text-md-muted"
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          reviewFeedbackRef.current = value;
                          const nextHasDraft = Boolean(value.trim());
                          setHasReviewDraft((currentValue) => (currentValue === nextHasDraft ? currentValue : nextHasDraft));
                          resizeReviewInput(event.currentTarget);
                          if (current) scheduleDraftSave(current.id, value);
                        }}
                        onPaste={async (event) => {
                          const target = event.currentTarget;
                          const files = await pastedImageAttachments(event);
                          if (files.length > 0) setReviewAttachments((value) => [...value, ...files]);
                          window.setTimeout(() => resizeReviewInput(target), 0);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            if (isRunning) return;
                            sendContinueFeedback();
                          }
                        }}
                        placeholder={isQuickChange ? '继续描述要调整的地方，Enter 发送，Shift+Enter 换行' : '继续补充验证反馈，Enter 发送，Shift+Enter 换行'}
                      />
                      <IconButton
                        title="Clear draft"
                        disabled={!hasReviewDraft}
                        onClick={() => {
                          if (current) window.localStorage.removeItem(executorDraftStorageKey(current.id));
                          setReviewDraftValue('', { save: false });
                        }}
                      >
                        <X />
                      </IconButton>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs leading-5 text-md-muted">
                          {isQuickChange
                            ? '反馈会继续使用当前任务和工作区上下文；影响面变大时可升级为标准任务。'
                            : 'Continue 会优先处理本轮输入；如果这是新需求，请在输入里明确说明“这是新需求”。'}
                        </p>
                      </div>
                      <div className='flex gap-2'>
                        <IconButton onClick={attachReviewFiles} disabled={isBusy || isRunning} title="Attach files">
                          <FilePlus2 />
                        </IconButton>
                        {isRunning ? (
                          <Button variant="tonal" onClick={() => onCancelRun(latestRun.id)} disabled={isBusy}>
                            <Square size={15} />
                            Pause
                          </Button>
                        ) : (
                          <Button
                            onClick={sendContinueFeedback}
                            disabled={isBusy || (!hasReviewDraft && reviewAttachments.length === 0)}
                          >
                            <Play size={17} />
                            {isQuickChange ? '继续修改' : 'Continue'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          </>
        ) : (
          <p className="rounded-md bg-md-surfaceContainer p-4 text-sm text-md-muted">
            Executor will run tasks after they move from Kanban to Ready.
          </p>
        )}
      </section>
    </div>
  );
}

function formatRunTotalDuration(runs: ExecutorRunRecord[]) {
  const totalMs = runs.reduce((sum, run) => {
    const start = new Date(run.startedAt).getTime();
    const end = run.finishedAt ? new Date(run.finishedAt).getTime() : Date.now();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return sum;
    return sum + end - start;
  }, 0);
  const totalSeconds = Math.floor(totalMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function RunTimeline({ run, query, compact = false }: { run: ExecutorRunRecord; query: string; compact?: boolean }) {
  const activity = runActivitySummary(run);
  const hasActivity =
    activity.progress.length > 0 ||
    activity.readFiles.length > 0 ||
    activity.editedFiles.length > 0 ||
    activity.commands.length > 0 ||
    activity.errors.length > 0;
  if (!hasActivity) {
    return (
      <div className="rounded-md bg-md-surfaceContainer/70 px-3 py-2 text-xs text-md-muted">
        {run.status === 'running' ? 'Codex 正在处理，等待可读进展。' : '没有提取到结构化过程。'}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {activity.progress.length > 0 ? (
        <ActivityBlock
          icon={run.status === 'running' ? Loader2 : Sparkles}
          spinning={run.status === 'running'}
          tone="neutral"
          title={run.status === 'running' ? 'Working' : 'Process'}
          items={compact ? activity.progress.slice(-3) : activity.progress}
          query={query}
        />
      ) : null}
      {activity.editedFiles.length > 0 ? (
        <ActivityBlock
          icon={Pencil}
          tone="edit"
          title={`Edited ${activity.editedFiles.length} file${activity.editedFiles.length > 1 ? 's' : ''}`}
          items={compact ? activity.editedFiles.slice(0, 5) : activity.editedFiles}
          query={query}
        />
      ) : null}
      {activity.readFiles.length > 0 ? (
        <ActivityBlock
          icon={FileSearch}
          tone="read"
          title={`Read ${activity.readFiles.length} file${activity.readFiles.length > 1 ? 's' : ''}`}
          items={compact ? activity.readFiles.slice(0, 4) : activity.readFiles}
          query={query}
        />
      ) : null}
      {activity.commands.length > 0 ? (
        <ActivityBlock
          icon={Terminal}
          tone="command"
          title={`Ran ${activity.commands.length} command${activity.commands.length > 1 ? 's' : ''}`}
          items={activity.commands}
          query={query}
        />
      ) : null}
      {activity.errors.length > 0 ? (
        <ActivityBlock icon={AlertCircle} tone="error" title="Errors" items={activity.errors} query={query} />
      ) : null}
    </div>
  );
}

function ActivityBlock({
  icon: Icon,
  title,
  items,
  query,
  tone,
  spinning = false
}: {
  icon: typeof Sparkles;
  title: string;
  items: string[];
  query: string;
  tone: 'neutral' | 'read' | 'edit' | 'command' | 'error';
  spinning?: boolean;
}) {
  return (
    <div className="rounded-md border border-md-outline/10 bg-md-surfaceContainer/70 p-2.5">
      <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-md-text">
        <span
          className={clsx(
            'inline-flex h-6 w-6 items-center justify-center rounded-full',
            tone === 'neutral' && 'bg-md-surface text-md-muted',
            tone === 'read' && 'bg-purple-100 text-purple-700',
            tone === 'edit' && 'bg-amber-100 text-amber-800',
            tone === 'command' && 'bg-blue-100 text-blue-700',
            tone === 'error' && 'bg-red-100 text-red-700'
          )}
        >
          <Icon size={13} className={spinning ? 'animate-spin' : undefined} />
        </span>
        {title}
      </div>
      <div className="space-y-1">
        {items.map((item, index) => (
          <div key={`${item}-${index}`} className="break-words rounded bg-md-surface/70 px-2 py-1 text-xs leading-5 text-md-muted">
            <HighlightText text={item} query={query} />
          </div>
        ))}
      </div>
    </div>
  );
}

function executorDraftStorageKey(taskId: string) {
  return `executor:continue-draft:${taskId}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countTextMatches(text: string, query: string) {
  const keyword = query.trim();
  if (!keyword) return 0;
  return text.match(new RegExp(escapeRegExp(keyword), 'gi'))?.length || 0;
}

function HighlightText({ text, query }: { text: string; query: string }) {
  const keyword = query.trim();
  if (!keyword) return <>{text}</>;
  const pattern = new RegExp(`(${escapeRegExp(keyword)})`, 'gi');
  const exactPattern = new RegExp(`^${escapeRegExp(keyword)}$`, 'i');
  return (
    <>
      {text.split(pattern).map((part, index) => (
        exactPattern.test(part) ? (
          <mark key={`${part}-${index}`} className="rounded bg-yellow-200 px-0.5 text-black">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      ))}
    </>
  );
}

function buildTaskArchiveDraft({
  task,
  project,
  conversation,
  workItem,
  run,
  prd,
  finalResult
}: {
  task: TaskRecord;
  project?: ProjectRecord;
  conversation?: ConversationRecord;
  workItem?: WorkItemRecord;
  run?: ExecutorRunRecord;
  prd: string;
  finalResult: string;
}) {
  const promptMessages = conversation?.promptMessages || [];
  const userMessages = promptMessages
    .filter((message) => message.role === 'user')
    .map((message) => `- ${message.content}`)
    .join('\n');
  const assistantMessages = promptMessages
    .filter((message) => message.role === 'assistant')
    .map((message) => `- ${message.content}`)
    .join('\n');

  return [
    '类型：任务归档',
    '',
    `标题：${task.title}`,
    `项目：${project?.name || task.projectId}`,
    `状态：${taskStatusLabel(task.status)}`,
    `起始时间：${workItem?.createdAt || task.createdAt}`,
    `结束时间：${new Date().toISOString()}`,
    `PRD / 设计稿：${prd.trim() || '未提供'}`,
    `Codex 参与：${run ? '是' : '否'}`,
    '',
    '## 原始需求',
    workItem ? [`工作记录：${workItem.title}`, workItem.notes ? `备注：${workItem.notes}` : ''].filter(Boolean).join('\n') : task.description,
    '',
    '## Prompt 澄清内容',
    conversation
      ? [
        `需求标题：${conversation.title}`,
        `需求内容：${conversation.requirement || '无'}`,
        userMessages ? `用户补充：\n${userMessages}` : '',
        assistantMessages ? `助手输出：\n${assistantMessages}` : ''
      ].filter(Boolean).join('\n\n')
      : '无关联 Prompt 对话。',
    '',
    '## 生成 Issue',
    task.executionPrompt || conversation?.expandedPrompt || '无',
    '',
    '## Codex 执行结果',
    run ? runResultSummary(run) : '未执行 Codex。',
    '',
    '## 最终结果 / 备注',
    finalResult.trim() || '已验证完成。'
  ].join('\n');
}
