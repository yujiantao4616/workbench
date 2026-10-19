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
  Zap
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


export function TaskCard({
  task,
  project,
  onStatus,
  onDelete
}: {
  task: TaskRecord;
  project?: ProjectRecord;
  onStatus: (taskId: string, status: TaskStatus) => void;
  onDelete?: (taskId: string) => void;
}) {
  const card = (
    <article className="rounded-md border border-md-outline/20 bg-md-surface p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-semibold text-md-text">{task.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-md-muted">
            <span>{project?.name || 'Unknown project'}</span>
            {task.workflowMode === 'quick-change' ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-700">
                <Zap size={11} />
                快速修改
              </span>
            ) : null}
          </div>
        </div>
        <span
          className={clsx(
            'rounded-full px-2 py-0.5 text-xs font-semibold',
            task.priority === 'high' && 'bg-red-100 text-red-700',
            task.priority === 'medium' && 'bg-amber-100 text-amber-800',
            task.priority === 'low' && 'bg-emerald-100 text-emerald-700'
          )}
        >
          {task.priority}
        </span>
      </div>
      <p className="mt-3 line-clamp-4 text-xs leading-5 text-md-muted">{task.description}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <select
          className="h-9 rounded-md border border-md-outline/30 bg-md-surface px-2 text-xs text-md-text outline-none"
          value={task.status}
          onChange={(event) => onStatus(task.id, event.target.value as TaskStatus)}
        >
          {taskColumns.map((column) => (
            <option key={column.id} value={column.id}>
              {column.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-md-muted">{formatDate(task.updatedAt)}</span>
      </div>
    </article>
  );

  if (!onDelete) return card;

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{card}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="menu-surface w-40">
          <ContextMenu.Item
            className="menu-item text-red-600"
            onClick={() => {
              if (window.confirm(`删除任务 "${task.title}"？相关执行记录也会删除。`)) {
                onDelete(task.id);
              }
            }}
          >
            Delete task
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
