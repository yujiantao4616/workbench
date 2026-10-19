import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
	  AgentRecord,
	  AppState,
	  CancelTaskRunInput,
	  CompleteTaskInput,
	  ConversationRecord,
	  CreateWorkItemInput,
	  CreateTaskInput,
	  DeleteWorkItemInput,
	  ExecutorRunRecord,
	  ExternalIssueSource,
	  MemoryRecord,
	  ProjectRecord,
	  SaveMemoryInput,
	  SyncTapdBugStatusInput,
	  TapdDefectRecord,
	  StartTaskRunInput,
	  TaskGroupRecord,
	  TaskRecord,
	  TrackAnalyticsEventInput,
	  TrashItemInput,
	  UpdateSettingsInput,
	  UpdateWorkItemInput,
	  UpdateTaskInput,
	  UpdateConversationInput,
	  UpdateMemoryInput
} from '../../shared/types.js';
import {
  DEFAULT_EXECUTOR_CONTINUE_CORE_PRESET,
  DEFAULT_EXECUTOR_CONTINUE_RULES,
  DEFAULT_EXECUTOR_RUN_CORE_PRESET,
  DEFAULT_EXECUTOR_RUN_RULES,
  DEFAULT_PROMPT_CORE_PRESET,
  DEFAULT_PROMPT_RULES,
  DEFAULT_WEEKLY_REPORT_CORE_PRESET,
  DEFAULT_WEEKLY_REPORT_RULES
} from '../../shared/promptPresets.js';

const defaultState: AppState = {
  projectGroups: [],
  projects: [],
  agents: [],
  conversations: [],
  memories: [],
  taskGroups: [],
  tasks: [],
  workItems: [],
  tapdDefects: [],
  runs: [],
  analyticsEvents: [],
  settings: {
    codexModel: 'gpt-5.5',
    codexReasoningEffort: 'medium',
    promptCorePreset: DEFAULT_PROMPT_CORE_PRESET,
    promptRules: DEFAULT_PROMPT_RULES,
    weeklyReportCorePreset: DEFAULT_WEEKLY_REPORT_CORE_PRESET,
    weeklyReportRules: DEFAULT_WEEKLY_REPORT_RULES,
    executorRunCorePreset: DEFAULT_EXECUTOR_RUN_CORE_PRESET,
    executorRunRules: DEFAULT_EXECUTOR_RUN_RULES,
    executorContinueCorePreset: DEFAULT_EXECUTOR_CONTINUE_CORE_PRESET,
    executorContinueRules: DEFAULT_EXECUTOR_CONTINUE_RULES,
    themeColor: '#2a50a2',
    themeMode: 'light',
    showTodayOnStartup: true,
    dailyUnfinishedReminderEnabled: true,
    systemNotificationEnabled: true,
    tapdApiBaseUrl: 'https://api.tapd.cn',
    tapdAuthName: '',
    tapdAuthToken: '',
    tapdAssigneeKeyword: '',
    tapdStatuses: ['新', '接受处理', '重新打开']
  }
};

const MAX_RUN_OUTPUT_CHARS = 80_000;
const LEGACY_EXECUTOR_CONTINUE_CORE_PRESET =
  '你是 Codex CLI，正在继续修正同一个看板任务。请严格基于当前项目、已有改动和用户页面验证反馈继续工作。';
const LEGACY_EXECUTOR_CONTINUE_RULES = [
  '- 这是同一个任务的后续修正，不要重新设计整个方案。',
  '- 先阅读当前 git diff 和相关代码，理解上一轮已经改了什么。',
  '- 保留用户未否定的已有改动，只针对反馈继续完善。',
  '- 如果反馈和原 issue 冲突，优先指出冲突并做最小必要调整。',
  '- 只修改和任务直接相关的文件。',
  '- 不要进行无关重构、格式化或依赖升级。',
  '- 修改后尽量运行低风险验证命令，例如 typecheck、lint、test 或 build；如果无法运行，请说明原因。',
  '- 最终输出中文报告。'
].join('\n');

function now() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function markDeleted(record: { deletedAt?: string; updatedAt: string }, timestamp: string) {
  record.deletedAt = timestamp;
  record.updatedAt = timestamp;
}

function restoreDeleted(record: { deletedAt?: string; hiddenAt?: string; updatedAt: string }, timestamp: string) {
  record.deletedAt = undefined;
  record.hiddenAt = undefined;
  record.updatedAt = timestamp;
}

function compactRunOutput(output: string) {
  if (output.length <= MAX_RUN_OUTPUT_CHARS) return output;
  return [
    `[Codex Workbench 已截断过长原始日志，仅保留最近 ${MAX_RUN_OUTPUT_CHARS.toLocaleString()} 个字符。完整执行结论请优先查看总结。]`,
    '',
    output.slice(-MAX_RUN_OUTPUT_CHARS)
  ].join('\n');
}

function buildMemoryCandidate(task: TaskRecord, project: ProjectRecord | undefined, run: ExecutorRunRecord) {
  const outputLines = run.output
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('```') && !/\.(tsx?|jsx?|css|scss|json|md|vue|java|kt|swift|dart|py)(:|\s|$)/i.test(line))
    .slice(-8);

  return [
    `任务：${task.title}`,
    `项目：${project?.name || task.projectId}`,
    '',
    '需求背景',
    task.description,
    '',
    '可复用结论',
    outputLines.length > 0 ? outputLines.join('\n') : '本次任务已完成，暂无可复用实现结论。',
    '',
    '下次参考',
    '遇到相似需求时，优先复查本任务对应的需求、验收标准和最终验证结果。'
  ].join('\n');
}

export class AppStore {
  private readonly dataDir: string;
  private readonly dataFile: string;
  private writeQueue = Promise.resolve();

  constructor() {
    this.dataDir = app.getPath('userData');
    this.dataFile = path.join(this.dataDir, 'data.json');
  }

  async read(): Promise<AppState> {
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.writeQueue;
    try {
      const raw = await fs.readFile(this.dataFile, 'utf8');
      const parsed = this.parseState(raw);
      return this.normalizeState(parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      await this.write(defaultState);
      return structuredClone(defaultState);
    }
  }

  async write(state: AppState) {
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(this.dataDir, { recursive: true });
      const tempFile = `${this.dataFile}.tmp`;
      await fs.writeFile(tempFile, JSON.stringify(state, null, 2));
      await fs.rename(tempFile, this.dataFile);
    });
    await this.writeQueue;
  }

  private parseState(raw: string): Partial<AppState> {
    try {
      return JSON.parse(raw) as Partial<AppState>;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const match = message.match(/position (\d+)/);
      if (!match) {
        throw error;
      }
      const end = Number(match[1]);
      const recovered = JSON.parse(raw.slice(0, end)) as Partial<AppState>;
      const backupFile = `${this.dataFile}.corrupt-${Date.now()}.bak`;
      void fs.writeFile(backupFile, raw).catch(() => undefined);
      void this.write({ ...defaultState, ...recovered });
      return recovered;
    }
  }

  private normalizeState(parsed: Partial<AppState>): AppState {
    const settings = { ...defaultState.settings, ...parsed.settings };
    if (settings.executorContinueCorePreset === LEGACY_EXECUTOR_CONTINUE_CORE_PRESET) {
      settings.executorContinueCorePreset = DEFAULT_EXECUTOR_CONTINUE_CORE_PRESET;
    }
    if (
      settings.executorContinueRules === LEGACY_EXECUTOR_CONTINUE_RULES ||
      settings.executorContinueRules.includes('这是同一个任务的后续修正，不要重新设计整个方案')
    ) {
      settings.executorContinueRules = DEFAULT_EXECUTOR_CONTINUE_RULES;
    }
    return {
      ...defaultState,
      ...parsed,
      runs: (parsed.runs || []).map((run) => ({
        ...run,
        output: compactRunOutput(run.output || '')
      })),
      settings
    };
  }

  async upsertProject(project: ProjectRecord): Promise<AppState> {
    const state = await this.read();
    const index = state.projects.findIndex((item) => item.id === project.id);
    if (index >= 0) {
      state.projects[index] = project;
    } else {
      state.projects.push(project);
    }
    await this.write(state);
    return state;
  }

  async addProject(projectPath: string, name: string, summary: ProjectRecord['summary']): Promise<AppState> {
    const state = await this.read();
    const existing = state.projects.find((item) => item.path === projectPath);
    const timestamp = now();

	    if (existing) {
	      existing.name = name;
	      existing.summary = summary;
	      existing.hiddenAt = undefined;
	      existing.deletedAt = undefined;
	      existing.updatedAt = timestamp;
	      await this.write(state);
	      return state;
    }

	    const project: ProjectRecord = {
	      id: createId('project'),
	      name,
	      path: projectPath,
	      sortOrder: state.projects.length,
	      summary,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const agent: AgentRecord = {
      id: createId('agent'),
      projectId: project.id,
      name,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    state.projects.push(project);
    state.agents.push(agent);
    await this.write(state);
	    return state;
	  }

  async createProjectGroup(name: string): Promise<AppState> {
    const state = await this.read();
    const timestamp = now();
    state.projectGroups.push({
      id: createId('project_group'),
      name,
      sortOrder: state.projectGroups.length,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    await this.write(state);
    return state;
  }

  async updateProjectGroup(id: string, name: string): Promise<AppState> {
    const state = await this.read();
    const group = state.projectGroups.find((item) => item.id === id);
    if (!group) {
      throw new Error(`Project group not found: ${id}`);
    }
    group.name = name;
    group.updatedAt = now();
    await this.write(state);
    return state;
  }

  async deleteProjectGroup(id: string): Promise<AppState> {
    const state = await this.read();
    state.projectGroups = state.projectGroups.filter((group) => group.id !== id);
    for (const project of state.projects) {
      if (project.groupId === id) {
        project.groupId = undefined;
        project.updatedAt = now();
      }
    }
    await this.write(state);
    return state;
  }

  async moveProject(projectId: string, groupId?: string, beforeProjectId?: string): Promise<AppState> {
    const state = await this.read();
    const project = state.projects.find((item) => item.id === projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    project.groupId = groupId;
    project.updatedAt = now();
    const scoped = state.projects
      .filter((item) => item.id !== projectId && item.groupId === groupId && !item.hiddenAt)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const insertIndex = beforeProjectId ? Math.max(0, scoped.findIndex((item) => item.id === beforeProjectId)) : scoped.length;
    scoped.splice(insertIndex < 0 ? scoped.length : insertIndex, 0, project);
    scoped.forEach((item, index) => {
      item.sortOrder = index;
      item.updatedAt = now();
    });

    await this.write(state);
    return state;
  }

  async removeProject(projectId: string, mode: 'hide' | 'delete'): Promise<AppState> {
    const state = await this.read();
    const project = state.projects.find((item) => item.id === projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    if (mode === 'hide') {
      project.hiddenAt = now();
      project.updatedAt = project.hiddenAt;
      await this.write(state);
      return state;
    }

    markDeleted(project, now());

    await this.write(state);
    return state;
  }

  async createConversation(
    agentId: string,
    title: string,
    requirement: string,
    initialMessageContent?: string
  ): Promise<AppState> {
    const state = await this.read();
    const timestamp = now();
    const conversation: ConversationRecord = {
      id: createId('conversation'),
      agentId,
      title,
      requirement,
      expandedPrompt: '',
      promptMessages: requirement.trim()
        ? [
            {
              id: createId('prompt_message'),
              role: 'user',
              content: initialMessageContent || requirement,
              createdAt: timestamp
            }
          ]
        : [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    state.conversations.unshift(conversation);
    await this.write(state);
    return state;
  }

  async updateConversation(input: UpdateConversationInput): Promise<AppState> {
    const state = await this.read();
    let conversation = state.conversations.find((item) => item.id === input.id);
    if (!conversation) {
      if (!input.agentId || !input.title || !input.requirement) {
        throw new Error(`Conversation not found: ${input.id}`);
      }
      const createdAt = now();
      conversation = {
        id: input.id,
        agentId: input.agentId,
        title: input.title,
        requirement: input.requirement,
        expandedPrompt: '',
        promptMessages: input.initialMessageContent
          ? [
              {
                id: createId('prompt_message'),
                role: 'user',
                content: input.initialMessageContent,
                createdAt
              }
            ]
          : [],
        createdAt,
        updatedAt: createdAt
      };
      state.conversations.unshift(conversation);
    }
    const timestamp = now();
    const appendMessages = input.appendMessages?.map((message) => ({
      id: message.id || createId('prompt_message'),
      role: message.role,
      content: message.content,
      createdAt: message.createdAt || timestamp
    }));
    const updates: Partial<UpdateConversationInput> = { ...input };
    delete updates.agentId;
    delete updates.initialMessageContent;
    Object.assign(conversation, {
      ...updates,
      appendMessages: undefined,
      promptMessages: [...(conversation.promptMessages || []), ...(appendMessages || [])],
      updatedAt: timestamp
    });
    await this.write(state);
    return state;
  }

  async deleteConversation(id: string): Promise<AppState> {
    const state = await this.read();
    const conversation = state.conversations.find((item) => item.id === id);
    if (!conversation) {
      throw new Error(`Conversation not found: ${id}`);
    }
    markDeleted(conversation, now());
    await this.write(state);
    return state;
  }

  async saveMemory(input: SaveMemoryInput): Promise<AppState> {
    const state = await this.read();
    const timestamp = now();
    const existing = state.memories.find(
      (item) => item.scope === input.scope && item.ownerId === input.ownerId && item.title === input.title
    );

    if (existing) {
      existing.content = input.content;
      existing.updatedAt = timestamp;
    } else {
      const memory: MemoryRecord = {
        id: createId('memory'),
        ...input,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      state.memories.unshift(memory);
    }

    await this.write(state);
    return state;
  }

  async updateMemory(input: UpdateMemoryInput): Promise<AppState> {
    const state = await this.read();
    const memory = state.memories.find((item) => item.id === input.id);
    if (!memory) {
      throw new Error(`Memory not found: ${input.id}`);
    }

    Object.assign(memory, {
      scope: input.scope,
      ownerId: input.ownerId,
      title: input.title,
      content: input.content,
      updatedAt: now()
    });
    await this.write(state);
    return state;
  }

  async deleteMemory(id: string): Promise<AppState> {
    const state = await this.read();
    const memory = state.memories.find((item) => item.id === id);
    if (!memory) {
      throw new Error(`Memory not found: ${id}`);
    }
    markDeleted(memory, now());
    await this.write(state);
    return state;
  }

  async createTask(input: CreateTaskInput): Promise<AppState> {
    const state = await this.read();
    const timestamp = now();
    const task: TaskRecord = {
      id: createId('task'),
      groupId: input.groupId,
      conversationId: input.conversationId,
      projectId: input.projectId,
      agentId: input.agentId,
      title: input.title,
      description: input.description,
      executionPrompt: input.executionPrompt ?? input.description,
      workflowMode: input.workflowMode ?? 'standard',
      status: input.status ?? 'inbox',
      priority: input.priority ?? 'medium',
      scheduledFor: input.scheduledFor,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    state.tasks.unshift(task);
    await this.write(state);
    return state;
  }

  async createTaskGroup(input: {
    conversationId: string;
    title: string;
    description: string;
    projectIds: string[];
  }): Promise<{ state: AppState; group: TaskGroupRecord }> {
    const state = await this.read();
    const timestamp = now();
    const group: TaskGroupRecord = {
      id: createId('task_group'),
      conversationId: input.conversationId,
      title: input.title,
      description: input.description,
      projectIds: input.projectIds,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    state.taskGroups.unshift(group);
    await this.write(state);
    return { state, group };
  }

  async updateTask(input: UpdateTaskInput): Promise<AppState> {
    const state = await this.read();
    const task = state.tasks.find((item) => item.id === input.id);
    if (!task) {
      throw new Error(`Task not found: ${input.id}`);
    }
    Object.assign(task, {
      ...input,
      updatedAt: now()
    });
    await this.write(state);
    return state;
  }

  async deleteTask(id: string): Promise<AppState> {
    const state = await this.read();
    const task = state.tasks.find((item) => item.id === id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }
    markDeleted(task, now());
    await this.write(state);
    return state;
  }

  async deleteTaskGroup(id: string): Promise<AppState> {
    const state = await this.read();
    const group = state.taskGroups.find((item) => item.id === id);
    if (!group) {
      throw new Error(`Task group not found: ${id}`);
    }
    markDeleted(group, now());
    await this.write(state);
    return state;
  }

  async createWorkItem(input: CreateWorkItemInput): Promise<AppState> {
    const state = await this.read();
    const timestamp = now();
    state.workItems.unshift({
      id: createId('work'),
      title: input.title.trim(),
      notes: input.notes?.trim() || '',
      priority: input.priority ?? 'medium',
      scheduledFor: input.scheduledFor,
      projectId: input.projectId,
      externalSources: input.externalSources,
      status: 'planned',
      createdAt: timestamp,
      updatedAt: timestamp
    });
    await this.write(state);
    return state;
  }

  async upsertTapdDefects(defects: TapdDefectRecord[]): Promise<AppState> {
    const state = await this.read();
    for (const defect of defects) {
      const index = state.tapdDefects.findIndex(
        (item) => (item.type || 'bug') === (defect.type || 'bug') && item.workspaceId === defect.workspaceId && item.defectId === defect.defectId
      );
      if (index >= 0) {
        state.tapdDefects[index] = {
          ...state.tapdDefects[index],
          ...defect
        };
      } else {
        state.tapdDefects.push(defect);
      }
    }
    this.reopenLinkedTapdBugs(state, defects);
    state.tapdDefects.sort((a, b) => (b.updatedAt || b.syncedAt).localeCompare(a.updatedAt || a.syncedAt));
    await this.write(state);
    return state;
  }

  async markTapdBugStatusSync(input: SyncTapdBugStatusInput, results: Array<{ id: string; ok: boolean; error?: string }>): Promise<AppState> {
    const state = await this.read();
    const timestamp = now();
    const resultById = new Map(results.map((result) => [result.id, result]));
    for (const defect of state.tapdDefects) {
      if (!input.ids.includes(defect.id)) continue;
      const result = resultById.get(defect.id);
      if (result?.ok) {
        defect.status = input.status;
        defect.statusSyncedAt = timestamp;
        defect.statusSyncError = undefined;
        defect.syncedAt = timestamp;
        this.updateTapdSourceStatus(state, defect, input.status, timestamp, undefined);
      } else {
        defect.statusSyncError = result?.error || 'TAPD status sync failed.';
        defect.syncedAt = timestamp;
        this.updateTapdSourceStatus(state, defect, defect.status, undefined, defect.statusSyncError);
      }
    }
    await this.write(state);
    return state;
  }

  async replaceTapdMyWork(defects: TapdDefectRecord[]): Promise<AppState> {
    const state = await this.read();
    state.tapdDefects = state.tapdDefects.filter((item) => {
      const source = typeof item.raw?.__source === 'string' ? item.raw.__source : '';
      return source !== 'tapd_my_work' && source !== 'tapd_api';
    });
    for (const defect of defects) {
      const index = state.tapdDefects.findIndex(
        (item) => (item.type || 'bug') === (defect.type || 'bug') && item.workspaceId === defect.workspaceId && item.defectId === defect.defectId
      );
      if (index >= 0) {
        state.tapdDefects[index] = {
          ...state.tapdDefects[index],
          ...defect
        };
      } else {
        state.tapdDefects.push(defect);
      }
    }
    state.tapdDefects.sort((a, b) => (b.updatedAt || b.syncedAt).localeCompare(a.updatedAt || a.syncedAt));
    await this.write(state);
    return state;
  }

  async updateWorkItem(input: UpdateWorkItemInput): Promise<AppState> {
    const state = await this.read();
    const item = state.workItems.find((workItem) => workItem.id === input.id);
    if (!item) {
      throw new Error(`Work item not found: ${input.id}`);
    }
    Object.assign(item, {
      ...input,
      updatedAt: now()
    });
    await this.write(state);
    return state;
  }

  async deleteWorkItem(input: DeleteWorkItemInput): Promise<AppState> {
    const state = await this.read();
    const item = state.workItems.find((workItem) => workItem.id === input.id);
    if (!item) {
      throw new Error(`Work item not found: ${input.id}`);
    }
    markDeleted(item, now());
    await this.write(state);
    return state;
  }

  async updateSettings(input: UpdateSettingsInput): Promise<AppState> {
    const state = await this.read();
    state.settings = {
      ...defaultState.settings,
      ...state.settings,
      ...input.settings
    };
    await this.write(state);
    return state;
  }

  async trackAnalyticsEvent(input: TrackAnalyticsEventInput): Promise<AppState> {
    const state = await this.read();
    const timestamp = now();
    state.analyticsEvents = [
      {
        id: createId('analytics'),
        name: input.name,
        category: input.category,
        metadata: input.metadata,
        createdAt: timestamp
      },
      ...(state.analyticsEvents || [])
    ].slice(0, 2000);
    await this.write(state);
    return state;
  }

  async deleteTapdDefects(ids: string[]): Promise<AppState> {
    const state = await this.read();
    const deleteIds = new Set(ids);
    const timestamp = now();
    for (const defect of state.tapdDefects) {
      if (deleteIds.has(defect.id)) {
        defect.deletedAt = timestamp;
        defect.syncedAt = timestamp;
      }
    }
    await this.write(state);
    return state;
  }

  async moveTaskGroupToReady(groupId: string): Promise<AppState> {
    const state = await this.read();
    const timestamp = now();
    const group = state.taskGroups.find((item) => item.id === groupId);
    if (!group) {
      throw new Error(`Task group not found: ${groupId}`);
    }

    for (const task of state.tasks) {
      if (task.groupId === groupId && ['inbox', 'blocked'].includes(task.status)) {
        task.status = 'ready';
        task.updatedAt = timestamp;
      }
    }

    group.updatedAt = timestamp;
    await this.write(state);
    return state;
  }

  async addProjectToTaskGroup(groupId: string, projectId: string): Promise<AppState> {
    const state = await this.read();
    const group = state.taskGroups.find((item) => item.id === groupId);
    if (!group) {
      throw new Error(`Task group not found: ${groupId}`);
    }
    if (!group.projectIds.includes(projectId)) {
      group.projectIds.push(projectId);
      group.updatedAt = now();
    }
    await this.write(state);
    return state;
  }

  async startRun(
    input: StartTaskRunInput,
    command: string,
    baseline?: { gitStatus?: string; gitDiff?: string; gitTree?: string }
  ): Promise<{ state: AppState; run: ExecutorRunRecord }> {
    const state = await this.read();
    const task = state.tasks.find((item) => item.id === input.taskId);
    if (!task) {
      throw new Error(`Task not found: ${input.taskId}`);
    }
    const projectRunning = state.runs.some((run) => run.projectId === task.projectId && run.status === 'running');
    if (projectRunning) {
      throw new Error('This project already has a running Codex executor.');
    }
    const timestamp = now();
    task.status = 'in-progress';
    task.updatedAt = timestamp;
    const run: ExecutorRunRecord = {
      id: createId('run'),
      taskId: task.id,
      projectId: task.projectId,
      agentId: task.agentId,
      status: 'running',
      command,
      feedback: input.feedback?.trim() || undefined,
      output: '',
      baselineGitStatus: baseline?.gitStatus,
      baselineGitDiff: baseline?.gitDiff,
      baselineGitTree: baseline?.gitTree,
      startedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    state.runs.unshift(run);
    await this.write(state);
    return { state, run };
  }

  async appendRunOutput(runId: string, output: string): Promise<AppState> {
    const state = await this.read();
    const run = state.runs.find((item) => item.id === runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    run.output = compactRunOutput(`${run.output}${output}`);
    run.updatedAt = now();
    await this.write(state);
    return state;
  }

  async finishRun(
    runId: string,
    result: { exitCode?: number; error?: string; cancelled?: boolean }
  ): Promise<AppState> {
    const state = await this.read();
    const run = state.runs.find((item) => item.id === runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    const task = state.tasks.find((item) => item.id === run.taskId);
    const timestamp = now();
    const succeeded = !result.cancelled && !result.error && (result.exitCode === 0 || result.exitCode === undefined);
    run.status = result.cancelled ? 'cancelled' : succeeded ? 'succeeded' : 'failed';
    run.exitCode = result.exitCode;
    run.error = result.error;
    run.finishedAt = timestamp;
    run.updatedAt = timestamp;
    if (task) {
      task.status = result.cancelled ? 'ready' : succeeded ? 'review' : 'need-changes';
      task.updatedAt = timestamp;
    }
    await this.write(state);
    return state;
  }

  async updateRunSummary(runId: string, result: { summary?: string; summaryError?: string }): Promise<AppState> {
    const state = await this.read();
    const run = state.runs.find((item) => item.id === runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    run.summary = result.summary?.trim() || undefined;
    run.summaryError = result.summaryError?.trim() || undefined;
    run.updatedAt = now();
    await this.write(state);
    return state;
  }

  async updateRunPatch(runId: string, result: { changePatch?: string; changePatchError?: string }): Promise<AppState> {
    const state = await this.read();
    const run = state.runs.find((item) => item.id === runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    run.changePatch = result.changePatch;
    run.changePatchError = result.changePatchError;
    run.undoError = undefined;
    run.updatedAt = now();
    await this.write(state);
    return state;
  }

  async markRunUndone(runId: string): Promise<AppState> {
    const state = await this.read();
    const run = state.runs.find((item) => item.id === runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    run.undoneAt = now();
    run.undoError = undefined;
    run.updatedAt = run.undoneAt;
    await this.write(state);
    return state;
  }

  async markRunUndoFailed(runId: string, error: string): Promise<AppState> {
    const state = await this.read();
    const run = state.runs.find((item) => item.id === runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    run.undoError = error;
    run.updatedAt = now();
    await this.write(state);
    return state;
  }

  async cancelRun(input: CancelTaskRunInput): Promise<AppState> {
    return this.finishRun(input.runId, {
      cancelled: true,
      error: 'Run cancelled by user.'
    });
  }

  async recoverInterruptedRuns(): Promise<AppState> {
    const state = await this.read();
    const timestamp = now();
    let changed = false;
    for (const run of state.runs) {
      if (run.status !== 'running') continue;
      run.status = 'cancelled';
      run.error = 'Run interrupted because the app restarted.';
      run.finishedAt = timestamp;
      run.updatedAt = timestamp;
      const task = state.tasks.find((item) => item.id === run.taskId);
      if (task && task.status === 'in-progress') {
        task.status = 'need-changes';
        task.updatedAt = timestamp;
      }
      changed = true;
    }
    if (changed) {
      await this.write(state);
    }
    return state;
  }

  async completeTask(input: CompleteTaskInput): Promise<AppState> {
    const state = await this.read();
    const task = state.tasks.find((item) => item.id === input.taskId);
    if (!task) {
      throw new Error(`Task not found: ${input.taskId}`);
    }

    const run = input.runId ? state.runs.find((item) => item.id === input.runId) : undefined;
    const timestamp = now();
    task.status = 'done';
    task.updatedAt = timestamp;

    if (input.saveMemory && run?.output.trim()) {
      const project = state.projects.find((item) => item.id === task.projectId);
      state.memories.unshift({
        id: createId('memory'),
        scope: 'project',
        ownerId: task.projectId,
        title: `Task conclusion: ${task.title}`,
        content: buildMemoryCandidate(task, project, run).slice(0, 2400),
        createdAt: timestamp,
        updatedAt: timestamp
      });
    }

    await this.write(state);
    return state;
  }

  async restoreTrashItem(input: TrashItemInput): Promise<AppState> {
    const state = await this.read();
    const timestamp = now();
    if (input.type === 'project') {
      const record = state.projects.find((item) => item.id === input.id);
      if (!record) throw new Error(`Trash item not found: ${input.type}:${input.id}`);
      restoreDeleted(record, timestamp);
    } else if (input.type === 'conversation') {
      const record = state.conversations.find((item) => item.id === input.id);
      if (!record) throw new Error(`Trash item not found: ${input.type}:${input.id}`);
      restoreDeleted(record, timestamp);
    } else if (input.type === 'task') {
      const record = state.tasks.find((item) => item.id === input.id);
      if (!record) throw new Error(`Trash item not found: ${input.type}:${input.id}`);
      restoreDeleted(record, timestamp);
    } else if (input.type === 'taskGroup') {
      const record = state.taskGroups.find((item) => item.id === input.id);
      if (!record) throw new Error(`Trash item not found: ${input.type}:${input.id}`);
      restoreDeleted(record, timestamp);
    } else if (input.type === 'workItem') {
      const record = state.workItems.find((item) => item.id === input.id);
      if (!record) throw new Error(`Trash item not found: ${input.type}:${input.id}`);
      restoreDeleted(record, timestamp);
    } else if (input.type === 'memory') {
      const record = state.memories.find((item) => item.id === input.id);
      if (!record) throw new Error(`Trash item not found: ${input.type}:${input.id}`);
      restoreDeleted(record, timestamp);
    } else {
      const record = state.tapdDefects.find((item) => item.id === input.id);
      if (!record) throw new Error(`Trash item not found: ${input.type}:${input.id}`);
      record.deletedAt = undefined;
      record.syncedAt = timestamp;
    }
    await this.write(state);
    return state;
  }

  async permanentlyDeleteTrashItem(input: TrashItemInput): Promise<AppState> {
    const state = await this.read();
    switch (input.type) {
      case 'project':
        this.permanentlyDeleteProject(state, input.id);
        break;
      case 'conversation':
        this.permanentlyDeleteConversation(state, input.id);
        break;
      case 'task':
        this.permanentlyDeleteTask(state, input.id);
        break;
      case 'taskGroup':
        this.permanentlyDeleteTaskGroup(state, input.id);
        break;
      case 'workItem':
        state.workItems = state.workItems.filter((item) => item.id !== input.id);
        break;
      case 'memory':
        state.memories = state.memories.filter((item) => item.id !== input.id);
        break;
      case 'tapdDefect':
        state.tapdDefects = state.tapdDefects.filter((item) => item.id !== input.id);
        break;
      default:
        input.type satisfies never;
    }
    await this.write(state);
    return state;
  }

  async clearTrash(): Promise<AppState> {
    const state = await this.read();
    for (const project of [...state.projects]) {
      if (project.deletedAt || project.hiddenAt) this.permanentlyDeleteProject(state, project.id);
    }
    for (const conversation of [...state.conversations]) {
      if (conversation.deletedAt) this.permanentlyDeleteConversation(state, conversation.id);
    }
    for (const task of [...state.tasks]) {
      if (task.deletedAt) this.permanentlyDeleteTask(state, task.id);
    }
    for (const group of [...state.taskGroups]) {
      if (group.deletedAt) this.permanentlyDeleteTaskGroup(state, group.id);
    }
    state.workItems = state.workItems.filter((item) => !item.deletedAt);
    state.memories = state.memories.filter((item) => !item.deletedAt);
    state.tapdDefects = state.tapdDefects.filter((item) => !item.deletedAt);
    await this.write(state);
    return state;
  }

  private permanentlyDeleteProject(state: AppState, projectId: string) {
    const agentIds = new Set(state.agents.filter((agent) => agent.projectId === projectId).map((agent) => agent.id));
    const conversationIds = new Set(
      state.conversations.filter((conversation) => agentIds.has(conversation.agentId)).map((conversation) => conversation.id)
    );
    const taskIds = new Set(state.tasks.filter((task) => task.projectId === projectId).map((task) => task.id));

    state.projects = state.projects.filter((item) => item.id !== projectId);
    state.agents = state.agents.filter((agent) => agent.projectId !== projectId);
    state.conversations = state.conversations.filter((conversation) => !conversationIds.has(conversation.id));
    state.tasks = state.tasks.filter((task) => task.projectId !== projectId);
    state.workItems = state.workItems.filter((item) => item.projectId !== projectId);
    state.runs = state.runs.filter((run) => run.projectId !== projectId && !taskIds.has(run.taskId));
    state.memories = state.memories.filter((memory) => {
      if (memory.scope === 'project') return memory.ownerId !== projectId;
      if (memory.scope === 'agent') return !agentIds.has(memory.ownerId || '');
      if (memory.scope === 'conversation') return !conversationIds.has(memory.ownerId || '');
      return true;
    });
    state.taskGroups = state.taskGroups
      .map((group) => ({
        ...group,
        projectIds: group.projectIds.filter((id) => id !== projectId),
        updatedAt: now()
      }))
      .filter((group) => group.projectIds.length > 0);
  }

  private permanentlyDeleteConversation(state: AppState, id: string) {
    const taskIds = new Set(state.tasks.filter((task) => task.conversationId === id).map((task) => task.id));
    state.conversations = state.conversations.filter((conversation) => conversation.id !== id);
    state.tasks = state.tasks.filter((task) => task.conversationId !== id);
    state.runs = state.runs.filter((run) => !taskIds.has(run.taskId));
    state.taskGroups = state.taskGroups.filter((group) => group.conversationId !== id);
    state.workItems = state.workItems.filter((item) => item.conversationId !== id);
    state.memories = state.memories.filter((memory) => memory.scope !== 'conversation' || memory.ownerId !== id);
  }

  private permanentlyDeleteTask(state: AppState, id: string) {
    const task = state.tasks.find((item) => item.id === id);
    state.tasks = state.tasks.filter((item) => item.id !== id);
    state.workItems = state.workItems.map((item) => (item.taskId === id ? { ...item, taskId: undefined } : item));
    state.runs = state.runs.filter((run) => run.taskId !== id);
    if (task?.groupId) {
      const groupHasTasks = state.tasks.some((item) => item.groupId === task.groupId);
      if (!groupHasTasks) {
        state.taskGroups = state.taskGroups.filter((group) => group.id !== task.groupId);
      }
    }
  }

  private permanentlyDeleteTaskGroup(state: AppState, id: string) {
    const taskIds = new Set(state.tasks.filter((task) => task.groupId === id).map((task) => task.id));
    state.taskGroups = state.taskGroups.filter((group) => group.id !== id);
    state.tasks = state.tasks.filter((task) => task.groupId !== id);
    state.workItems = state.workItems.map((item) => (item.taskId && taskIds.has(item.taskId) ? { ...item, taskId: undefined } : item));
    state.runs = state.runs.filter((run) => !taskIds.has(run.taskId));
  }

  private reopenLinkedTapdBugs(state: AppState, defects: TapdDefectRecord[]) {
    const timestamp = now();
    for (const defect of defects) {
      if ((defect.type || 'bug') !== 'bug' || !isTapdReopenStatus(defect.status)) continue;
      for (const item of state.workItems) {
        if (!item.externalSources?.some((source) => sameTapdSource(source, defect))) continue;
        if (item.status === 'done') {
          item.status = 'issued';
          item.updatedAt = timestamp;
        }
        const linkedTask = item.taskId
          ? state.tasks.find((task) => task.id === item.taskId)
          : item.conversationId
            ? state.tasks.find((task) => task.conversationId === item.conversationId && (!item.projectId || task.projectId === item.projectId))
            : undefined;
        if (linkedTask && ['done', 'review'].includes(linkedTask.status)) {
          linkedTask.status = 'need-changes';
          linkedTask.updatedAt = timestamp;
        }
      }
    }
  }

  private updateTapdSourceStatus(
    state: AppState,
    defect: TapdDefectRecord,
    status: string,
    statusSyncedAt: string | undefined,
    statusSyncError: string | undefined
  ) {
    const timestamp = now();
    for (const item of state.workItems) {
      if (!item.externalSources) continue;
      let changed = false;
      item.externalSources = item.externalSources.map((source) => {
        if (!sameTapdSource(source, defect)) return source;
        changed = true;
        return {
          ...source,
          status,
          statusSyncedAt,
          statusSyncError,
          syncedAt: defect.syncedAt
        };
      });
      if (changed) item.updatedAt = timestamp;
    }
  }
}

function isTapdReopenStatus(status: string) {
  const normalized = status.trim().toLowerCase();
  return ['重新打开', '重新处理', 'reopen', 'reopened'].some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function sameTapdSource(source: ExternalIssueSource, defect: TapdDefectRecord) {
  return (
    source.provider === 'tapd' &&
    (source.tapdType || 'bug') === (defect.type || 'bug') &&
    source.workspaceId === defect.workspaceId &&
    source.defectId === defect.defectId
  );
}
