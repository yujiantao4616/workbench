import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Brain,
  Search
} from 'lucide-react';
import { Button, SectionTitle } from '../../components/ui';
import {
  memoryOwnerLabel,
  memorySummary
} from '../../lib/workflow';
import type {
  AgentRecord,
  ConversationRecord,
  MemoryRecord,
  ProjectRecord
} from '../../../shared/types';


export function MemoryModule({
  memories,
  projects,
  agents,
  conversations,
  onDeleteMemory
}: {
  memories: MemoryRecord[];
  projects: ProjectRecord[];
  agents: AgentRecord[];
  conversations: ConversationRecord[];
  onDeleteMemory: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [openMemoryId, setOpenMemoryId] = useState<string>();
  const openMemory = memories.find((memory) => memory.id === openMemoryId);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleMemories = normalizedQuery
    ? memories.filter((memory) => {
      const haystack = [
        memory.title,
        memory.content,
        memory.scope,
        memoryOwnerLabel(memory, projects, agents, conversations)
      ]
        .join('\n')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    })
    : memories;

  return (
    <div className="min-h-0 flex-1">
      <section className="min-h-0 overflow-y-auto rounded-md border border-md-outline/20 bg-md-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-4">
          <SectionTitle icon={Brain} title="Memory" />
          <span className="rounded-full bg-md-surfaceContainer px-3 py-1 text-xs font-semibold text-md-muted">
            {visibleMemories.length} / {memories.length}
          </span>
        </div>
        <label className="mb-4 flex h-11 items-center gap-2 rounded-md border border-md-outline/25 bg-md-surfaceContainer px-3">
          <Search size={17} className="text-md-muted" />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm text-md-text outline-none placeholder:text-md-muted"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search memory by requirement, conclusion, project, or scope"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          {visibleMemories.length === 0 ? (
            <p className="col-span-2 rounded-md bg-md-surfaceContainer p-4 text-sm text-md-muted">
              No memory matched this search.
            </p>
          ) : null}
          {visibleMemories.map((memory) => (
            <article key={memory.id} className="rounded-md bg-md-surfaceContainer p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-md-text">{memory.title}</h3>
                  <p className="mt-1 text-xs text-md-muted">{memoryOwnerLabel(memory, projects, agents, conversations)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-md-surface px-2 py-0.5 text-xs text-md-muted">{memory.scope}</span>
                  <button
                    type="button"
                    className="text-xs font-semibold text-md-primary"
                    onClick={() => setOpenMemoryId(memory.id)}
                  >
                    More
                  </button>
                  <button
                    type="button"
                    className="text-xs font-semibold text-red-600"
                    onClick={() => {
                      if (window.confirm(`Delete memory "${memory.title}"?`)) {
                        onDeleteMemory(memory.id);
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-md-muted">
                {memorySummary(memory.content)}
              </p>
            </article>
          ))}
        </div>
        <Dialog.Root open={Boolean(openMemory)} onOpenChange={(open) => {
          if (!open) setOpenMemoryId(undefined);
        }}>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="dialog-content dialog-content-wide">
              {openMemory ? (
                <>
                  <div className="dialog-header flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <Dialog.Title className="text-base font-semibold text-md-text">
                        {openMemory.title}
                      </Dialog.Title>
                      <Dialog.Description className="mt-1 text-sm text-md-muted">
                        {memoryOwnerLabel(openMemory, projects, agents, conversations)} · {openMemory.scope}
                      </Dialog.Description>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="tonal"
                        onClick={() => {
                          if (window.confirm(`Delete memory "${openMemory.title}"?`)) {
                            onDeleteMemory(openMemory.id);
                            setOpenMemoryId(undefined);
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  <div className="dialog-body">
                    <pre className="whitespace-pre-wrap rounded-md bg-md-surfaceContainer p-4 font-sans text-sm leading-6 text-md-text">
                      {openMemory.content}
                    </pre>
                  </div>
                  <div className="dialog-footer flex justify-end">
                    <Dialog.Close asChild>
                      <Button variant="tonal">Close</Button>
                    </Dialog.Close>
                  </div>
                </>
              ) : null}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </section>
    </div>
  );
}
