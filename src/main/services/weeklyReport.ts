import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AppState, ExecutorRunRecord, TaskRecord, WeeklyReportInput, WeeklyReportResult, WorkItemRecord } from '../../shared/types.js';
import { DEFAULT_WEEKLY_REPORT_CORE_PRESET, DEFAULT_WEEKLY_REPORT_RULES } from '../../shared/promptPresets.js';
import { runCodexPromptExpansion } from './codex.js';

const execFileAsync = promisify(execFile);

function dateOnly(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function withinRange(value: string | undefined, since: Date, until: Date) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return time >= since.getTime() && time < until.getTime();
}

function clip(value: string | undefined, limit = 1800) {
  const text = value?.trim();
  if (!text) return '无';
  return text.length > limit ? `${text.slice(0, limit)}\n...已截断` : text;
}

function projectName(state: AppState, projectId: string | undefined) {
  return state.projects.find((project) => project.id === projectId)?.name || '未关联项目';
}

function taskLine(state: AppState, task: TaskRecord, runs: ExecutorRunRecord[]) {
  const latestRun = runs.find((run) => run.taskId === task.id);
  return [
    `- 标题：${task.title}`,
    `  项目：${projectName(state, task.projectId)}`,
    `  状态：${task.status}`,
    `  优先级：${task.priority}`,
    `  排期：${task.scheduledFor || '未排期'}`,
    `  更新时间：${task.updatedAt}`,
    `  需求：${clip(task.description, 800)}`,
    latestRun
      ? `  最近执行：${latestRun.status}${latestRun.error ? `，错误：${latestRun.error}` : ''}\n  执行摘要：${clip(latestRun.output, 1200)}`
      : '  最近执行：未执行'
  ].join('\n');
}

function workItemLine(state: AppState, item: WorkItemRecord) {
  return [
    `- 标题：${item.title}`,
    `  项目：${projectName(state, item.projectId)}`,
    `  状态：${item.status}`,
    `  优先级：${item.priority}`,
    `  排期：${item.scheduledFor || '未排期'}`,
    `  备注：${clip(item.notes, 900)}`
  ].join('\n');
}

async function projectCommits(projectPath: string, since: Date, until: Date) {
  try {
    const { stdout } = await execFileAsync(
      'git',
      [
        '-C',
        projectPath,
        'log',
        `--since=${since.toISOString()}`,
        `--until=${until.toISOString()}`,
        '--date=short',
        '--pretty=format:%h%x09%ad%x09%s'
      ],
      { maxBuffer: 1024 * 1024 }
    );
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function generateWeeklyReport(state: AppState, input: WeeklyReportInput): Promise<WeeklyReportResult> {
  const since = new Date(input.since);
  const until = new Date(input.until);
  const weekTasks = state.tasks.filter(
    (task) => withinRange(task.scheduledFor, since, until) || withinRange(task.updatedAt, since, until) || withinRange(task.createdAt, since, until)
  );
  const weekWorkItems = state.workItems.filter(
    (item) => withinRange(item.scheduledFor, since, until) || withinRange(item.updatedAt, since, until) || withinRange(item.createdAt, since, until)
  );
  const taskIds = new Set(weekTasks.map((task) => task.id));
  const weekRuns = state.runs
    .filter((run) => taskIds.has(run.taskId) || withinRange(run.startedAt, since, until) || withinRange(run.updatedAt, since, until))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const commits = await Promise.all(
    state.projects
      .filter((project) => !project.hiddenAt)
      .map(async (project) => ({
        project,
        commits: await projectCommits(project.path, since, until)
      }))
  );

  const context = [
    `周期：${dateOnly(input.since)} - ${dateOnly(new Date(until.getTime() - 1).toISOString())}`,
    '',
    '## 本周看板工作记录',
    weekWorkItems.length > 0 ? weekWorkItems.map((item) => workItemLine(state, item)).join('\n\n') : '无',
    '',
    '## 本周 Issue / Executor 状态',
    weekTasks.length > 0 ? weekTasks.map((task) => taskLine(state, task, weekRuns)).join('\n\n') : '无',
    '',
    '## 本周执行记录概览',
    weekRuns.length > 0
      ? weekRuns
        .slice(0, 20)
        .map((run) => {
          const task = state.tasks.find((item) => item.id === run.taskId);
          return `- ${task?.title || run.taskId} · ${projectName(state, run.projectId)} · ${run.status} · ${run.updatedAt}${run.error ? ` · ${run.error}` : ''}`;
        })
        .join('\n')
      : '无',
    '',
    '## 本周 Git Commit',
    commits.some((item) => item.commits.length > 0)
      ? commits
        .filter((item) => item.commits.length > 0)
        .map((item) => `### ${item.project.name}\n${item.commits.map((commit) => `- ${commit}`).join('\n')}`)
        .join('\n\n')
      : '无'
  ].join('\n');

  const weeklyReportCorePreset = state.settings?.weeklyReportCorePreset?.trim() || DEFAULT_WEEKLY_REPORT_CORE_PRESET;
  const weeklyReportRules = state.settings?.weeklyReportRules?.trim() || DEFAULT_WEEKLY_REPORT_RULES;

  const prompt = `${weeklyReportCorePreset}

要求：
${weeklyReportRules}

## 原始数据
${context}
`;

  const cwd = state.projects.find((project) => !project.hiddenAt)?.path || process.cwd();
  const markdown = await runCodexPromptExpansion(prompt, cwd, state.settings.codexModel, state.settings.codexReasoningEffort);

  return {
    markdown,
    commitCount: commits.reduce((count, item) => count + item.commits.length, 0),
    since: since.toISOString(),
    until: until.toISOString()
  };
}
