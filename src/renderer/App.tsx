import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, Sparkles, X } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import clsx from 'clsx';
import { api } from './lib/api';
import { Button } from './components/ui';
import { ModuleNav } from './components/ModuleNav';
import { Sidebar } from './modules/sidebar/Sidebar';
import { PromptModule } from './modules/prompt/PromptModule';
import { KanbanModule } from './modules/kanban/KanbanModule';
import { TapdModule } from './modules/tapd/TapdModule';
import { TodayDialog } from './modules/today/TodayDialog';
import { IssuesModule } from './modules/issues/IssuesModule';
import { ExecutorModule } from './modules/executor/ExecutorModule';
import { SettingsModule } from './modules/settings/SettingsModule';
import { MemoryModule } from './modules/memory/MemoryModule';
import { TrashModule } from './modules/trash/TrashModule';
import { SummaryPanel } from './modules/summary/SummaryPanel';
import { applyThemeColor, dateKey, relevantMemoriesForText, workItemLinkedTask } from './lib/workflow';
import { promptAttachmentBlock } from './lib/attachments';
import { useBusy } from './hooks/useBusy';
import { useCrudActions } from './hooks/useCrudActions';
import { useGitActions } from './hooks/useGitActions';
import type {
  AppState,
  CodexHealthResult,
  ExternalIssueSource,
  GitBranchInfoResult,
  PromptAttachment,
  TapdDefectRecord,
  TaskPriority,
  TaskRecord,
  TrackAnalyticsEventInput,
  WorkflowModule,
  WorkItemRecord
} from '../shared/types';
import {
  DEFAULT_EXECUTOR_CONTINUE_CORE_PRESET,
  DEFAULT_EXECUTOR_CONTINUE_RULES,
  DEFAULT_EXECUTOR_RUN_CORE_PRESET,
  DEFAULT_EXECUTOR_RUN_RULES,
  DEFAULT_PROMPT_CORE_PRESET,
  DEFAULT_PROMPT_RULES,
  DEFAULT_WEEKLY_REPORT_CORE_PRESET,
  DEFAULT_WEEKLY_REPORT_RULES
} from '../shared/promptPresets';
import './styles.css';

const emptyState: AppState = {
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

function isMissingConversationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Conversation not found');
}

function buildQuickChangePrompt(description: string, attachments: PromptAttachment[]) {
  const attachmentBlock = attachments.length > 0
    ? ['## 相关附件', promptAttachmentBlock(attachments)].join('\n\n')
    : '';
  return [
    '## 快速修改模式',
    '这是一个边界清晰的小改动。请直接在当前项目和当前工作区完成最小必要修改，不要创建新分支，不要扩大需求范围。',
    '',
    '开始修改前先快速判断：如果需求不明确，或涉及跨项目、架构重构、数据迁移、安全策略、破坏性 API 变更，请不要修改文件；在最终报告第一行输出“[建议转为标准任务]”，并说明需要澄清和拆解的内容。',
    '',
    '如果不需要升级：',
    '- 保持现有行为和风格，避免无关重构。',
    '- 完成与改动风险相称的验证。',
    '- 最终明确列出修改、验证和仍需人工确认的内容。',
    '',
    '## 修改要求',
    description.trim(),
    attachmentBlock
  ].filter(Boolean).join('\n');
}

function App() {
  const [state, setState] = useState<AppState>(emptyState);
  const [selectedProjectId, setSelectedProjectId] = useState<string>();
  const [selectedConversationId, setSelectedConversationId] = useState<string>();
  const [activeModule, setActiveModule] = useState<WorkflowModule>('issues');
  const [codexHealth, setCodexHealth] = useState<CodexHealthResult>();
  const [kanbanScope, setKanbanScope] = useState<'all' | 'current'>('all');
  const [selectedTaskGroupId, setSelectedTaskGroupId] = useState<string>();
  const [selectedExecutorTaskId, setSelectedExecutorTaskId] = useState<string>();
  const [promptingWorkItemId, setPromptingWorkItemId] = useState<string>();
  const [promptingProjectId, setPromptingProjectId] = useState<string>();
  const [promptingBranchInfo, setPromptingBranchInfo] = useState<GitBranchInfoResult>();
  const [promptingBranch, setPromptingBranch] = useState('');
  const [promptingNewBranch, setPromptingNewBranch] = useState('');
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [todayOpen, setTodayOpen] = useState(false);
  const [appStateReady, setAppStateReady] = useState(false);
  const [gitBranchInfo, setGitBranchInfo] = useState<GitBranchInfoResult>();
  const { busyLabel, runBusy } = useBusy();

  const trackEvent = useCallback((input: TrackAnalyticsEventInput) => {
    void api.trackAnalyticsEvent(input)
      .then((nextState) => {
        setState((current) => ({
          ...current,
          analyticsEvents: nextState.analyticsEvents || []
        }));
      })
      .catch(() => {
        // Usage analytics should never block the main workflow.
      });
  }, []);

  const activeProjects = state.projects.filter((project) => !project.deletedAt);
  const activeProjectIds = new Set(activeProjects.map((project) => project.id));
  const activeAgentIds = new Set(state.agents.filter((agent) => activeProjectIds.has(agent.projectId)).map((agent) => agent.id));
  const activeConversations = state.conversations.filter((conversation) => !conversation.deletedAt && activeAgentIds.has(conversation.agentId));
  const activeConversationIds = new Set(activeConversations.map((conversation) => conversation.id));
  const activeTaskGroups = state.taskGroups.filter((group) => !group.deletedAt);
  const activeTaskGroupIds = new Set(activeTaskGroups.map((group) => group.id));
  const activeTasks = state.tasks.filter(
    (task) =>
      !task.deletedAt &&
      activeProjectIds.has(task.projectId) &&
      (!task.conversationId || activeConversationIds.has(task.conversationId)) &&
      (!task.groupId || activeTaskGroupIds.has(task.groupId))
  );
  const activeTaskIds = new Set(activeTasks.map((task) => task.id));
  const activeWorkItems = state.workItems.filter(
    (item) =>
      !item.deletedAt &&
      (!item.projectId || activeProjectIds.has(item.projectId)) &&
      (!item.conversationId || activeConversationIds.has(item.conversationId)) &&
      (!item.taskId || activeTaskIds.has(item.taskId))
  );
  const activeMemories = state.memories.filter((memory) => !memory.deletedAt);
  const activeTapdDefects = state.tapdDefects.filter((defect) => !defect.deletedAt);
  const visibleProjects = activeProjects.filter((project) => !project.hiddenAt);
  const selectedProject = visibleProjects.find((project) => project.id === selectedProjectId);
  const selectedAgent = state.agents.find((agent) => agent.projectId === selectedProject?.id);
  const conversations = useMemo(
    () => activeConversations.filter((conversation) => conversation.agentId === selectedAgent?.id),
    [activeConversations, selectedAgent?.id]
  );
  const selectedConversation =
    conversations.find((conversation) => conversation.id === selectedConversationId) ?? conversations[0];
  const visibleProjectIds = new Set(visibleProjects.map((project) => project.id));
  const visibleAgentIds = new Set(
    state.agents.filter((agent) => visibleProjectIds.has(agent.projectId)).map((agent) => agent.id)
  );
  const visibleConversationIds = new Set(
    activeConversations.filter((conversation) => visibleAgentIds.has(conversation.agentId)).map((conversation) => conversation.id)
  );
  const visibleTasks = activeTasks.filter((task) => visibleProjectIds.has(task.projectId));
  const visibleMemories = activeMemories.filter((memory) => {
    if (memory.scope === 'global') return true;
    if (memory.scope === 'project') return visibleProjectIds.has(memory.ownerId || '');
    if (memory.scope === 'agent') return visibleAgentIds.has(memory.ownerId || '');
    return visibleConversationIds.has(memory.ownerId || '');
  });
  const conversationText = [
    selectedConversation?.title,
    selectedConversation?.requirement,
    selectedConversation?.expandedPrompt,
    ...(selectedConversation?.promptMessages || []).map((message) => message.content)
  ].join('\n');
  const relatedMemories = relevantMemoriesForText(
    visibleMemories,
    visibleProjects,
    selectedProject,
    selectedAgent,
    selectedConversation,
    conversationText
  );
  const projectTasks = activeTasks.filter((task) => task.projectId === selectedProject?.id);
  const executorTask =
    projectTasks.find((task) => task.id === selectedExecutorTaskId) ??
    [...projectTasks].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  const runningTaskIds = new Set(state.runs.filter((run) => run.status === 'running').map((run) => run.taskId));
  const selectedProjectExecutorRunning = projectTasks.some((task) => runningTaskIds.has(task.id));
  const {
    addProject,
    removeProject,
    rescanProject,
    deleteConversation,
    deleteTask,
    deleteTaskGroup,
    updateTaskStatus,
    scheduleTask,
    createWorkItem,
    updateWorkItem,
    deleteWorkItem,
    moveTaskGroupToReady,
    addProjectToTaskGroup,
    saveMemory,
    updateMemory,
    deleteMemory,
    restoreTrashItem,
    permanentlyDeleteTrashItem,
    clearTrash,
    updateSettings,
    generateBoardWeeklyReport
  } = useCrudActions({
    runBusy,
    setState,
    selectedProject,
    selectedProjectId,
    selectedAgentId: selectedAgent?.id,
    setSelectedProjectId,
    setSelectedConversationId,
    setSelectedTaskGroupId,
    trackEvent
  });
  const {
    refreshGitState,
    commitGitChanges,
    pushGitChanges,
    checkoutGitBranch,
    checkoutNewGitBranch,
    generateCommitMessage,
    openProjectInEditor
  } = useGitActions({
    runBusy,
    selectedProject,
    setGitBranchInfo
  });

  useEffect(() => {
    api.appState().then((nextState) => {
      const mergedState = { ...emptyState, ...nextState, settings: { ...emptyState.settings, ...nextState.settings } };
      setState(mergedState);
      applyThemeColor(mergedState.settings.themeColor, mergedState.settings.themeMode);
      setAppStateReady(true);
    });
    api.codexHealth().then(setCodexHealth);
  }, []);

  useEffect(() => {
    if (!appStateReady) return;
    trackEvent({ category: 'navigation', name: 'module.open', metadata: { module: activeModule } });
  }, [activeModule, appStateReady, trackEvent]);

  useEffect(() => {
    if (state.settings.themeMode !== 'system') return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => applyThemeColor(state.settings.themeColor, state.settings.themeMode);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [state.settings.themeColor, state.settings.themeMode]);

  useEffect(() => {
    return api.onRunUpdate((event) => {
      setState({ ...emptyState, ...event.state, settings: { ...emptyState.settings, ...event.state.settings } });
    });
  }, []);

  useEffect(() => {
    return api.onRunOpen((event) => {
      setTodayOpen(false);
      setSelectedProjectId(event.projectId);
      setSelectedExecutorTaskId(event.taskId);
      setActiveModule('executor');
    });
  }, []);

  useEffect(() => {
    if (!appStateReady || !state.settings.showTodayOnStartup) return;
    const todayKey = dateKey(new Date());
    const storageKey = `today-opened:${todayKey}`;
    if (window.localStorage.getItem(storageKey)) return;
    window.localStorage.setItem(storageKey, '1');
    setTodayOpen(true);
  }, [appStateReady, state.settings.showTodayOnStartup]);

  useEffect(() => {
    if (!appStateReady || !state.settings.dailyUnfinishedReminderEnabled) return undefined;
    const checkReminder = () => {
      const now = new Date();
      if (now.getHours() < 17) return;
      const todayKey = dateKey(now);
      const storageKey = `daily-unfinished-reminder:${todayKey}`;
      if (window.localStorage.getItem(storageKey)) return;
      const unfinishedTasks = visibleTasks.filter((task) => task.status !== 'done');
      const unfinishedWorkItems = activeWorkItems.filter((item) => item.status !== 'done' && !workItemLinkedTask(item, visibleTasks));
      const unfinishedCount = unfinishedTasks.length + unfinishedWorkItems.length;
      if (unfinishedCount === 0) return;
      window.localStorage.setItem(storageKey, '1');
      setTodayOpen(true);
      if (state.settings.systemNotificationEnabled) {
        void api.showNotification({
          title: 'Today 任务提醒',
          body: `还有 ${unfinishedCount} 个未完成任务，打开 Today 继续处理。`
        });
      }
    };
    checkReminder();
    const timer = window.setInterval(checkReminder, 30 * 1000);
    return () => window.clearInterval(timer);
  }, [
    appStateReady,
    state.settings.dailyUnfinishedReminderEnabled,
    state.settings.systemNotificationEnabled,
    activeWorkItems,
    visibleTasks
  ]);

  useEffect(() => {
    if (selectedProject && selectedProject.id !== selectedProjectId) {
      setSelectedProjectId(selectedProject.id);
    }
  }, [selectedProject?.id, selectedProjectId]);

  useEffect(() => {
    if (activeModule !== 'prompt') return;
    if (selectedProject || visibleProjects.length === 0) return;
    setSelectedProjectId(visibleProjects[0].id);
  }, [activeModule, selectedProject?.id, visibleProjects]);

  useEffect(() => {
    setSelectedConversationId(conversations[0]?.id);
  }, [selectedAgent?.id]);

  useEffect(() => {
    let cancelled = false;
    setGitBranchInfo(undefined);
    if (!selectedProject) return;
    api
      .gitBranchInfo({ projectId: selectedProject.id })
      .then((result) => {
        if (!cancelled) setGitBranchInfo(result);
      })
      .catch((error) => {
        if (!cancelled) {
          setGitBranchInfo({
            currentBranch: 'Unavailable',
            branches: [],
            isDirty: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProject?.id]);

  useEffect(() => {
    let cancelled = false;
    setPromptingBranchInfo(undefined);
    setPromptingBranch('');
    setPromptingNewBranch('');
    if (!promptingWorkItemId || !promptingProjectId) return;
    api
      .gitBranchInfo({ projectId: promptingProjectId })
      .then((result) => {
        if (cancelled) return;
        setPromptingBranchInfo(result);
        setPromptingBranch(result.currentBranch === 'Unavailable' ? '' : result.currentBranch);
      })
      .catch((error) => {
        if (cancelled) return;
        setPromptingBranchInfo({
          currentBranch: 'Unavailable',
          branches: [],
          isDirty: false,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    return () => {
      cancelled = true;
    };
  }, [promptingWorkItemId, promptingProjectId]);

  async function expandPrompt(title: string, requirement: string, displayContent?: string) {
    if (!requirement.trim()) return;
    if (!selectedProject) {
      throw new Error('请先选择一个项目，再发送需求。');
    }
    if (!selectedAgent) {
      throw new Error('当前项目没有可用 agent，请重新添加或扫描项目。');
    }
    await runBusy('Expanding issue', async () => {
      let conversationId: string | undefined = selectedConversation?.id;
      const visibleUserMessage = displayContent || requirement;

      if (conversationId) {
        try {
          const nextState = await api.updateConversation({
            id: conversationId,
            agentId: selectedAgent.id,
            title,
            requirement,
            appendMessages: [{ role: 'user', content: visibleUserMessage }]
          });
          setState(nextState);
        } catch (error) {
          if (!isMissingConversationError(error)) throw error;
          conversationId = undefined;
        }
      }

      if (!conversationId) {
        const nextState = await api.createConversation({
          agentId: selectedAgent.id,
          title,
          requirement,
          initialMessageContent: visibleUserMessage
        });
        conversationId = nextState.conversations[0]?.id;
        setState(nextState);
        setSelectedConversationId(conversationId);
      }

      if (!conversationId) return;
      await waitForPaint();
      const result = await api.expandPrompt({
        conversationId,
        projectId: selectedProject.id,
        agentId: selectedAgent.id,
        requirement
      });
      if (result.error) {
        console.warn('Prompt expansion fallback:', result.error);
      }
      let nextState: AppState;
      try {
        nextState = await api.updateConversation({
          id: conversationId,
          agentId: selectedAgent.id,
          title,
          requirement,
          initialMessageContent: visibleUserMessage,
          expandedPrompt: result.prompt,
          appendMessages: [
            {
              role: 'assistant',
              content: result.prompt
            }
          ]
        });
      } catch (error) {
        if (!isMissingConversationError(error)) throw error;
        const recreatedState = await api.createConversation({
          agentId: selectedAgent.id,
          title,
          requirement,
          initialMessageContent: visibleUserMessage
        });
        conversationId = recreatedState.conversations[0]?.id;
        if (!conversationId) throw error;
        nextState = await api.updateConversation({
          id: conversationId,
          expandedPrompt: result.prompt,
          appendMessages: [
            {
              role: 'assistant',
              content: result.prompt
            }
          ]
        });
      }
      setState(nextState);
      setSelectedConversationId(conversationId);
      trackEvent({ category: 'prompt', name: 'prompt.expand', metadata: { usedCodex: result.usedCodex } });
    });
  }

  async function createTaskFromConversation() {
    if (!selectedProject || !selectedAgent || !selectedConversation) return;
    await runBusy('Creating task', async () => {
      const nextState = await api.createTasksFromConversation({
        conversationId: selectedConversation.id,
        projectIds: [selectedProject.id],
        status: 'inbox',
        priority: 'medium'
      });
      const createdTask = nextState.tasks.find(
        (task) => task.conversationId === selectedConversation.id && task.projectId === selectedProject.id
      );
      const linkedWorkItem = nextState.workItems.find((item) => item.conversationId === selectedConversation.id);
      const finalState = createdTask && linkedWorkItem
        ? await api.updateWorkItem({
          id: linkedWorkItem.id,
          projectId: selectedProject.id,
          taskId: createdTask.id,
          status: 'issued'
        })
        : nextState;
      setState(finalState);
      setSelectedTaskGroupId(createdTask?.groupId || finalState.taskGroups[0]?.id);
      if (createdTask) setSelectedExecutorTaskId(createdTask.id);
      setActiveModule(createdTask ? 'executor' : 'issues');
      trackEvent({ category: 'prompt', name: createdTask ? 'prompt.to_executor' : 'prompt.to_issue' });
    });
  }

  async function createQuickChange(input: { title: string; description: string; attachments: PromptAttachment[] }) {
    if (!selectedProject || !selectedAgent) return;
    await runBusy('Starting quick change', async () => {
      const createdState = await api.createTask({
        projectId: selectedProject.id,
        agentId: selectedAgent.id,
        title: input.title,
        description: input.description,
        executionPrompt: buildQuickChangePrompt(input.description, input.attachments),
        workflowMode: 'quick-change',
        priority: 'medium',
        status: 'ready'
      });
      const createdTask = createdState.tasks.find(
        (task) => task.projectId === selectedProject.id && task.workflowMode === 'quick-change' && task.title === input.title
      );
      if (!createdTask) throw new Error('快速修改任务创建失败。');
      setState(createdState);
      setSelectedExecutorTaskId(createdTask.id);
      setSelectedTaskGroupId(undefined);
      setActiveModule('executor');
      const runningState = await api.startTaskRun({ taskId: createdTask.id });
      setState(runningState);
      trackEvent({
        category: 'executor',
        name: 'quick_change.start',
        metadata: { attachmentCount: input.attachments.length }
      });
    });
  }

  async function reviseTask(task: TaskRecord) {
    const agent = state.agents.find((item) => item.id === task.agentId);
    if (!agent) return;
    const isQuickChange = task.workflowMode === 'quick-change';
    const seed = isQuickChange
      ? [
        `从快速修改升级为标准任务：${task.title}`,
        '',
        '原始修改要求：',
        task.description,
        '',
        '请在 Prompt 中补充背景、范围、验收标准和潜在影响，再生成正式执行任务。'
      ].join('\n')
      : [
        `修正任务：${task.title}`,
        '',
        '原任务描述：',
        task.description,
        '',
        '原执行 issue：',
        task.executionPrompt,
        '',
        '请基于上面的执行结果问题，重新描述你希望修正的需求。'
      ].join('\n');
    await runBusy('Creating revision thread', async () => {
      const nextState = await api.createConversation({
        agentId: agent.id,
        title: isQuickChange ? `标准任务：${task.title}` : `修正：${task.title}`,
        requirement: seed,
        initialMessageContent: isQuickChange
          ? `这个快速修改需要升级为标准任务。\n\n${task.description}`
          : `我需要修正这个执行任务。\n\n${task.description}`
      });
      setState(nextState);
      setSelectedProjectId(task.projectId);
      setSelectedConversationId(nextState.conversations[0]?.id);
      setActiveModule('prompt');
      trackEvent({ category: 'prompt', name: isQuickChange ? 'quick_change.promote' : 'prompt.revise_from_executor' });
    });
  }

  function openExecutorForGroup(groupId: string) {
    setSelectedTaskGroupId(groupId);
    setActiveModule('executor');
  }

  async function promptWorkItem(item: WorkItemRecord) {
    setPromptingWorkItemId(item.id);
    setPromptingProjectId(item.projectId || selectedProject?.id || visibleProjects[0]?.id);
  }

  function openWorkItem(item: WorkItemRecord) {
    const conversation = item.conversationId
      ? activeConversations.find((candidate) => candidate.id === item.conversationId)
      : undefined;
    const conversationAgent = conversation
      ? state.agents.find((agent) => agent.id === conversation.agentId)
      : undefined;
    const linkedTask =
      (item.taskId ? activeTasks.find((task) => task.id === item.taskId) : undefined) ??
      (item.conversationId
        ? activeTasks.find((task) => task.conversationId === item.conversationId && (!item.projectId || task.projectId === item.projectId))
        : undefined);
    const hasRun = linkedTask ? state.runs.some((run) => run.taskId === linkedTask.id) : false;
    const projectId = linkedTask?.projectId || item.projectId || conversationAgent?.projectId;

    if (item.status === 'done' || linkedTask?.status === 'done') {
      if (projectId) setSelectedProjectId(projectId);
      setActiveModule('memory');
      return;
    }

    if (linkedTask && hasRun) {
      openTaskExecutor(linkedTask.id);
      return;
    }

    if (linkedTask) {
      setSelectedProjectId(linkedTask.projectId);
      setSelectedExecutorTaskId(linkedTask.id);
      setActiveModule('issues');
      return;
    }

    if (conversation && projectId) {
      setSelectedProjectId(projectId);
      setSelectedConversationId(item.conversationId);
      setActiveModule('prompt');
      return;
    }

    void promptWorkItem(item);
  }

  async function createPromptFromWorkItem(item: WorkItemRecord, projectId: string, options: { autoCreateTask?: boolean } = {}) {
    const project = visibleProjects.find((candidate) => candidate.id === projectId);
    const agent = project ? state.agents.find((candidate) => candidate.projectId === project.id) : undefined;
    if (!project || !agent) {
      setActiveModule('prompt');
      return;
    }
    const requirement = [item.title, item.notes ? `\n补充记录：\n${item.notes}` : ''].join('\n').trim();
    setSelectedProjectId(project.id);
    setActiveModule('prompt');
    await runBusy('Expanding work item', async () => {
      const createdState = await api.createConversation({
        agentId: agent.id,
        title: item.title,
        requirement,
        initialMessageContent: requirement
      });
      const conversation = createdState.conversations[0];
      let finalState = createdState;
      if (conversation) {
        setState(createdState);
        setSelectedConversationId(conversation.id);
        await waitForPaint();
        const result = await api.expandPrompt({
          conversationId: conversation.id,
          projectId: project.id,
          agentId: agent.id,
          requirement
        });
        if (result.error) {
          console.warn('Work item prompt expansion fallback:', result.error);
        }
        finalState = await api.updateConversation({
          id: conversation.id,
          agentId: agent.id,
          title: item.title,
          requirement,
          initialMessageContent: requirement,
          expandedPrompt: result.prompt,
          appendMessages: [
            {
              role: 'assistant',
              content: result.prompt
            }
          ]
        });
        finalState = await api.updateWorkItem({
          id: item.id,
          projectId: project.id,
          conversationId: conversation.id,
          status: 'prompting'
        });
        if (options.autoCreateTask) {
          const taskState = await api.createTasksFromConversation({
            conversationId: conversation.id,
            projectIds: [project.id],
            status: 'inbox',
            priority: item.priority
          });
          const createdTask = taskState.tasks.find(
            (task) => task.conversationId === conversation.id && task.projectId === project.id
          );
          finalState = createdTask
            ? await api.updateWorkItem({
              id: item.id,
              projectId: project.id,
              conversationId: conversation.id,
              taskId: createdTask.id,
              status: 'issued'
            })
            : taskState;
          if (createdTask) {
            setSelectedExecutorTaskId(createdTask.id);
            setSelectedTaskGroupId(createdTask.groupId);
          }
        }
        setSelectedConversationId(conversation.id);
      }
      setState(finalState);
      setActiveModule('prompt');
      trackEvent({ category: 'prompt', name: 'work_item.to_prompt', metadata: { hasProject: Boolean(item.projectId) } });
    });
  }

  async function createPromptFromWorkItemWithBranch() {
    if (!promptingWorkItem || !promptingProjectId) return;
    const item = promptingWorkItem;
    const projectId = promptingProjectId;
    await runBusy('Preparing prompt branch', async () => {
      const latestBranchInfo = await api.gitBranchInfo({ projectId });
      const newBranch = promptingNewBranch.trim();
      const targetBranch = promptingBranch.trim();
      const needsBranchChange = Boolean(newBranch) || Boolean(targetBranch && targetBranch !== latestBranchInfo.currentBranch);
      if (latestBranchInfo.error) {
        throw new Error(latestBranchInfo.error);
      }
      if (latestBranchInfo.isDirty && needsBranchChange) {
        setPromptingBranchInfo(latestBranchInfo);
        throw new Error('当前工作区有未提交内容，不能切换或创建分支。继续使用当前分支可以流转到 Prompt。');
      }
      if (newBranch) {
        await api.gitCheckoutNewBranch({ projectId, branch: normalizeFeatureBranchName(newBranch) });
      } else if (targetBranch && targetBranch !== latestBranchInfo.currentBranch) {
        await api.gitCheckout({ projectId, branch: targetBranch });
      }
    });
    setPromptingWorkItemId(undefined);
    setPromptingBranchInfo(undefined);
    setPromptingBranch('');
    setPromptingNewBranch('');
    await createPromptFromWorkItem(item, projectId);
  }

  function normalizeFeatureBranchName(branch: string) {
    const value = branch.trim().replace(/^\/+/, '');
    if (!value) return value;
    return value.startsWith('features/') ? value : `features/${value.replace(/^features?\//, '')}`;
  }

  async function importTapdDefectsFile(defects: TapdDefectRecord[]) {
    if (defects.length === 0) return 0;
    return runBusy('Importing TAPD defects', async () => {
      const result = await api.tapdImportDefects({ defects });
      setState({ ...emptyState, ...result.state, settings: { ...emptyState.settings, ...result.state.settings } });
      trackEvent({ category: 'tapd', name: 'tapd.import_file', metadata: { importedCount: result.importedCount } });
      return result.importedCount;
    });
  }

  async function syncTapdBugs() {
    return runBusy('Syncing TAPD my work', async () => {
      const result = await api.tapdSyncBugs();
      setState({ ...emptyState, ...result.state, settings: { ...emptyState.settings, ...result.state.settings } });
      trackEvent({
        category: 'tapd',
        name: 'tapd.sync_bugs',
        metadata: { syncedCount: result.syncedCount, currentOwner: result.currentOwner, workspaceCount: result.workspaceCount }
      });
      return {
        syncedCount: result.syncedCount,
        currentOwner: result.currentOwner,
        workspaceCount: result.workspaceCount,
        warning: result.warning
      };
    });
  }

  async function deleteTapdDefects(ids: string[]) {
    if (ids.length === 0) return;
    await runBusy('Deleting TAPD defects', async () => {
      const nextState = await api.deleteTapdDefects({ ids });
      setState({ ...emptyState, ...nextState, settings: { ...emptyState.settings, ...nextState.settings } });
      trackEvent({ category: 'tapd', name: 'tapd.delete', metadata: { count: ids.length } });
    });
  }

  async function sendTapdBatchToPrompt(input: { defectIds: string[]; projectId: string }) {
    const defects = activeTapdDefects.filter((defect) => input.defectIds.includes(defect.id));
    const project = visibleProjects.find((candidate) => candidate.id === input.projectId);
    if (!project || defects.length === 0) return;
    await runBusy('Creating TAPD prompt', async () => {
      const sources = defects.map((defect): ExternalIssueSource => ({
        provider: 'tapd',
        tapdType: defect.type || 'bug',
        workspaceId: defect.workspaceId,
        workspaceName: defect.workspaceName,
        projectId: defect.projectId,
        defectId: defect.defectId,
        title: defect.title,
        description: defect.description,
        url: defect.url,
        status: defect.status,
        priority: defect.priority,
        severity: defect.severity,
        assignee: defect.assignee,
        updatedAt: defect.updatedAt,
        syncedAt: defect.syncedAt
      }));
      const createdState = await api.createWorkItem({
        title: buildTapdBatchTitle(defects),
        notes: buildTapdBatchRequirement(defects, state.settings.promptRules || DEFAULT_PROMPT_RULES),
        projectId: project.id,
        priority: priorityFromTapdBatch(defects),
        externalSources: sources
      });
      setState(createdState);
      const createdItem = createdState.workItems[0];
      const tapdBugIds = defects.filter((defect) => (defect.type || 'bug') === 'bug').map((defect) => defect.id);
      if (tapdBugIds.length > 0) {
        try {
          const syncedState = await api.syncTapdBugStatus({ ids: tapdBugIds, status: '接受处理' });
          setState({ ...emptyState, ...syncedState, settings: { ...emptyState.settings, ...syncedState.settings } });
        } catch (error) {
          console.warn('TAPD status sync failed while sending to Prompt:', error);
        }
      }
      if (createdItem) await createPromptFromWorkItem(createdItem, project.id, { autoCreateTask: true });
      trackEvent({ category: 'tapd', name: 'tapd.to_prompt', metadata: { count: defects.length } });
    });
  }

  function openTaskExecutor(taskId: string) {
    const task = activeTasks.find((item) => item.id === taskId);
    if (task) setSelectedProjectId(task.projectId);
    setSelectedExecutorTaskId(taskId);
    setActiveModule('executor');
  }

  function openProjectUnfinished(projectId: string) {
    const unfinishedTasks = activeTasks.filter((task) => task.projectId === projectId && task.status !== 'done');
    const unfinishedWorkItems = activeWorkItems.filter(
      (item) => item.projectId === projectId && item.status !== 'done' && !workItemLinkedTask(item, activeTasks)
    );
    const unfinishedCount = unfinishedTasks.length + unfinishedWorkItems.length;
    setSelectedProjectId(projectId);
    if (unfinishedCount === 1 && unfinishedTasks.length === 1) {
      setSelectedExecutorTaskId(unfinishedTasks[0].id);
      setActiveModule('executor');
      return;
    }
    setSelectedExecutorTaskId(undefined);
    setActiveModule('issues');
  }

  function openTaskByWorkflow(task: TaskRecord) {
    setSelectedProjectId(task.projectId);
    if (task.groupId) setSelectedTaskGroupId(task.groupId);
    setSelectedExecutorTaskId(task.id);
    setTodayOpen(false);
    const hasRun = state.runs.some((run) => run.taskId === task.id);
    if (task.status === 'done') {
      setActiveModule('memory');
      return;
    }
    if (hasRun || ['in-progress', 'review', 'need-changes', 'blocked'].includes(task.status)) {
      setActiveModule('executor');
      return;
    }
    setActiveModule('issues');
  }

  function openPromptThreadForTask(task: TaskRecord) {
    setSelectedProjectId(task.projectId);
    if (task.conversationId) setSelectedConversationId(task.conversationId);
    setActiveModule('prompt');
  }

  const promptingWorkItem = activeWorkItems.find((item) => item.id === promptingWorkItemId);
  const promptingBranchChangeRequested = Boolean(promptingNewBranch.trim()) || Boolean(
    promptingBranchInfo &&
    promptingBranch.trim() &&
    promptingBranch.trim() !== promptingBranchInfo.currentBranch
  );

  async function startTaskRun(taskId: string, feedback?: string) {
    await runBusy('Starting task', async () => {
      const nextState = await api.startTaskRun({ taskId, feedback });
      setState(nextState);
      setSelectedExecutorTaskId(taskId);
      setActiveModule('executor');
      trackEvent({ category: 'executor', name: feedback?.trim() ? 'executor.continue' : 'executor.start' });
    });
  }

  async function cancelTaskRun(runId: string) {
    await runBusy('Cancelling run', async () => {
      const nextState = await api.cancelTaskRun({ runId });
      setState(nextState);
      trackEvent({ category: 'executor', name: 'executor.cancel' });
    });
  }

  async function undoTaskRun(runId: string) {
    await runBusy('Undoing run', async () => {
      const nextState = await api.undoTaskRun({ runId });
      setState(nextState);
      trackEvent({ category: 'executor', name: 'executor.undo' });
    });
  }

  async function completeTask(taskId: string, runId: string | undefined, saveMemory: boolean) {
    await runBusy('Completing task', async () => {
      const nextState = await api.completeTask({ taskId, runId, saveMemory });
      const linkedWorkItem = nextState.workItems.find((item) => item.taskId === taskId);
      const finalState = linkedWorkItem
        ? await api.updateWorkItem({ id: linkedWorkItem.id, status: 'done' })
        : nextState;
      const tapdBugIds = linkedWorkItem ? tapdBugDefectIdsForSources(finalState.tapdDefects, linkedWorkItem.externalSources || []) : [];
      if (tapdBugIds.length > 0) {
        try {
          const syncedState = await api.syncTapdBugStatus({ ids: tapdBugIds, status: '我已完成' });
          setState({ ...emptyState, ...syncedState, settings: { ...emptyState.settings, ...syncedState.settings } });
        } catch (error) {
          console.warn('TAPD status sync failed while completing task:', error);
          setState(finalState);
        }
      } else {
        setState(finalState);
      }
      trackEvent({ category: 'executor', name: 'executor.done', metadata: { saveMemory } });
    });
  }

  const rightPanelHidden = activeModule === 'kanban' || activeModule === 'settings' || activeModule === 'tapd' || activeModule === 'memory' || activeModule === 'trash';
  const rightPanelCollapsed = rightCollapsed || rightPanelHidden;

  return (
    <div
      className={clsx(
        'grid h-screen bg-md-surfaceContainer text-md-text',
        leftCollapsed && rightPanelCollapsed && 'grid-cols-[56px_minmax(0,1fr)]',
        leftCollapsed && !rightPanelCollapsed && 'grid-cols-[56px_minmax(0,1fr)_390px]',
        !leftCollapsed && rightPanelCollapsed && 'grid-cols-[300px_minmax(0,1fr)]',
        !leftCollapsed && !rightPanelCollapsed && 'grid-cols-[300px_minmax(0,1fr)_390px]'
      )}
    >
      <Sidebar
        state={state}
        selectedProjectId={selectedProject?.id}
        selectedConversationId={selectedConversation?.id}
        onSelectProject={(projectId) => {
          setSelectedProjectId(projectId);
          setSelectedExecutorTaskId(undefined);
          const agent = state.agents.find((item) => item.projectId === projectId);
          setSelectedConversationId(activeConversations.find((item) => item.agentId === agent?.id)?.id);
          setActiveModule('issues');
        }}
        onOpenProjectUnfinished={openProjectUnfinished}
        onSelectConversation={setSelectedConversationId}
        onAddProject={addProject}
        onRemoveProject={removeProject}
        onDeleteConversation={deleteConversation}
        activeModule={activeModule}
        onChangeModule={setActiveModule}
        collapsed={leftCollapsed}
        onToggleCollapsed={() => setLeftCollapsed((value) => !value)}
        isBusy={Boolean(busyLabel)}
      />
      <main className="flex min-h-0 flex-col bg-md-surfaceContainer px-5 py-4">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-md-muted">
              {activeModule === 'kanban'
                ? 'Global workspace'
                : activeModule === 'tapd'
                  ? 'External defect pool'
                : activeModule === 'trash'
                  ? 'Global workspace'
                  : activeModule === 'memory'
                    ? 'Global workspace'
                  : activeModule === 'executor'
                    ? 'Selected issue'
                    : activeModule === 'issues'
                      ? 'Project workspace'
                      : 'Current agent'}
            </p>
            <h2 className="truncate text-xl font-semibold text-md-text">
              {activeModule === 'kanban'
                ? 'Work Calendar'
                : activeModule === 'tapd'
                  ? 'TAPD My Work'
                : activeModule === 'trash'
                  ? 'Trash'
                : activeModule === 'settings'
                  ? 'Settings'
                : activeModule === 'memory'
                  ? 'Memory'
                : activeModule === 'executor'
                  ? executorTask?.title || 'No issue selected'
                  : activeModule === 'issues'
                    ? selectedProject?.name || 'No project selected'
                    : selectedAgent?.name || 'No project selected'}
            </h2>
          </div>
          {activeModule !== 'kanban' && activeModule !== 'settings' && activeModule !== 'tapd' && activeModule !== 'memory' && activeModule !== 'trash' ? (
            <ModuleNav
              activeModule={activeModule}
              onChange={setActiveModule}
              executorRunning={selectedProjectExecutorRunning}
            />
          ) : null}
        </div>

        {activeModule === 'issues' ? (
          <IssuesModule
            project={selectedProject}
            tasks={projectTasks}
            workItems={activeWorkItems}
            conversations={activeConversations}
            runs={state.runs}
            onOpenExecutor={openTaskExecutor}
            onOpenPromptThread={openPromptThreadForTask}
            onOpenWorkItem={openWorkItem}
            onDeleteWorkItem={deleteWorkItem}
            onDeleteTask={deleteTask}
            onQuickChange={createQuickChange}
            isBusy={Boolean(busyLabel)}
          />
        ) : null}

        {activeModule === 'settings' ? (
          <SettingsModule
            settings={state.settings}
            analyticsEvents={state.analyticsEvents}
            onUpdateSettings={updateSettings}
            onBack={() => setActiveModule(selectedProject ? 'issues' : 'kanban')}
            isBusy={Boolean(busyLabel)}
          />
        ) : null}

        {activeModule === 'prompt' ? (
          <PromptModule
            project={selectedProject}
            agent={selectedAgent}
            selectedConversation={selectedConversation}
            onExpandPrompt={expandPrompt}
            onCreateTask={createTaskFromConversation}
            isBusy={Boolean(busyLabel)}
          />
        ) : null}

        {activeModule === 'kanban' ? (
          <KanbanModule
            tasks={visibleTasks}
            workItems={activeWorkItems}
            taskGroups={activeTaskGroups}
            projects={visibleProjects}
            runs={state.runs}
            selectedProject={selectedProject}
            selectedTaskGroupId={selectedTaskGroupId}
            scope={kanbanScope}
            onScopeChange={setKanbanScope}
            onSelectGroup={setSelectedTaskGroupId}
            onMoveGroupToReady={moveTaskGroupToReady}
            onAddProjectToGroup={addProjectToTaskGroup}
            onOpenExecutor={openExecutorForGroup}
            onStatus={updateTaskStatus}
            onScheduleTask={scheduleTask}
            onCreateWorkItem={createWorkItem}
            onUpdateWorkItem={updateWorkItem}
            onDeleteWorkItem={deleteWorkItem}
            onGenerateWeeklyReport={generateBoardWeeklyReport}
            isBusy={Boolean(busyLabel)}
            onOpenWorkItem={openWorkItem}
            onOpenTaskExecutor={(taskId) => {
              const task = activeTasks.find((item) => item.id === taskId);
              if (task) openTaskByWorkflow(task);
            }}
            onOpenToday={() => setTodayOpen(true)}
            onDeleteTask={deleteTask}
            onDeleteTaskGroup={deleteTaskGroup}
          />
        ) : null}

        {activeModule === 'tapd' ? (
          <TapdModule
            defects={activeTapdDefects}
            projects={visibleProjects}
            workItems={activeWorkItems}
            tasks={visibleTasks}
            onSyncBugs={syncTapdBugs}
            onImportFile={importTapdDefectsFile}
            onDeleteDefects={deleteTapdDefects}
            onSendToPrompt={sendTapdBatchToPrompt}
            onOpenExternal={(url) => void api.openExternal({ url })}
            onOpenSettings={() => setActiveModule('settings')}
            isBusy={Boolean(busyLabel)}
          />
        ) : null}

        {activeModule === 'executor' ? (
          <ExecutorModule
            tasks={visibleTasks}
            conversations={activeConversations}
            workItems={activeWorkItems}
            taskGroups={activeTaskGroups}
            projects={visibleProjects}
            runs={state.runs}
            codexHealth={codexHealth}
            selectedProject={selectedProject}
            selectedTaskId={selectedExecutorTaskId}
            selectedTaskGroupId={selectedTaskGroupId}
            onSelectGroup={setSelectedTaskGroupId}
            onStatus={updateTaskStatus}
            onStartRun={startTaskRun}
            onCancelRun={cancelTaskRun}
            onUndoRun={undoTaskRun}
            onCompleteTask={completeTask}
            onSaveMemory={saveMemory}
            onDeleteTask={deleteTask}
            onReviseTask={reviseTask}
            isBusy={Boolean(busyLabel)}
          />
        ) : null}

        <Dialog.Root
          open={Boolean(promptingWorkItem)}
          onOpenChange={(open) => {
            if (!open) {
              setPromptingWorkItemId(undefined);
              setPromptingBranchInfo(undefined);
              setPromptingBranch('');
              setPromptingNewBranch('');
            }
          }}
        >
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
              <Dialog.Title className="text-base font-semibold text-md-text">流转到 Prompt</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-md-muted">
                选择项目和执行分支。继续使用当前分支可以保留未提交改动；切换或创建分支前必须保持工作区干净。
              </Dialog.Description>
              <div className="dialog-body">
                <label className="field-label">Project</label>
                <select
                  className="field-input"
                  value={promptingProjectId || ''}
                  onChange={(event) => setPromptingProjectId(event.target.value)}
                >
                  {visibleProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <div className="mt-3 rounded-md bg-md-surfaceContainer p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-md-muted">Branch</p>
                      <p className="text-sm font-semibold text-md-text">
                        {promptingBranchInfo?.currentBranch || 'Loading...'}
                      </p>
                    </div>
                    {promptingBranchInfo?.isDirty ? (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">dirty</span>
                    ) : null}
                  </div>
                  {promptingBranchInfo?.error ? (
                    <p className="mt-2 text-xs text-red-600">{promptingBranchInfo.error}</p>
                  ) : null}
                  {promptingBranchInfo?.isDirty ? (
                    <p className="mt-2 text-xs text-amber-700">
                      当前分支有未提交内容：可继续使用当前分支流转到 Prompt；如需切换或创建分支，请先提交或清理工作区。
                    </p>
                  ) : null}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <select
                      className="field-input h-10"
                      value={promptingBranch}
                      disabled={!promptingBranchInfo || promptingBranchInfo.isDirty || Boolean(promptingBranchInfo.error) || Boolean(promptingNewBranch.trim())}
                      onChange={(event) => setPromptingBranch(event.target.value)}
                    >
                      {promptingBranchInfo?.branches.map((branch) => (
                        <option key={branch} value={branch}>
                          {branch}
                        </option>
                      ))}
                    </select>
                    <input
                      className="field-input h-10"
                      value={promptingNewBranch}
                      disabled={!promptingBranchInfo || promptingBranchInfo.isDirty || Boolean(promptingBranchInfo.error)}
                      onFocus={() => {
                        if (!promptingNewBranch.trim()) setPromptingNewBranch('features/');
                      }}
                      onChange={(event) => setPromptingNewBranch(event.target.value)}
                      placeholder="features/name"
                    />
                  </div>
                </div>
              </div>
              <div className="dialog-footer flex justify-end gap-2">
                <Dialog.Close asChild>
                  <Button variant="tonal">Cancel</Button>
                </Dialog.Close>
                <Button
                  disabled={
                    !promptingWorkItem ||
                    !promptingProjectId ||
                    !promptingBranchInfo ||
                    (promptingBranchInfo.isDirty && promptingBranchChangeRequested) ||
                    Boolean(promptingBranchInfo.error) ||
                    (!promptingNewBranch.trim() && !promptingBranch.trim())
                  }
                  onClick={() => void createPromptFromWorkItemWithBranch()}
                >
                  <Sparkles size={17} />
                  Create Prompt
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {activeModule === 'memory' ? (
          <MemoryModule
            memories={visibleMemories}
            projects={visibleProjects}
            agents={state.agents}
            conversations={activeConversations}
            onDeleteMemory={deleteMemory}
          />
        ) : null}
        {activeModule === 'trash' ? (
          <TrashModule
            state={state}
            onRestore={restoreTrashItem}
            onDeleteForever={permanentlyDeleteTrashItem}
            onClearAll={clearTrash}
            isBusy={Boolean(busyLabel)}
          />
        ) : null}
      </main>
      {!rightPanelHidden ? (
        <SummaryPanel
          project={selectedProject}
          tasks={projectTasks}
          activeModule={activeModule}
          onRescan={rescanProject}
          onGitRefresh={refreshGitState}
          onGitCommit={commitGitChanges}
          onGitPush={pushGitChanges}
          onGitCheckout={checkoutGitBranch}
          onGitCheckoutNewBranch={checkoutNewGitBranch}
          onGenerateCommitMessage={generateCommitMessage}
          onOpenEditor={openProjectInEditor}
          onOpenIssue={openTaskExecutor}
          gitBranchInfo={gitBranchInfo}
          codexHealth={codexHealth}
          collapsed={rightCollapsed}
          onToggleCollapsed={() => setRightCollapsed((value) => !value)}
          isBusy={Boolean(busyLabel)}
        />
      ) : null}
      <TodayDialog
        open={todayOpen}
        onOpenChange={setTodayOpen}
        workItems={activeWorkItems}
        tasks={visibleTasks}
        projects={visibleProjects}
        runs={state.runs}
        onOpenWorkItem={(item) => {
          setTodayOpen(false);
          openWorkItem(item);
        }}
        onOpenTask={openTaskByWorkflow}
      />
      {busyLabel ? (
        <div className="pointer-events-none fixed bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-md-text px-4 py-2 text-sm text-md-surface shadow-lg">
          <Loader2 size={16} className="animate-spin" />
          {busyLabel}
        </div>
      ) : null}
    </div>
  );
}

function buildTapdBatchTitle(defects: TapdDefectRecord[]) {
  const firstTitle = defects[0]?.title || 'TAPD 工作';
  return defects.length === 1 ? `处理 TAPD 工作：${firstTitle}` : `批量处理 TAPD 工作：${firstTitle} 等 ${defects.length} 项`;
}

function buildTapdBatchRequirement(defects: TapdDefectRecord[], promptRules: string) {
  const list = defects.map((defect, index) => [
    `${index + 1}. TAPD ${tapdTypeLabel(defect.type)} #${defect.defectId.replace(/^(bug|task|story)_/, '')}：${defect.title}`,
    `   项目：${defect.workspaceName || defect.workspaceId}`,
    `   状态：${defect.status}`,
    `   处理人：${defect.assignee || 'unknown'}`,
    defect.priority ? `   优先级：${defect.priority}` : '',
    defect.severity ? `   严重程度：${defect.severity}` : '',
    defect.url ? `   链接：${defect.url}` : '',
    defect.description ? `   描述：${defect.description}` : ''
  ].filter(Boolean).join('\n')).join('\n\n');

  return [
    '请把下面这一批 TAPD 工作记录整理成一个可执行 issue。',
    '',
    '规则：',
    '- 先判断这些 TAPD 工作记录是否适合合并处理。',
    `- 如果不适合合并，关键问题数量遵循当前 Prompt 规则：${promptQuestionLimitText(promptRules)}，或建议拆分。`,
    '- 不要直接写代码。',
    '- 不要假设未确认的业务规则。',
    '- 需求清楚后输出 issue，必须包含：目标、范围、不做什么、约束、验收标准。',
    '',
    'TAPD 工作列表：',
    list
  ].join('\n');
}

function tapdTypeLabel(type?: TapdDefectRecord['type']) {
  if (type === 'task') return '任务';
  if (type === 'story') return '需求';
  return '缺陷';
}

function tapdBugDefectIdsForSources(defects: TapdDefectRecord[], sources: ExternalIssueSource[]) {
  return defects
    .filter((defect) => (defect.type || 'bug') === 'bug')
    .filter((defect) => sources.some((source) => (
      source.provider === 'tapd' &&
      (source.tapdType || 'bug') === 'bug' &&
      source.workspaceId === defect.workspaceId &&
      source.defectId === defect.defectId
    )))
    .map((defect) => defect.id);
}

function waitForPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
  });
}

function promptQuestionLimitText(promptRules: string) {
  const match = promptRules.match(/最多\s*(?:问|提出|输出)?\s*([0-9一二三四五六七八九十]+)\s*个/);
  return match ? `最多问 ${match[1]} 个关键问题` : '只问必要的关键问题';
}

function priorityFromTapdBatch(defects: TapdDefectRecord[]): TaskPriority {
  const value = defects.map((defect) => `${defect.priority || ''} ${defect.severity || ''}`).join(' ').toLowerCase();
  if (/high|urgent|严重|紧急|高|p0|p1/.test(value)) return 'high';
  if (/low|低|p3|p4/.test(value)) return 'low';
  return 'medium';
}

createRoot(document.getElementById('root')!).render(<App />);
