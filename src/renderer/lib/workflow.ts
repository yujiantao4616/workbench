import clsx from 'clsx';
import type {
  AgentRecord,
  ConversationRecord,
  ExecutorRunRecord,
  MemoryRecord,
  ProjectRecord,
  TaskPriority,
  TaskRecord,
  TaskStatus,
  ThemeMode,
  WorkItemRecord,
  WorkItemStatus,
  WorkflowModule
} from '../../shared/types';
import { Brain, ClipboardList, Play, Sparkles } from 'lucide-react';

export const moduleTabs: Array<{ id: WorkflowModule; label: string; icon: typeof Sparkles }> = [
  { id: 'issues', label: 'Issues', icon: ClipboardList },
  { id: 'prompt', label: 'Prompt', icon: Sparkles },
  { id: 'executor', label: 'Executor', icon: Play },
  { id: 'memory', label: 'Memory', icon: Brain }
];

export const taskColumns: Array<{ id: TaskStatus; label: string; hint: string }> = [
  { id: 'inbox', label: 'Inbox', hint: 'Generated, not scheduled' },
  { id: 'ready', label: 'Ready', hint: 'Clear enough to run' },
  { id: 'in-progress', label: 'In Progress', hint: 'Executor is working' },
  { id: 'review', label: 'Review', hint: 'Waiting for confirmation' },
  { id: 'need-changes', label: 'Need Changes', hint: 'Verified and needs another pass' },
  { id: 'blocked', label: 'Blocked', hint: 'Needs more context' },
  { id: 'done', label: 'Done', hint: 'Closed and ready for memory' }
];

export function formatDate(value?: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

export function formatDuration(start?: string, end?: string) {
  if (!start) return '00:00';
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  const totalSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function dateKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfNaturalWeek(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

export function weekOfYearSunday(value: Date) {
  const start = startOfNaturalWeek(value);
  const yearStart = startOfNaturalWeek(new Date(start.getFullYear(), 0, 1));
  const days = Math.floor((start.getTime() - yearStart.getTime()) / 86400000);
  return Math.floor(days / 7) + 1;
}

export function formatCalendarLabel(value: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    weekday: 'short',
    month: '2-digit',
    day: '2-digit'
  }).format(value);
}

export function priorityClass(priority: TaskPriority) {
  return clsx(
    priority === 'high' && 'bg-red-100 text-red-700',
    priority === 'medium' && 'bg-amber-100 text-amber-800',
    priority === 'low' && 'bg-emerald-100 text-emerald-700'
  );
}

export function projectStack(project?: ProjectRecord) {
  return project?.summary?.detectedStack?.join(' / ') || 'Waiting for scan';
}

export function taskStatusLabel(status: TaskStatus) {
  return taskColumns.find((column) => column.id === status)?.label ?? status;
}

export function workItemLinkedTask(item: WorkItemRecord, tasks: TaskRecord[]) {
  if (item.taskId) {
    const task = tasks.find((candidate) => candidate.id === item.taskId);
    if (task) return task;
  }
  if (item.conversationId) {
    return tasks.find(
      (candidate) => candidate.conversationId === item.conversationId && (!item.projectId || candidate.projectId === item.projectId)
    );
  }
  return undefined;
}

export function workItemEffectiveStatus(item: WorkItemRecord, tasks: TaskRecord[]): TaskStatus | WorkItemStatus {
  return workItemLinkedTask(item, tasks)?.status || item.status;
}

export function workItemStatusLabel(status: TaskStatus | WorkItemStatus) {
  if (status === 'planned') return 'Inbox';
  if (status === 'prompting') return 'Prompt';
  if (status === 'issued') return 'Ready';
  if (status === 'done') return 'Done';
  return taskStatusLabel(status as TaskStatus);
}

export function executorRank(status: TaskStatus) {
  return {
    'in-progress': 0,
    ready: 1,
    review: 2,
    'need-changes': 3,
    blocked: 4,
    inbox: 5,
    done: 6
  }[status];
}

export function runResultSummary(run: ExecutorRunRecord | undefined) {
  if (!run) return '还没有执行结果。';
  const lines = run.output
    .split('\n')
    .map((line) => stripAnsiCodes(line).trim())
    .filter(Boolean);
  const headings = lines.filter((line) => /^#{2,3}\s+/.test(line));
  const bullets = lines.filter((line) => /^[-*]\s+/.test(line));
  const picked = [...headings, ...bullets].slice(-14);
  if (picked.length > 0) return picked.join('\n');
  return lines.slice(-14).join('\n') || 'Codex 没有输出摘要。';
}

export function runDisplaySummary(run: ExecutorRunRecord | undefined) {
  if (!run) return '还没有执行结果。';
  if (run.status === 'running') return 'Codex 正在思考中，完成后这里会展示总结结果。';
  if (run.summary?.trim()) return run.summary.trim();
  if (run.error) return `执行失败：${run.error}`;
  if (run.summaryError?.trim()) {
    return `本次执行已结束，但结果总结生成失败：${run.summaryError.trim()}\n原始日志可在下拉详情中查看。`;
  }

  const lines = stripNoisyCodexOutput(run.output)
    .map((line) => line.trim())
    .filter(Boolean);
  const finalReport = extractFinalReport(lines);
  if (finalReport) return finalReport;

  const summary = pickInterestingLines(lines, [
    /^(summary|result|done|completed|changes|tests|verification|总结|结果|完成|改动|验证|测试|注意|后续)/i,
    /^[-*]\s+(改动|完成|验证|测试|结果|注意|后续)/i
  ], 10).filter((line) => {
    const normalized = normalizeReportHeading(line);
    if (/^(结果总结|总结|注意|后续|风险与后续|风险和后续)$/i.test(normalized)) return false;
    return !looksLikeRawErrorOnly(line) && !looksLikeRawCodexLog(line) && !looksLikeCodeOrDiffLine(line);
  });
  if (summary.length > 0) return ['结果总结', ...summary].join('\n');

  const errorLines = lines.filter(looksLikeRawErrorOnly).slice(-5);
  if (errorLines.length > 0) return ['结果提示', ...errorLines].join('\n');

  if (run.status === 'succeeded') {
    return '本次执行已成功结束，但 Codex 没有输出可读的最终总结。原始日志可在 Run Detail 中查看；也可以用 Continue 让 Codex 补充一份修改摘要和验证结果。';
  }

  return 'Codex 没有输出可读摘要。原始日志可在 Run Detail 中查看。';
}

export function runLiveProgress(run: ExecutorRunRecord | undefined) {
  if (!run) return '等待 Codex 开始执行...';
  const lines = run.output
    .split('\n')
    .map((line) => stripAnsiCodes(line).trim())
    .filter(Boolean);
  const progress = compactProgressLines(
    lines
      .filter((line) => hasChineseText(line))
      .filter((line) => !looksLikeRawErrorOnly(line))
      .filter((line) => !looksLikeRawCodexLog(line))
      .filter((line) => !looksLikeDiffNoise(line))
      .filter((line) => !looksLikeRuntimeNoise(line))
      .filter((line) => !looksLikeSourceOrFileTrace(line))
      .filter((line) => !looksLikeCodeOrDiffLine(line))
  ).slice(0, 40);

  return progress.length > 0
    ? progress.map((line) => `- ${line}`).join('\n')
    : 'Codex 正在执行，等待可读进展...';
}

export type RunTimelineEvent = {
  id: string;
  type: 'thinking' | 'reading' | 'editing' | 'command' | 'error' | 'result';
  title: string;
  detail?: string;
};

export type RunActivitySummary = {
  status: ExecutorRunRecord['status'];
  duration: string;
  progress: string[];
  readFiles: string[];
  editedFiles: string[];
  commands: string[];
  errors: string[];
};

export function runActivitySummary(run: ExecutorRunRecord | undefined): RunActivitySummary {
  if (!run) {
    return {
      status: 'queued',
      duration: '00:00',
      progress: [],
      readFiles: [],
      editedFiles: [],
      commands: [],
      errors: []
    };
  }
  const lines = run.output
    .split('\n')
    .map((line) => stripAnsiCodes(line).trim())
    .filter(Boolean);
  const progress = runLiveProgress(run)
    .split('\n')
    .map((line) => line.replace(/^\s*-\s*/, '').trim())
    .filter(Boolean)
    .filter((line) => !line.includes('等待可读进展'))
    .slice(-6);
  const errors = [run.error, ...lines.filter((line) => looksLikeRawErrorOnly(line))]
    .filter((item): item is string => Boolean(item?.trim()))
    .map((item) => (item.length > 280 ? `${item.slice(0, 280)}...` : item));
  return {
    status: run.status,
    duration: formatDuration(run.startedAt, run.finishedAt),
    progress,
    readFiles: extractTimelineFiles(lines, 'read').slice(0, 8),
    editedFiles: extractTimelineFiles(lines, 'edit').slice(0, 10),
    commands: extractTimelineCommands(lines).slice(0, 6),
    errors: uniqueStrings(errors).slice(0, 4)
  };
}

export function runTimelineEvents(run: ExecutorRunRecord | undefined): RunTimelineEvent[] {
  if (!run) return [];
  const activity = runActivitySummary(run);
  const events: RunTimelineEvent[] = [];

  addTimelineEvent(events, {
    type: run.status === 'running' ? 'thinking' : 'result',
    title: run.status === 'running' ? 'Codex 正在处理任务' : `Codex ${run.status}`,
    detail: run.status === 'running' ? '正在分析需求、读取代码并执行必要修改。' : activity.duration
  });

  for (const file of activity.readFiles.slice(0, 5)) {
    addTimelineEvent(events, {
      type: 'reading',
      title: '读取文件',
      detail: file
    });
  }

  for (const file of activity.editedFiles.slice(0, 7)) {
    addTimelineEvent(events, {
      type: 'editing',
      title: '修改文件',
      detail: file
    });
  }

  for (const command of activity.commands.slice(0, 4)) {
    addTimelineEvent(events, {
      type: 'command',
      title: '执行命令',
      detail: command
    });
  }

  const error = activity.errors[0];
  if (error) {
    addTimelineEvent(events, {
      type: 'error',
      title: '执行遇到问题',
      detail: error.length > 240 ? `${error.slice(0, 240)}...` : error
    });
  }

  for (const item of activity.progress.slice(-4)) {
    addTimelineEvent(events, {
      type: 'thinking',
      title: '执行进展',
      detail: item
    });
  }

  return events.slice(0, 18);
}

function uniqueStrings(values: string[]) {
  const result: string[] = [];
  for (const value of values) {
    if (result.includes(value)) continue;
    result.push(value);
  }
  return result;
}

function addTimelineEvent(events: RunTimelineEvent[], event: Omit<RunTimelineEvent, 'id'>) {
  const key = `${event.type}:${event.title}:${event.detail || ''}`;
  if (events.some((item) => `${item.type}:${item.title}:${item.detail || ''}` === key)) return;
  events.push({
    id: `timeline-${events.length}-${key}`,
    ...event
  });
}

function extractTimelineFiles(lines: string[], mode: 'read' | 'edit') {
  const files: string[] = [];
  for (const line of lines) {
    if (looksLikeCodeOrDiffLine(line) && !looksLikeDiffNoise(line)) continue;
    const diffMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (diffMatch && mode === 'edit') {
      addUniqueProgressLine(files, diffMatch[2]);
      continue;
    }
    const isReadLine = /读取|查看|检查|read|open/i.test(line);
    const isEditLine = /修改|新增|创建|删除|移除|写入|edit|update|create|delete|remove/i.test(line);
    if (mode === 'read' && !isReadLine) continue;
    if (mode === 'edit' && !isEditLine) continue;
    const fileLine = line.match(/(?:^|\s|[`'"])([\w./@-]+\.(?:tsx?|jsx?|css|scss|json|md|vue|java|kt|swift|dart|py|ets|less|sass|html?))(?:[:\s`'"]|$)/i);
    if (!fileLine) continue;
    const filePath = fileLine[1];
    if (filePath.length > 140 || filePath.includes('node_modules')) continue;
    addUniqueProgressLine(files, filePath);
  }
  return files;
}

function extractTimelineCommands(lines: string[]) {
  const commands: string[] = [];
  for (const line of lines) {
    const match =
      line.match(/(?:运行|执行|验证命令|command)[:：]?\s*`?((?:npm|pnpm|yarn|git|node|tsc|vite|bun)\s+[^`]+)`?/i) ||
      line.match(/^[$>]\s*((?:npm|pnpm|yarn|git|node|tsc|vite|bun)\s+.+)$/i);
    if (!match) continue;
    const command = match[1].trim();
    if (command.length > 160) continue;
    addUniqueProgressLine(commands, command);
  }
  return commands;
}

function extractFinalReport(lines: string[]) {
  const sectionNames = ['修改摘要', '涉及文件', '验证结果', '风险与后续', '风险和后续', 'Summary', 'Changes', 'Files', 'Verification', 'Risks'];
  const reportStartNames = ['修改摘要', 'Summary', 'Changes'];
  const headingIndexes = lines
    .map((line, index) => ({ line, index }))
    .map(({ line, index }) => ({ line, index, normalized: normalizeReportHeading(line) }))
    .filter(({ line }) => {
      const normalized = normalizeReportHeading(line);
      return sectionNames.some((name) => normalized.toLowerCase() === name.toLowerCase());
    });
  if (headingIndexes.length === 0) return '';

  const reportStart = [...headingIndexes]
    .reverse()
    .find(({ normalized }) => reportStartNames.some((name) => normalized.toLowerCase() === name.toLowerCase()));
  if (!reportStart) return '';

  const reportHeadings = headingIndexes.filter(({ index }) => index >= reportStart.index);
  const allowedHeadings = new Set(sectionNames.map((name) => name.toLowerCase()));
  const blocks: string[] = [];
  for (const { index, normalized } of reportHeadings) {
    if (!allowedHeadings.has(normalized.toLowerCase())) continue;
    const nextHeading = reportHeadings.find((item) => item.index > index)?.index ?? lines.length;
    const body = lines
      .slice(index + 1, nextHeading)
      .filter((item) => item && !looksLikeRawErrorOnly(item) && !looksLikeRawCodexLog(item) && !looksLikeCodeOrDiffLine(item))
      .slice(0, 6);
    if (body.length === 0) continue;
    blocks.push([normalized, ...body].join('\n'));
    if (blocks.length >= 4) break;
  }
  return blocks.join('\n\n');
}

function normalizeReportHeading(line: string) {
  return line.replace(/^#{1,4}\s*/, '').replace(/[:：]\s*$/, '').trim();
}

function looksLikeRawErrorOnly(line: string) {
  return /^Error Message:/i.test(line) || /^Error:/i.test(line) || /^warning:/i.test(line);
}

function stripAnsiCodes(line: string) {
  return line
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\[(?:\d{1,3})(?:;\d{1,3})*m/g, '')
    .replace(/\[[0-9]+[A-Za-z]/g, '')
    .trim();
}

function looksLikeRawCodexLog(line: string) {
  return (
    /^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+(WARN|INFO|ERROR)\b/i.test(line) ||
    /\b(WARN|INFO|ERROR)\s+codex_[\w:]+/i.test(line) ||
    /^\[\d+[sm]/i.test(line) ||
    /^codex$/i.test(line) ||
    /\bexec\b/i.test(line) ||
    /\bsucceeded in\b/i.test(line) ||
    /^No newline at end of file$/i.test(line) ||
    /\b\/bin\/(?:zsh|bash|sh)\b/.test(line) ||
    /^[$>]\s/.test(line) ||
    /^(```)?\s*(sed|rg|cat|ls|pwd|git|npm|pnpm|yarn|node|python|python3)\b/.test(line) ||
    /^(\.{0,2}\/|\/Users\/|src\/|library\/|entry\/|oh-package|package\.json|readme\.md)/i.test(line)
  );
}

function looksLikeDiffNoise(line: string) {
  return (
    /^diff --git\b/.test(line) ||
    /^index\s+[0-9a-f]+\.\.[0-9a-f]+/.test(line) ||
    /^[-+]{3}\s/.test(line) ||
    /^@@/.test(line) ||
    /^(new file mode|deleted file mode|similarity index|rename from|rename to)\b/.test(line)
  );
}

function looksLikeRuntimeNoise(line: string) {
  return (
    /^warning:/i.test(line) ||
    /^warn\b/i.test(line) ||
    /^error messaging the mach port/i.test(line) ||
    /^TSM AdjustCapsLockLED/i.test(line) ||
    /icon path with '\.\.'/i.test(line)
  );
}

function looksLikeCodeOrDiffLine(line: string) {
  const normalized = line
    .replace(/^\s*[-+*]\s+/, '')
    .replace(/^\d+\s+/, '')
    .trim();
  return (
    /^[-+]\s*$/.test(line) ||
    /^[-+]\s*[\w{}()[\].,:;'"`<>/=]/.test(line) ||
    /^<\/?[A-Za-z][\w:-]*(\s|>|\/>)/.test(normalized) ||
    /<\/[A-Za-z][\w:-]*>/.test(normalized) ||
    /<[A-Za-z][\w:-]+[^>]*>.*<\/[A-Za-z][\w:-]+>/.test(normalized) ||
    /^\{.*\b[A-Za-z_$][\w$]*\s*:\s*.+[},]?$/.test(normalized) ||
    /^\[.*\{.*\b[A-Za-z_$][\w$]*\s*:/.test(normalized) ||
    /^(?:["'`][^"'`]+["'`]|[A-Za-z_$][\w$-]*)\s*:\s*.+[,}]?$/.test(normalized) ||
    /^["'`].*["'`]\s*[,;]?$/.test(normalized) ||
    /\b(?:className|href|aria-label|onClick|style|content|key)=/.test(normalized) ||
    /(?:=>|===|!==|&&|\|\||\?\?|\?\.)/.test(normalized) ||
    /^[A-Za-z_$][\w$.]*\([^)]*\)\s*[;,]?$/.test(normalized) ||
    /^\d+\s+(import|export|const|let|var|function|class|interface|type|return|if|for|while|switch|case)\b/.test(line) ||
    /^\d+\s+[A-Za-z_$][\w$]*(,|;|:|\(|\{|$)/.test(line) ||
    /^(import|export|const|let|var|function|class|interface|type|return|if|for|while|switch|case)\b/.test(normalized) ||
    /^[\w$]+\s*:\s*[\w$.(]/.test(normalized) ||
    /^[{}()[\],;]+$/.test(normalized)
  );
}

function looksLikeSourceOrFileTrace(line: string) {
  const normalized = line.replace(/^\s*[-*]\s+/, '').trim();
  return (
    /^(读取|修改|新增|创建|删除|移除|查看|检查|打开)\s+[`'"“”]?\S+\.(?:tsx?|jsx?|css|scss|less|sass|json|md|vue|java|kt|swift|dart|py|ets|html?)(?:[`'"“”]?|\b)/i.test(normalized) ||
    /^(?:docs|src|pages|library|entry|components|apps|packages)\/[\w@./-]+:\d+(?::\d+)?:/.test(normalized) ||
    /^(?:docs|src|pages|library|entry|components|apps|packages)\/[\w@./-]+\.(?:tsx?|jsx?|css|scss|less|sass|json|md|vue|java|kt|swift|dart|py|ets|html?)\b/i.test(normalized) ||
    /^\|.+\|$/.test(normalized) ||
    /^<[^>]+>/.test(normalized) ||
    /<(?:meta|aside|div|span|section|main|header|footer|script|style|template)\b/i.test(normalized)
  );
}

function hasChineseText(line: string) {
  return /[\u4e00-\u9fff]/.test(line);
}

function extractLiveFileChanges(lines: string[]) {
  const result: string[] = [];
  for (const line of lines) {
    if (looksLikeCodeOrDiffLine(line) && !looksLikeDiffNoise(line)) continue;
    const diffMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (diffMatch) {
      addUniqueProgressLine(result, `修改 ${diffMatch[2]}`);
      continue;
    }
    const fileLine = line.match(/(?:^|\s)([\w./@-]+\.(?:tsx?|jsx?|css|scss|json|md|vue|java|kt|swift|dart|py|ets|less|sass|html))(?:[:\s]|$)/i);
    if (!fileLine) continue;
    const filePath = fileLine[1];
    if (filePath.length > 160 || filePath.includes('node_modules')) continue;
    const action = inferFileAction(line);
    addUniqueProgressLine(result, `${action} ${filePath}`);
  }
  return result;
}

function inferFileAction(line: string) {
  if (/create|created|新增|创建|add(ed)?/i.test(line)) return '新增';
  if (/delete|deleted|移除|删除|remove(d)?/i.test(line)) return '删除';
  if (/read|读取|查看/i.test(line)) return '读取';
  if (/test|测试|验证/i.test(line)) return '验证';
  return '修改';
}

function stripNoisyCodexOutput(output: string) {
  const lines = output.split('\n');
  const result: string[] = [];
  let inCodeFence = false;
  for (const line of lines) {
    const cleaned = stripAnsiCodes(line);
    const trimmed = cleaned.trim();
    if (trimmed.startsWith('```')) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;
    if (!trimmed || looksLikeRawCodexLog(trimmed)) continue;
    if (looksLikeDiffNoise(trimmed) || looksLikeRuntimeNoise(trimmed)) continue;
    if (looksLikeCodeOrDiffLine(trimmed) || looksLikeSourceOrFileTrace(trimmed)) continue;
    if (/\.(tsx?|jsx?|css|scss|json|md|vue|java|kt|swift|dart|py)(:|\s|$)/i.test(trimmed) && trimmed.length > 120) continue;
    result.push(cleaned);
  }
  return result;
}

function compactProgressLines(lines: string[]) {
  const result: string[] = [];
  for (const line of lines) {
    const cleaned = line
      .replace(/^\s*[-*]\s+/, '')
      .replace(/^#{1,4}\s*/, '')
      .replace(/^执行进展[:：]?\s*/, '')
      .replace(/^涉及文件[:：]?\s*/, '')
      .trim();
    if (!cleaned || cleaned.length < 4) continue;
    if (looksLikeCodeOrDiffLine(cleaned) || looksLikeDiffNoise(cleaned) || looksLikeSourceOrFileTrace(cleaned)) continue;
    addUniqueProgressLine(result, cleaned.length > 220 ? `${cleaned.slice(0, 220)}...` : cleaned);
  }
  return result;
}

function addUniqueProgressLine(result: string[], line: string) {
  if (result[result.length - 1] === line || result.includes(line)) return;
  result.push(line);
}

function pickInterestingLines(lines: string[], patterns: RegExp[], limit: number) {
  const picked: string[] = [];
  for (const line of lines) {
    if (!patterns.some((pattern) => pattern.test(line))) continue;
    if (picked.includes(line)) continue;
    picked.push(line);
    if (picked.length >= limit) break;
  }
  return picked;
}

export function feedbackDisplay(value: string) {
  return value
    .replace(/### 附件：(.+?)\n路径：(.+?)(\n|$)[\s\S]*/g, '📎 $1\n路径：$2')
    .trim();
}

export function hexToRgb(hex: string) {
  const normalized = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return { r: 42, g: 80, b: 162 };
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  };
}

export function mixRgb(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, ratio: number) {
  return {
    r: Math.round(a.r * (1 - ratio) + b.r * ratio),
    g: Math.round(a.g * (1 - ratio) + b.g * ratio),
    b: Math.round(a.b * (1 - ratio) + b.b * ratio)
  };
}

export function rgbVar(value: { r: number; g: number; b: number }) {
  return `${value.r} ${value.g} ${value.b}`;
}

export function applyThemeColor(hex: string, mode: ThemeMode = 'light') {
  const seed = hexToRgb(hex);
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = mode === 'dark' || (mode === 'system' && prefersDark);
  const primary = isDark ? mixRgb(seed, white, 0.42) : seed;
  const surface = isDark ? { r: 20, g: 18, b: 24 } : { r: 255, g: 251, b: 254 };
  const surfaceContainer = isDark ? mixRgb(seed, { r: 33, g: 31, b: 38 }, 0.88) : mixRgb(seed, white, 0.9);
  const surfaceContainerHigh = isDark ? mixRgb(seed, { r: 43, g: 41, b: 48 }, 0.84) : mixRgb(seed, white, 0.84);
  const outline = isDark ? mixRgb(seed, { r: 147, g: 143, b: 153 }, 0.76) : mixRgb(seed, { r: 122, g: 116, b: 127 }, 0.72);
  const text = isDark ? { r: 230, g: 224, b: 233 } : { r: 29, g: 27, b: 32 };
  const muted = isDark ? { r: 202, g: 196, b: 208 } : { r: 98, g: 94, b: 105 };
  const root = document.documentElement;
  root.style.colorScheme = isDark ? 'dark' : 'light';
  root.style.setProperty('--md-primary', rgbVar(primary));
  root.style.setProperty('--md-on-primary', primary.r * 0.299 + primary.g * 0.587 + primary.b * 0.114 > 150 ? rgbVar(black) : rgbVar(white));
  root.style.setProperty('--md-secondary', rgbVar(isDark ? mixRgb(primary, muted, 0.6) : mixRgb(primary, muted, 0.58)));
  root.style.setProperty('--md-surface', rgbVar(surface));
  root.style.setProperty('--md-surface-container', rgbVar(surfaceContainer));
  root.style.setProperty('--md-surface-container-high', rgbVar(surfaceContainerHigh));
  root.style.setProperty('--md-outline', rgbVar(outline));
  root.style.setProperty('--md-text', rgbVar(text));
  root.style.setProperty('--md-muted', rgbVar(muted));
}

export function buildMemoryCandidate(task: TaskRecord, project: ProjectRecord | undefined, run: ExecutorRunRecord | undefined) {
  const output = run?.output.trim();
  const outputLines = output
    ? output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-18)
    : [];

  return [
    `Task: ${task.title}`,
    `Project: ${project?.name || task.projectId}`,
    `Status: ${taskStatusLabel(task.status)}`,
    run ? `Run: ${run.status}${run.exitCode === undefined ? '' : `, exit ${run.exitCode}`}` : 'Run: not started',
    '',
    'Requirement',
    task.description,
    '',
    'Execution notes',
    outputLines.length > 0 ? outputLines.join('\n') : 'No Codex output captured yet.',
    '',
    'Reuse hint',
    'Compare this task with similar task groups before changing related projects.'
  ].join('\n');
}

export function memoryOwnerLabel(
  memory: MemoryRecord,
  projects: ProjectRecord[],
  agents: AgentRecord[] = [],
  conversations: ConversationRecord[] = []
) {
  if (memory.scope === 'global') return 'Global';
  if (memory.scope === 'project') {
    return projects.find((project) => project.id === memory.ownerId)?.name || 'Unknown project';
  }
  if (memory.scope === 'agent') {
    return agents.find((agent) => agent.id === memory.ownerId)?.name || 'Unknown agent';
  }
  return conversations.find((conversation) => conversation.id === memory.ownerId)?.title || 'Unknown conversation';
}

export function memoryBelongsToProject(
  memory: MemoryRecord,
  project: ProjectRecord | undefined,
  agents: AgentRecord[],
  conversations: ConversationRecord[]
) {
  if (!project || memory.scope === 'global') return true;
  if (memory.scope === 'project') return memory.ownerId === project.id;
  if (memory.scope === 'agent') return agents.some((agent) => agent.id === memory.ownerId && agent.projectId === project.id);
  const conversation = conversations.find((item) => item.id === memory.ownerId);
  return agents.some((agent) => agent.id === conversation?.agentId && agent.projectId === project.id);
}

export function memoryAppliesToContext(
  memory: MemoryRecord,
  project: ProjectRecord | undefined,
  agent: AgentRecord | undefined,
  conversation: ConversationRecord | undefined
) {
  if (memory.scope === 'global') return true;
  if (memory.scope === 'project') return !project || memory.ownerId === project.id;
  if (memory.scope === 'agent') return !agent || memory.ownerId === agent.id;
  return !conversation || memory.ownerId === conversation.id;
}

export function memorySummary(content: string) {
  const hiddenPrefixes = [
    'Run:',
    'Execution notes',
    '涉及文件',
    '验证结果',
    'Git status:',
    'Git diff:',
    '```',
    '### 涉及文件',
    '### 验证结果'
  ];
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !hiddenPrefixes.some((prefix) => line.startsWith(prefix)));
  const useful = lines.filter((line) => !/\.(tsx?|jsx?|css|scss|json|md|vue|java|kt|swift|dart|py)(:|\s|$)/i.test(line));
  return useful.slice(0, 4).join('\n') || lines.slice(0, 3).join('\n') || 'No reusable summary yet.';
}

export function relevantMemoriesForText(
  memories: MemoryRecord[],
  projects: ProjectRecord[],
  project: ProjectRecord | undefined,
  agent: AgentRecord | undefined,
  conversation: ConversationRecord | undefined,
  text: string
) {
  const tokens = text
    .toLowerCase()
    .split(/[\s,，。.;；:：/\\()[\]{}"'`!?！？-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  const uniqueTokens = [...new Set(tokens)].slice(0, 24);

  return memories
    .filter((memory) => memoryAppliesToContext(memory, project, agent, conversation))
    .map((memory) => {
      const haystack = [memory.title, memory.content, memory.scope, memoryOwnerLabel(memory, projects)].join('\n').toLowerCase();
      const score = uniqueTokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
      const scopeBoost = memory.scope === 'global' || memory.ownerId === project?.id ? 1 : 0;
      return { memory, score: score + scopeBoost };
    })
    .filter(({ score }) => score > 0 || uniqueTokens.length === 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ memory }) => memory);
}
