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


export function ConversationList({
  conversations,
  selectedId,
  onSelect
}: {
  conversations: ConversationRecord[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {conversations.map((conversation) => (
        <button
          key={conversation.id}
          onClick={() => onSelect(conversation.id)}
          className={clsx(
            'w-full rounded-md border p-3 text-left transition',
            selectedId === conversation.id
              ? 'border-md-primary bg-md-surfaceContainerHigh'
              : 'border-md-outline/20 bg-md-surface hover:bg-md-surfaceContainer'
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-sm font-medium text-md-text">{conversation.title}</span>
            <span className="shrink-0 text-xs text-md-muted">{formatDate(conversation.updatedAt)}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-md-muted">{conversation.requirement || 'No requirement yet'}</p>
        </button>
      ))}
    </div>
  );
}

export function PromptModule({
  project,
  agent,
  selectedConversation,
  onExpandPrompt,
  onCreateTask,
  isBusy
}: {
  project?: ProjectRecord;
  agent?: AgentRecord;
  selectedConversation?: ConversationRecord;
  onExpandPrompt: (title: string, requirement: string, displayContent?: string) => Promise<void>;
  onCreateTask: () => void;
  isBusy: boolean;
}) {
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<PromptAttachment[]>([]);
  const [sendError, setSendError] = useState('');

  useEffect(() => {
    setMessage('');
    setAttachments([]);
    setSendError('');
  }, [selectedConversation?.id]);

  const promptMessages =
    selectedConversation?.promptMessages?.length
      ? selectedConversation.promptMessages
      : selectedConversation?.expandedPrompt
        ? [{ id: 'legacy-expanded-prompt', role: 'assistant' as const, content: selectedConversation.expandedPrompt, createdAt: selectedConversation.updatedAt }]
        : [];
  const canSend = Boolean(agent && project && (message.trim() || attachments.length > 0));
  const sendMessage = async () => {
    const content = [message.trim(), attachments.length > 0 ? promptAttachmentBlock(attachments) : ''].filter(Boolean).join('\n\n');
    if (!content) return;
    if (!project || !agent) {
      setSendError('请先在左侧选择一个项目，再发送需求。');
      return;
    }
    const titleSeed = message.trim() || attachments[0]?.name || content;
    const attachmentSummary =
      attachments.length > 0
        ? attachments.map((file) => `📎 ${file.name}${file.truncated ? ' (truncated)' : ''}`).join('\n')
        : '';
    const displayContent = [message.trim(), attachmentSummary].filter(Boolean).join('\n\n');
    setSendError('');
    try {
      await onExpandPrompt(selectedConversation?.title || titleSeed.slice(0, 28) || '未命名需求', content, displayContent);
      setMessage('');
      setAttachments([]);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : String(error));
    }
  };
  const attachFiles = async () => {
    const files = await api.selectPromptFiles();
    if (files.length === 0) return;
    setAttachments((value) => [...value, ...files]);
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-md border border-md-outline/20 bg-md-surface">
      <div className="border-b border-md-outline/20 px-4 py-3">
        <div className="text-sm font-semibold text-md-text">{selectedConversation?.title || 'New requirement conversation'}</div>
        <p className="mt-1 text-xs text-md-muted">把需求当作聊天来澄清；信息足够后，右键 issue 消息可转入 Kanban。</p>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-md-surfaceContainer/50 p-4">
        {promptMessages.length === 0 ? (
          <div className="mx-auto mt-20 max-w-md rounded-lg bg-md-surface px-4 py-3 text-center text-sm leading-6 text-md-muted shadow-sm">
            输入自然语言需求后发送，我会结合项目上下文判断是否需要追问；足够清楚时输出给 Codex 执行的 issue。
          </div>
        ) : null}
        {promptMessages.map((item) => {
          const isAssistant = item.role === 'assistant';
          const bubble = (
            <div
              className={clsx(
                'max-w-[82%] rounded-lg px-3 py-2 text-sm leading-6 shadow-sm',
                item.role === 'user' ? 'bg-md-primary text-md-onPrimary' : 'bg-md-surface text-md-text'
              )}
            >
              <pre className="whitespace-pre-wrap font-sans text-sm leading-6">{item.content}</pre>
            </div>
          );
          return (
            <div key={item.id} className={clsx('flex', item.role === 'user' ? 'justify-end' : 'justify-start')}>
              {isAssistant ? (
                <ContextMenu.Root>
                  <ContextMenu.Trigger asChild>{bubble}</ContextMenu.Trigger>
                  <ContextMenu.Portal>
                    <ContextMenu.Content className="menu-surface w-40">
                      <ContextMenu.Item className="menu-item" onClick={onCreateTask}>
                        To Board
                      </ContextMenu.Item>
                    </ContextMenu.Content>
                  </ContextMenu.Portal>
                </ContextMenu.Root>
              ) : (
                bubble
              )}
            </div>
          );
        })}
        {isBusy ? (
          <div className="flex justify-start">
            <div className="inline-flex items-center gap-2 rounded-lg bg-md-surface px-3 py-2 text-sm text-md-muted shadow-sm">
              <Loader2 size={15} className="animate-spin" />
              正在理解需求...
            </div>
          </div>
        ) : null}
      </div>

      <div className="border-t border-md-outline/20 bg-md-surface p-3">
        <div className="rounded-lg border border-md-outline/20 bg-md-surfaceContainer p-2">
          {sendError ? (
            <div className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
              {sendError}
            </div>
          ) : null}
          {attachments.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-2 border-b border-md-outline/10 pb-2">
              {attachments.map((file, index) => (
                <div
                  key={`${file.path}-${index}`}
                  className={clsx(
                    'inline-flex max-w-[240px] items-center gap-2 rounded-full border px-3 py-1 text-xs',
                    file.supported
                      ? 'border-md-outline/20 bg-md-surface text-md-text'
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
                    onClick={() => setAttachments((value) => value.filter((_, itemIndex) => itemIndex !== index))}
                    aria-label={`Remove ${file.name}`}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <textarea
              className="min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-6 text-md-text outline-none placeholder:text-md-muted"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onPaste={async (event) => {
              const files = await pastedImageAttachments(event);
              if (files.length > 0) setAttachments((value) => [...value, ...files]);
            }}
            onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="输入需求或回答澄清问题，Enter 发送，Shift+Enter 换行"
              disabled={!project}
            />
            <IconButton onClick={attachFiles} disabled={!project || isBusy} title="Attach files">
              <FilePlus2 />
            </IconButton>
            <IconButton onClick={() => void sendMessage()} disabled={!canSend || isBusy} title="Send">
              {isBusy ? <Loader2 className="animate-spin" /> : <Sparkles />}
            </IconButton>
          </div>
        </div>
      </div>
    </section>
  );
}
