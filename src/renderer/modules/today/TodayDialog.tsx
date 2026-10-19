import { useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import clsx from 'clsx';
import { AlertCircle, CalendarDays, Clock3, Loader2, Search, ShieldCheck, X } from 'lucide-react';
import { Button, IconButton, SectionTitle } from '../../components/ui';
import { priorityClass, taskStatusLabel, workItemEffectiveStatus, workItemLinkedTask, workItemStatusLabel } from '../../lib/workflow';
import type { ExecutorRunRecord, ProjectRecord, TaskPriority, TaskRecord, WorkItemRecord } from '../../../shared/types';

type TodayEntry = {
  id: string;
  kind: 'workItem' | 'task';
  title: string;
  projectName: string;
  priority: TaskPriority;
  status: string;
  statusLabel: string;
  running: boolean;
  review: boolean;
  record: WorkItemRecord | TaskRecord;
};

const priorityOrder: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2
};

export function TodayDialog({
  open,
  onOpenChange,
  workItems,
  tasks,
  projects,
  runs,
  onOpenWorkItem,
  onOpenTask
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workItems: WorkItemRecord[];
  tasks: TaskRecord[];
  projects: ProjectRecord[];
  runs: ExecutorRunRecord[];
  onOpenWorkItem: (item: WorkItemRecord) => void;
  onOpenTask: (task: TaskRecord) => void;
}) {
  const [query, setQuery] = useState('');
  const entries = useMemo(() => {
    const projectName = (projectId: string | undefined) => projects.find((project) => project.id === projectId)?.name || 'No project yet';
    const runningTaskIds = new Set(runs.filter((run) => run.status === 'running').map((run) => run.taskId));
    const workItemEntries: TodayEntry[] = workItems
      .filter((item) => {
        const linkedTask = workItemLinkedTask(item, tasks);
        return !linkedTask && workItemEffectiveStatus(item, tasks) !== 'done';
      })
      .map((item) => {
        const effectiveStatus = workItemEffectiveStatus(item, tasks);
        return {
          id: item.id,
          kind: 'workItem',
          title: item.title,
          projectName: projectName(item.projectId),
          priority: item.priority,
          status: effectiveStatus,
          statusLabel: workItemStatusLabel(effectiveStatus),
          running: false,
          review: false,
          record: item
        };
      });
    const taskEntries: TodayEntry[] = tasks
      .filter((task) => task.status !== 'done')
      .map((task) => ({
        id: task.id,
        kind: 'task',
        title: task.title,
        projectName: projectName(task.projectId),
        priority: task.priority,
        status: task.status,
        statusLabel: taskStatusLabel(task.status),
        running: runningTaskIds.has(task.id),
        review: task.status === 'review',
        record: task
      }));
    return [...workItemEntries, ...taskEntries].sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.title.localeCompare(b.title);
    });
  }, [projects, runs, tasks, workItems]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredEntries = normalizedQuery
    ? entries.filter((entry) => [entry.title, entry.projectName, entry.statusLabel, entry.priority].join(' ').toLowerCase().includes(normalizedQuery))
    : entries;
  const runningEntries = filteredEntries.filter((entry) => entry.running);
  const reviewEntries = filteredEntries.filter((entry) => entry.review);
  const needChangesEntries = filteredEntries.filter((entry) => entry.status === 'need-changes' || entry.status === 'blocked');

  function openEntry(entry: TodayEntry) {
    if (entry.kind === 'workItem') {
      onOpenWorkItem(entry.record as WorkItemRecord);
      return;
    }
    onOpenTask(entry.record as TaskRecord);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content dialog-content-today">
          <div className="dialog-header flex items-start justify-between gap-4">
            <div>
              <SectionTitle icon={CalendarDays} title="Today" />
              <Dialog.Title className="text-xl font-semibold text-md-text">今日工作台</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-md-muted">
                聚焦还没 Done 的任务。点击任务会按当前阶段跳转到对应模块。
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <IconButton title="Close today">
                <X />
              </IconButton>
            </Dialog.Close>
          </div>

          <div className="dialog-body flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-2">
              <TodayMetric label="未闭环" value={entries.length} />
              <TodayMetric label="执行中" value={entries.filter((entry) => entry.running).length} />
              <TodayMetric label="待验证" value={entries.filter((entry) => entry.review).length} />
            </div>

            <div className="flex items-center gap-2 rounded-md border border-md-outline/20 bg-md-surfaceContainer px-3">
              <Search size={16} className="text-md-muted" />
              <input
                className="h-11 flex-1 bg-transparent text-sm text-md-text outline-none placeholder:text-md-muted"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索任务、项目、状态或优先级"
              />
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)] gap-4">
              <TodaySection
                title="未闭环"
                icon={Clock3}
                entries={filteredEntries}
                emptyText="没有未闭环任务。"
                onOpenEntry={openEntry}
                tall
              />
              <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
                <TodaySection
                  title="执行中"
                  icon={Loader2}
                  entries={runningEntries}
                  emptyText="当前没有正在执行的 Codex。"
                  onOpenEntry={openEntry}
                />
                <TodaySection
                  title="待验证"
                  icon={ShieldCheck}
                  entries={reviewEntries}
                  emptyText="当前没有等待验证的任务。"
                  onOpenEntry={openEntry}
                />
                <TodaySection
                  title="需修正"
                  icon={AlertCircle}
                  entries={needChangesEntries}
                  emptyText="当前没有需要修正或阻塞的任务。"
                  onOpenEntry={openEntry}
                />
              </div>
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
  );
}

function TodayMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-md-surfaceContainer p-3">
      <div className="text-lg font-semibold text-md-text">{value}</div>
      <div className="text-xs text-md-muted">{label}</div>
    </div>
  );
}

function TodaySection({
  title,
  icon: Icon,
  entries,
  emptyText,
  onOpenEntry,
  tall
}: {
  title: string;
  icon: typeof CalendarDays;
  entries: TodayEntry[];
  emptyText: string;
  onOpenEntry: (entry: TodayEntry) => void;
  tall?: boolean;
}) {
  return (
    <section className={clsx('flex min-h-0 flex-col rounded-md bg-md-surfaceContainer p-3', tall ? 'h-full' : 'max-h-[220px]')}>
      <SectionTitle icon={Icon} title={title} />
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {entries.length === 0 ? <p className="rounded-md bg-md-surface p-3 text-sm text-md-muted">{emptyText}</p> : null}
        {entries.map((entry) => (
          <button
            key={`${entry.kind}:${entry.id}`}
            type="button"
            className="w-full rounded-md bg-md-surface p-3 text-left transition hover:bg-md-surfaceContainerHigh"
            onClick={() => onOpenEntry(entry)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="line-clamp-2 text-sm font-semibold text-md-text">{entry.title}</h4>
                <p className="mt-1 truncate text-xs text-md-muted">{entry.projectName}</p>
              </div>
              <span className={clsx('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', priorityClass(entry.priority))}>
                {entry.priority}
              </span>
            </div>
            <div className="mt-2 text-xs text-md-muted">{entry.statusLabel}</div>
          </button>
        ))}
      </div>
    </section>
  );
}
