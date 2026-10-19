import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as ContextMenu from '@radix-ui/react-context-menu';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Select from '@radix-ui/react-select';
import clsx from 'clsx';
import {
  Bot,
  Brain,
  Bug,
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
  Trash2
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
  workItemLinkedTask,
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


export function Sidebar({
  state,
  selectedProjectId,
  selectedConversationId,
  onSelectProject,
  onOpenProjectUnfinished,
  onSelectConversation,
  onAddProject,
  onRemoveProject,
  onDeleteConversation,
  activeModule,
  onChangeModule,
  collapsed,
  onToggleCollapsed,
  isBusy
}: {
  state: AppState;
  selectedProjectId?: string;
  selectedConversationId?: string;
  onSelectProject: (id: string) => void;
  onOpenProjectUnfinished: (projectId: string) => void;
  onSelectConversation: (id: string) => void;
  onAddProject: () => void;
  onRemoveProject: (projectId: string, mode: 'hide' | 'delete') => void;
  onDeleteConversation: (id: string) => void;
  activeModule: WorkflowModule;
  onChangeModule: (module: WorkflowModule) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  isBusy: boolean;
}) {
  const activeTasks = state.tasks.filter((task) => !task.deletedAt);
  const activeWorkItems = state.workItems.filter((item) => !item.deletedAt);
  const visibleProjects = state.projects.filter((project) => !project.hiddenAt && !project.deletedAt);
  const selectedProject = visibleProjects.find((project) => project.id === selectedProjectId);
  const selectedAgent = state.agents.find((agent) => agent.projectId === selectedProjectId);
  const conversations = state.conversations.filter((conversation) => !conversation.deletedAt && conversation.agentId === selectedAgent?.id);
  const runningTaskIds = new Set(state.runs.filter((run) => run.status === 'running').map((run) => run.taskId));
  const sortedProjects = [...visibleProjects].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const globalModuleActive = ['kanban', 'tapd', 'memory', 'settings', 'trash'].includes(activeModule);
  const trashCount = trashItemCount(state);

  if (collapsed) {
    return (
      <aside className="flex min-h-0 flex-col items-center border-r border-md-outline/30 bg-md-surface px-2 py-4">
        <button className="rounded-full p-2 text-md-muted hover:bg-md-surfaceContainer" onClick={onToggleCollapsed}>
          <PanelLeftOpen size={18} />
        </button>
        <button
          className={clsx(
            'mt-3 rounded-full p-2 hover:bg-md-surfaceContainer',
            activeModule === 'kanban' ? 'bg-md-primary text-md-onPrimary' : 'text-md-muted'
          )}
          onClick={() => onChangeModule('kanban')}
          title="Work Calendar"
        >
          <CalendarDays size={18} />
        </button>
        <button
          className={clsx(
            'mt-2 rounded-full p-2 hover:bg-md-surfaceContainer',
            activeModule === 'tapd' ? 'bg-md-primary text-md-onPrimary' : 'text-md-muted'
          )}
          onClick={() => onChangeModule('tapd')}
          title="TAPD My Work"
        >
          <Bug size={18} />
        </button>
        <button
          className={clsx(
            'mt-2 rounded-full p-2 hover:bg-md-surfaceContainer',
            activeModule === 'memory' ? 'bg-md-primary text-md-onPrimary' : 'text-md-muted'
          )}
          onClick={() => onChangeModule('memory')}
          title="Memory"
        >
          <Brain size={18} />
        </button>
        <button
          className={clsx(
            'mt-2 rounded-full p-2 hover:bg-md-surfaceContainer',
            activeModule === 'settings' ? 'bg-md-primary text-md-onPrimary' : 'text-md-muted'
          )}
          onClick={() => onChangeModule('settings')}
          title="Settings"
        >
          <Settings size={18} />
        </button>
        <button
          className={clsx(
            'relative mt-auto rounded-full p-2 hover:bg-md-surfaceContainer',
            activeModule === 'trash' ? 'bg-md-primary text-md-onPrimary' : 'text-md-muted'
          )}
          onClick={() => onChangeModule('trash')}
          title="Trash"
        >
          <Trash2 size={18} />
          {trashCount > 0 ? (
            <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white">
              {trashCount > 99 ? '99+' : trashCount}
            </span>
          ) : null}
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex min-h-0 flex-col border-r border-md-outline/30 bg-md-surface px-3 py-4">
      <div className="mb-4 flex items-center justify-between px-2">
        <div>
          <h1 className="text-lg font-semibold text-md-text">Codex Workbench</h1>
          <p className="text-xs text-md-muted">Plan, run, remember</p>
        </div>
        <div className="flex items-center gap-1">
          <IconButton onClick={onAddProject} disabled={isBusy} title="Add project">
            {isBusy ? <Loader2 className="animate-spin" /> : <FolderOpen />}
          </IconButton>
          <button className="rounded-full p-2 text-md-muted hover:bg-md-surfaceContainer" onClick={onToggleCollapsed}>
            <PanelLeftClose size={18} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        <button
          type="button"
          onClick={() => onChangeModule('kanban')}
          className={clsx(
            'mb-3 flex w-full items-center gap-3 rounded-md border p-3 text-left transition',
            activeModule === 'kanban'
              ? 'border-md-primary bg-md-primary text-md-onPrimary shadow-sm'
              : 'border-transparent bg-md-surfaceContainer hover:bg-md-surfaceContainerHigh'
          )}
        >
          <CalendarDays size={18} />
          <div className="min-w-0">
            <div className="text-sm font-semibold">Work Calendar</div>
            <div className={clsx('truncate text-xs', activeModule === 'kanban' ? 'text-md-onPrimary/80' : 'text-md-muted')}>
              全局记录、排期和工作安排
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChangeModule('tapd')}
          className={clsx(
            'mb-3 flex w-full items-center gap-3 rounded-md border p-3 text-left transition',
            activeModule === 'tapd'
              ? 'border-md-primary bg-md-primary text-md-onPrimary shadow-sm'
              : 'border-transparent bg-md-surfaceContainer hover:bg-md-surfaceContainerHigh'
          )}
        >
          <Bug size={18} />
          <div className="min-w-0">
            <div className="text-sm font-semibold">TAPD My Work</div>
            <div className={clsx('truncate text-xs', activeModule === 'tapd' ? 'text-md-onPrimary/80' : 'text-md-muted')}>
              我的跨项目待办
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChangeModule('settings')}
          className={clsx(
            'mb-3 flex w-full items-center gap-3 rounded-md border p-3 text-left transition',
            activeModule === 'settings'
              ? 'border-md-primary bg-md-primary text-md-onPrimary shadow-sm'
              : 'border-transparent bg-md-surfaceContainer hover:bg-md-surfaceContainerHigh'
          )}
        >
          <Settings size={18} />
          <div className="min-w-0">
            <div className="text-sm font-semibold">Settings</div>
            <div className={clsx('truncate text-xs', activeModule === 'settings' ? 'text-md-onPrimary/80' : 'text-md-muted')}>
              Prompt 规则和工作流偏好
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChangeModule('memory')}
          className={clsx(
            'mb-3 flex w-full items-center gap-3 rounded-md border p-3 text-left transition',
            activeModule === 'memory'
              ? 'border-md-primary bg-md-primary text-md-onPrimary shadow-sm'
              : 'border-transparent bg-md-surfaceContainer hover:bg-md-surfaceContainerHigh'
          )}
        >
          <Brain size={18} />
          <div className="min-w-0">
            <div className="text-sm font-semibold">Memory</div>
            <div className={clsx('truncate text-xs', activeModule === 'memory' ? 'text-md-onPrimary/80' : 'text-md-muted')}>
              任务归档和经验记忆
            </div>
          </div>
        </button>

        {visibleProjects.length === 0 ? (
          <div className="rounded-md border border-dashed border-md-outline/60 bg-md-surfaceContainer p-4 text-sm text-md-muted">
            Add a local project to create its agent.
          </div>
        ) : null}

        {sortedProjects.length > 0 ? (
          <section className="rounded-md bg-md-surfaceContainer/60 p-2">
            <div className="mb-2 px-1">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-md-muted">Projects</h2>
            </div>
            <div className="space-y-2">
              {sortedProjects.map((project) => {
                const agent = state.agents.find((item) => item.projectId === project.id);
                const selected = !globalModuleActive && selectedProjectId === project.id;
                const openTasks = activeTasks.filter((task) => task.projectId === project.id && task.status !== 'done').length;
                const openWorkItems = activeWorkItems.filter(
                  (item) => item.projectId === project.id && item.status !== 'done' && !workItemLinkedTask(item, activeTasks)
                ).length;
                const unfinishedCount = openTasks + openWorkItems;
                const isRunning = activeTasks.some((task) => task.projectId === project.id && runningTaskIds.has(task.id));
                return (
                  <article
                    key={project.id}
                    className={clsx(
                      'group flex items-center gap-2 rounded-md border p-3 transition',
                      selected
                        ? 'border-md-primary bg-md-surfaceContainerHigh shadow-sm'
                        : 'border-transparent hover:bg-md-surfaceContainer'
                    )}
                  >
                    <button type="button" onClick={() => onSelectProject(project.id)} className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <Bot size={18} className={clsx('shrink-0', selected ? 'text-md-primary' : 'text-md-muted')} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-md-text">{project.name || agent?.name}</span>
                          </div>
                          <div className="truncate text-xs text-md-muted">{unfinishedCount > 0 ? `${unfinishedCount} unfinished` : 'All done'}</div>
                        </div>
                      </div>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      {isRunning ? (
                        <Loader2 size={16} className="shrink-0 animate-spin text-md-primary" />
                      ) : unfinishedCount > 0 ? (
                        <button
                          type="button"
                          className="rounded-full bg-md-primary px-2 py-0.5 text-xs font-semibold text-md-onPrimary transition hover:brightness-95"
                          onClick={() => onOpenProjectUnfinished(project.id)}
                          title={unfinishedCount > 1 ? 'Open project issues' : 'Open executor'}
                        >
                          {unfinishedCount}
                        </button>
                      ) : (
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger asChild>
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-md-muted transition hover:bg-md-surface hover:text-md-text"
                              aria-label={`${project.name} project actions`}
                            >
                              <MoreHorizontal size={16} />
                            </button>
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content align="end" sideOffset={6} className="menu-surface w-40">
                              <DropdownMenu.Item className="menu-item" onClick={() => onRemoveProject(project.id, 'hide')}>
                                Hide from sidebar
                              </DropdownMenu.Item>
                              <DropdownMenu.Item
                                className="menu-item text-red-600"
                                onClick={() => {
                                  if (window.confirm(`删除项目 "${project.name}" 以及相关内容记录？此操作不会删除本地源码文件。`)) {
                                    onRemoveProject(project.id, 'delete');
                                  }
                                }}
                              >
                                Delete records
                              </DropdownMenu.Item>
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onChangeModule('trash')}
        className={clsx(
          'mt-3 flex w-full items-center gap-3 rounded-md border p-3 text-left transition',
          activeModule === 'trash'
            ? 'border-md-primary bg-md-primary text-md-onPrimary shadow-sm'
            : 'border-transparent bg-md-surfaceContainer hover:bg-md-surfaceContainerHigh'
        )}
      >
        <div className="relative">
          <Trash2 size={18} />
          {trashCount > 0 ? (
            <span className="absolute -right-2 -top-2 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-4 text-white">
              {trashCount > 99 ? '99+' : trashCount}
            </span>
          ) : null}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">Trash</div>
          <div className={clsx('truncate text-xs', activeModule === 'trash' ? 'text-md-onPrimary/80' : 'text-md-muted')}>
            回收站
          </div>
        </div>
      </button>
    </aside>
  );
}

function trashItemCount(state: AppState) {
  return [
    ...state.projects.filter((item) => item.deletedAt || item.hiddenAt),
    ...state.conversations,
    ...state.tasks,
    ...state.taskGroups,
    ...state.workItems,
    ...state.memories,
    ...state.tapdDefects
  ].filter((item) => item.deletedAt).length + state.projects.filter((item) => item.hiddenAt && !item.deletedAt).length;
}
