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


export function SummaryPanel({
  project,
  tasks,
  activeModule,
  onRescan,
  onGitRefresh,
  onGitCommit,
  onGitPush,
  onGitCheckout,
  onGitCheckoutNewBranch,
  onGenerateCommitMessage,
  onOpenEditor,
  onOpenIssue,
  gitBranchInfo,
  codexHealth,
  collapsed,
  onToggleCollapsed,
  isBusy
}: {
  project?: ProjectRecord;
  tasks: TaskRecord[];
  activeModule: WorkflowModule;
  onRescan: () => void;
  onGitRefresh: () => void;
  onGitCommit: (message: string) => void;
  onGitPush: () => void;
  onGitCheckout: (branch: string) => void;
  onGitCheckoutNewBranch: (branch: string) => void;
  onGenerateCommitMessage: () => Promise<string | undefined>;
  onOpenEditor: () => void;
  onOpenIssue: (taskId: string) => void;
  gitBranchInfo?: GitBranchInfoResult;
  codexHealth?: CodexHealthResult;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  isBusy: boolean;
}) {
  const [commitMessage, setCommitMessage] = useState('');
  const [checkoutBranch, setCheckoutBranch] = useState('');
  const [newBranchName, setNewBranchName] = useState('');

  if (collapsed) {
    return (
      <aside className="flex min-h-0 flex-col items-center border-l border-md-outline/30 bg-md-surface px-2 py-4">
        <button className="rounded-full p-2 text-md-muted hover:bg-md-surfaceContainer" onClick={onToggleCollapsed}>
          <PanelRightOpen size={18} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex min-h-0 flex-col border-l border-md-outline/30 bg-md-surface px-4 py-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-md-muted">Project summary</p>
          <h2 className="truncate text-lg font-semibold text-md-text">{project?.name || 'No project'}</h2>
        </div>
        <div className="flex items-center gap-1">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-md-surfaceContainerHigh text-md-text transition hover:bg-md-surfaceContainer">
                <MoreHorizontal size={18} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={8}
                className="menu-surface w-48"
              >
                <DropdownMenu.Item
                  className="menu-item"
                  onClick={onRescan}
                  disabled={!project || isBusy}
                >
                  Rescan project
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <button className="rounded-full p-2 text-md-muted hover:bg-md-surfaceContainer" onClick={onToggleCollapsed}>
            <PanelRightClose size={18} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <section className="rounded-md bg-md-surfaceContainer p-4">
          <SectionTitle icon={Bot} title="Codex Status" />
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-md-text">
                {codexHealth?.ok ? 'Connected' : codexHealth ? 'Disconnected' : 'Checking'}
              </div>
              <div className="mt-1 text-xs text-md-muted">
                {codexHealth?.ok ? 'Codex CLI' : codexHealth?.error || 'Detecting Codex CLI'}
              </div>
            </div>
            <span
              className={clsx(
                'h-3 w-3 rounded-full',
                codexHealth?.ok ? 'bg-emerald-500' : codexHealth ? 'bg-red-500' : 'bg-amber-500'
              )}
            />
          </div>
        </section>
        <section className="rounded-md bg-md-surfaceContainer p-4">
          <SectionTitle icon={GitBranch} title="Project Tools" />
          <div className="space-y-3">
            <div className="rounded-md bg-md-surface p-3">
              <div className="text-xs text-md-muted">Current branch</div>
              <div className="mt-1 text-sm font-semibold text-md-text">{gitBranchInfo?.currentBranch || 'Not loaded'}</div>
              <div
                className={clsx(
                  'mt-1 text-xs',
                  gitBranchInfo?.error ? 'text-red-600' : gitBranchInfo?.isDirty ? 'text-amber-700' : 'text-emerald-700'
                )}
              >
                {gitBranchInfo?.error
                  ? 'Git unavailable for this project'
                  : gitBranchInfo?.isDirty
                    ? 'Uncommitted changes present'
                    : gitBranchInfo
                      ? 'Working tree clean'
                      : 'Click Refresh to load branch info'}
              </div>
              {gitBranchInfo?.error ? <p className="mt-2 line-clamp-3 text-xs text-md-muted">{gitBranchInfo.error}</p> : null}
            </div>
            <div className="rounded-md bg-md-surface p-2">
              <div className="mb-3 flex items-center justify-between px-1 py-1">
                <span className="text-sm font-medium text-md-text">Actions</span>
                <MoreHorizontal size={17} className="text-md-muted" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-md-surfaceContainer px-2 text-xs font-medium text-md-text hover:bg-md-surfaceContainerHigh disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={onOpenEditor}
                    disabled={!project || isBusy}
                  >
                    <FolderOpen size={14} />
                    Editor
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-md-surfaceContainer px-2 text-xs font-medium text-md-text hover:bg-md-surfaceContainerHigh disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={onGitRefresh}
                    disabled={!project || isBusy}
                  >
                    <RefreshCw size={14} />
                    Refresh
                  </button>
                </div>

                <div className="rounded-md border border-md-outline/20 bg-md-surfaceContainer/60 p-2">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-[0.08em] text-md-muted">Branch</span>
                    {gitBranchInfo?.isDirty ? <span className="text-xs text-amber-700">dirty</span> : null}
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_72px] gap-2">
                    <Select.Root
                      value={checkoutBranch}
                      onValueChange={setCheckoutBranch}
                      disabled={!project || isBusy || !gitBranchInfo || Boolean(gitBranchInfo.error)}
                    >
                      <Select.Trigger className="select-trigger h-9 text-xs">
                        <Select.Value placeholder="Switch to..." />
                        <Select.Icon>
                          <ChevronDown size={14} />
                        </Select.Icon>
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content className="select-content" position="popper" sideOffset={6}>
                          <Select.Viewport className="p-1">
                            {gitBranchInfo?.branches
                              .filter((branch) => branch !== gitBranchInfo.currentBranch)
                              .map((branch) => (
                                <Select.Item key={branch} value={branch} className="select-item">
                                  <Select.ItemText>{branch}</Select.ItemText>
                                </Select.Item>
                              ))}
                          </Select.Viewport>
                        </Select.Content>
                      </Select.Portal>
                    </Select.Root>
                    <button
                      type="button"
                      className="h-9 rounded-md bg-md-surface px-2 text-xs font-medium text-md-primary hover:bg-md-surfaceContainerHigh disabled:cursor-not-allowed disabled:text-md-muted/60"
                      disabled={!project || isBusy || !checkoutBranch || gitBranchInfo?.isDirty || Boolean(gitBranchInfo?.error)}
                      onClick={() => {
                        if (checkoutBranch && window.confirm(`Checkout ${checkoutBranch}?`)) {
                          onGitCheckout(checkoutBranch);
                          setCheckoutBranch('');
                        }
                      }}
                    >
                      Switch
                    </button>
                  </div>
                  <div className="mt-2 border-t border-md-outline/10 pt-2">
                    <Dialog.Root>
                      <Dialog.Trigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-md-primary hover:bg-md-surface disabled:cursor-not-allowed disabled:text-md-muted/60"
                          disabled={!project || isBusy || !gitBranchInfo || gitBranchInfo?.isDirty || Boolean(gitBranchInfo?.error)}
                        >
                          <Plus size={13} />
                          Create branch
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
                          <Dialog.Title className="text-base font-semibold text-md-text">Create new branch</Dialog.Title>
                          <Dialog.Description className="mt-1 text-sm text-md-muted">
                            Create from the current branch and checkout immediately.
                          </Dialog.Description>
                          <div className="dialog-body">
                            <input
                              className="field-input h-10 text-sm"
                              value={newBranchName}
                              onFocus={() => {
                                if (!newBranchName.trim()) setNewBranchName('features/');
                              }}
                              onChange={(event) => setNewBranchName(event.target.value)}
                              placeholder="features/name"
                              disabled={!project || isBusy}
                            />
                          </div>
                          <div className="dialog-footer flex justify-end gap-2">
                            <Dialog.Close asChild>
                              <button
                                type="button"
                                className="h-9 rounded-md bg-md-surfaceContainer px-3 text-sm font-medium text-md-text hover:bg-md-surfaceContainerHigh"
                              >
                                Cancel
                              </button>
                            </Dialog.Close>
                            <Dialog.Close asChild>
                              <button
                                type="button"
                                className="h-9 rounded-md bg-md-primary px-3 text-sm font-medium text-md-onPrimary hover:brightness-95 disabled:cursor-not-allowed disabled:bg-md-surfaceContainerHigh disabled:text-md-muted/60"
                                disabled={!project || isBusy || !newBranchName.trim()}
                                onClick={() => {
                                  const branch = normalizeFeatureBranchName(newBranchName);
                                  if (branch) {
                                    onGitCheckoutNewBranch(branch);
                                    setNewBranchName('');
                                  }
                                }}
                              >
                                Create
                              </button>
                            </Dialog.Close>
                          </div>
                        </Dialog.Content>
                      </Dialog.Portal>
                    </Dialog.Root>
                  </div>
                </div>

                <div className="rounded-md border border-md-outline/20 bg-md-surfaceContainer/60 p-2">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-md-muted">Commit</div>
                  <div className="flex items-center gap-2">
                    <input
                      className="field-input h-9 min-w-0 flex-1 text-xs"
                      value={commitMessage}
                      onChange={(event) => setCommitMessage(event.target.value)}
                      placeholder="Commit message"
                      disabled={!project || isBusy}
                    />
                    <button
                      type="button"
                      className="h-9 rounded-md bg-md-surface px-2 text-xs font-medium text-md-primary hover:bg-md-surfaceContainerHigh disabled:cursor-not-allowed disabled:text-md-muted/60"
                      disabled={!project || isBusy}
                      onClick={async () => {
                        const message = await onGenerateCommitMessage();
                        if (message) setCommitMessage(message);
                      }}
                    >
                      Gen
                    </button>
                  </div>
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      className="h-8 rounded-md bg-md-surface px-3 text-xs font-medium text-md-text hover:bg-md-surfaceContainerHigh disabled:cursor-not-allowed disabled:text-md-muted/60"
                      disabled={!project || isBusy || !commitMessage.trim()}
                      onClick={() => {
                        onGitCommit(commitMessage.trim());
                        setCommitMessage('');
                      }}
                    >
                      Commit
                    </button>
                    <button
                      type="button"
                      className="h-8 rounded-md bg-md-primary px-3 text-xs font-medium text-md-onPrimary hover:brightness-95 disabled:cursor-not-allowed disabled:bg-md-surfaceContainerHigh disabled:text-md-muted/60"
                      disabled={!project || isBusy}
                      onClick={() => {
                        if (window.confirm('Push current branch?')) onGitPush();
                      }}
                    >
                      Push
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {activeModule !== 'issues' ? (
          <section className="rounded-md bg-md-surfaceContainer p-4">
            <div className="flex items-start justify-between gap-3">
              <SectionTitle icon={ClipboardList} title="Project Issues" />
              <span className="text-xs font-medium text-md-muted">{tasks.length}</span>
            </div>
            <div className="space-y-2">
              {!project ? <p className="text-sm text-md-muted">Select a project to view related issues.</p> : null}
              {project && tasks.length === 0 ? <p className="text-sm text-md-muted">No issues for this project yet.</p> : null}
              {tasks.slice(0, 8).map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className="w-full rounded-md bg-md-surface p-3 text-left transition hover:bg-md-surfaceContainerHigh"
                  onClick={() => onOpenIssue(task.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="line-clamp-2 text-sm font-semibold text-md-text">{task.title}</div>
                      <div className="mt-1 text-xs text-md-muted">{taskStatusLabel(task.status)}</div>
                    </div>
                    <span className={clsx('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', priorityClass(task.priority))}>
                      {task.priority}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

function normalizeFeatureBranchName(branch: string) {
  const value = branch.trim().replace(/^\/+/, '');
  if (!value) return value;
  return value.startsWith('features/') ? value : `features/${value.replace(/^features?\//, '')}`;
}
