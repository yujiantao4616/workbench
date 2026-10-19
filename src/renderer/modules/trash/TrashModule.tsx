import { useMemo, useState } from 'react';
import { RotateCcw, Search, Trash2 } from 'lucide-react';
import { Button, SectionTitle } from '../../components/ui';
import { formatDate, taskStatusLabel, workItemStatusLabel } from '../../lib/workflow';
import type { AppState, TrashEntityType, TrashItemInput } from '../../../shared/types';

type TrashEntry = {
  type: TrashEntityType;
  id: string;
  title: string;
  meta: string;
  deletedAt: string;
};

export function TrashModule({
  state,
  onRestore,
  onDeleteForever,
  onClearAll,
  isBusy
}: {
  state: AppState;
  onRestore: (input: TrashItemInput) => void;
  onDeleteForever: (input: TrashItemInput) => void;
  onClearAll: () => void;
  isBusy: boolean;
}) {
  const [query, setQuery] = useState('');
  const entries = useMemo(() => buildTrashEntries(state), [state]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleEntries = normalizedQuery
    ? entries.filter((entry) => [entry.type, entry.title, entry.meta].join('\n').toLowerCase().includes(normalizedQuery))
    : entries;

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-md border border-md-outline/20 bg-md-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <SectionTitle icon={Trash2} title="Trash" />
          <h2 className="text-lg font-semibold text-md-text">回收站</h2>
          <p className="mt-1 text-sm text-md-muted">删除的项目、issue、工作记录、Memory 和 TAPD 工作记录会先保存在这里。</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-md-surfaceContainer px-3 py-1 text-sm font-semibold text-md-muted">
            {visibleEntries.length} / {entries.length}
          </span>
          <Button
            variant="tonal"
            disabled={isBusy || entries.length === 0}
            onClick={() => {
              if (window.confirm(`永久删除回收站中的 ${entries.length} 条记录？此操作无法撤销。`)) {
                onClearAll();
              }
            }}
          >
            <Trash2 size={15} />
            Clear All
          </Button>
        </div>
      </div>

      <label className="mb-4 flex h-11 items-center gap-2 rounded-md border border-md-outline/25 bg-md-surfaceContainer px-3">
        <Search size={17} className="text-md-muted" />
        <input
          className="min-w-0 flex-1 bg-transparent text-sm text-md-text outline-none placeholder:text-md-muted"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search trash by title, type, or project"
        />
      </label>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {visibleEntries.length === 0 ? (
          <p className="rounded-md bg-md-surfaceContainer p-4 text-sm text-md-muted">
            {entries.length === 0 ? 'Trash is empty.' : 'No trash item matched this search.'}
          </p>
        ) : null}
        {visibleEntries.map((entry) => (
          <article key={`${entry.type}:${entry.id}`} className="rounded-md border border-md-outline/20 bg-md-surfaceContainer p-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-full bg-md-surface px-2 py-0.5 text-xs font-semibold text-md-muted">
                    {trashTypeLabel(entry.type)}
                  </span>
                  <span className="text-xs text-md-muted">Deleted {formatDate(entry.deletedAt)}</span>
                </div>
                <h3 className="truncate text-sm font-semibold text-md-text">{entry.title}</h3>
                <p className="mt-1 line-clamp-2 text-xs text-md-muted">{entry.meta}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="tonal"
                  disabled={isBusy}
                  onClick={() => onRestore({ type: entry.type, id: entry.id })}
                >
                  <RotateCcw size={15} />
                  Restore
                </Button>
                <Button
                  variant="tonal"
                  disabled={isBusy}
                  onClick={() => {
                    if (window.confirm(`永久删除 "${entry.title}"？此操作无法撤销。`)) {
                      onDeleteForever({ type: entry.type, id: entry.id });
                    }
                  }}
                >
                  <Trash2 size={15} />
                  Delete forever
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function buildTrashEntries(state: AppState): TrashEntry[] {
  const projectName = (projectId?: string) => state.projects.find((project) => project.id === projectId)?.name || 'No project';
  const agentProject = (agentId: string) => state.agents.find((agent) => agent.id === agentId)?.projectId;
  return [
    ...state.projects.filter((project) => project.deletedAt || project.hiddenAt).map((project) => ({
      type: 'project' as const,
      id: project.id,
      title: project.name,
      meta: `${project.deletedAt ? 'Deleted project records' : 'Hidden from sidebar'} · ${project.path}`,
      deletedAt: project.deletedAt || project.hiddenAt || project.updatedAt
    })),
    ...state.conversations.filter((conversation) => conversation.deletedAt).map((conversation) => ({
      type: 'conversation' as const,
      id: conversation.id,
      title: conversation.title,
      meta: projectName(agentProject(conversation.agentId)),
      deletedAt: conversation.deletedAt || conversation.updatedAt
    })),
    ...state.tasks.filter((task) => task.deletedAt).map((task) => ({
      type: 'task' as const,
      id: task.id,
      title: task.title,
      meta: `${projectName(task.projectId)} · ${taskStatusLabel(task.status)}`,
      deletedAt: task.deletedAt || task.updatedAt
    })),
    ...state.taskGroups.filter((group) => group.deletedAt).map((group) => ({
      type: 'taskGroup' as const,
      id: group.id,
      title: group.title,
      meta: `${group.projectIds.length} project(s)`,
      deletedAt: group.deletedAt || group.updatedAt
    })),
    ...state.workItems.filter((item) => item.deletedAt).map((item) => ({
      type: 'workItem' as const,
      id: item.id,
      title: item.title,
      meta: `${projectName(item.projectId)} · ${workItemStatusLabel(item.status)}`,
      deletedAt: item.deletedAt || item.updatedAt
    })),
    ...state.memories.filter((memory) => memory.deletedAt).map((memory) => ({
      type: 'memory' as const,
      id: memory.id,
      title: memory.title,
      meta: memory.scope,
      deletedAt: memory.deletedAt || memory.updatedAt
    })),
    ...state.tapdDefects.filter((defect) => defect.deletedAt).map((defect) => ({
      type: 'tapdDefect' as const,
      id: defect.id,
      title: defect.title,
      meta: `${defect.type || 'bug'} · ${defect.defectId} · ${defect.status || 'unknown'}`,
      deletedAt: defect.deletedAt || defect.syncedAt
    }))
  ].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

function trashTypeLabel(type: TrashEntityType) {
  const labels: Record<TrashEntityType, string> = {
    project: 'Project',
    conversation: 'Prompt',
    task: 'Issue',
    taskGroup: 'Issue Group',
    workItem: 'Work Item',
    memory: 'Memory',
    tapdDefect: 'TAPD'
  };
  return labels[type];
}
