import { api } from '../lib/api';
import { applyThemeColor } from '../lib/workflow';
import type {
  AppSettings,
  AppState,
  ExternalIssueSource,
  ProjectRecord,
  SaveMemoryInput,
  TaskPriority,
  TaskStatus,
  TrackAnalyticsEventInput,
  WorkItemRecord
} from '../../shared/types';

type RunBusy = <T>(label: string, action: () => Promise<T>) => Promise<T>;

export function useCrudActions({
  runBusy,
  setState,
  selectedProject,
  selectedProjectId,
  selectedAgentId,
  setSelectedProjectId,
  setSelectedConversationId,
  setSelectedTaskGroupId,
  trackEvent
}: {
  runBusy: RunBusy;
  setState: (state: AppState) => void;
  selectedProject?: ProjectRecord;
  selectedProjectId?: string;
  selectedAgentId?: string;
  setSelectedProjectId: (id: string | undefined) => void;
  setSelectedConversationId: (id: string | undefined) => void;
  setSelectedTaskGroupId: (id: string | undefined) => void;
  trackEvent: (input: TrackAnalyticsEventInput) => void;
}) {
  async function addProject() {
    await runBusy('Adding project', async () => {
      const selectedPath = await api.selectProjectDirectory();
      if (!selectedPath) return;
      const nextState = await api.addProject({ path: selectedPath });
      setState(nextState);
      setSelectedProjectId(nextState.projects.find((project) => project.path === selectedPath)?.id);
      trackEvent({ category: 'project', name: 'project.add' });
    });
  }

  async function removeProject(projectId: string, mode: 'hide' | 'delete') {
    await runBusy(mode === 'hide' ? 'Hiding project' : 'Deleting project', async () => {
      const nextState = await api.removeProject({ projectId, mode });
      const nextVisibleProjects = nextState.projects.filter((project) => !project.hiddenAt);
      const nextSelectedProject = nextVisibleProjects.find((project) => project.id === selectedProjectId);
      setState(nextState);
      setSelectedProjectId(nextSelectedProject?.id);
      trackEvent({ category: 'project', name: mode === 'hide' ? 'project.hide' : 'project.delete' });
    });
  }

  async function rescanProject() {
    if (!selectedProject) return;
    await runBusy('Scanning project', async () => {
      const nextState = await api.rescanProject(selectedProject.id);
      setState(nextState);
    });
  }

  async function deleteConversation(id: string) {
    await runBusy('Deleting conversation', async () => {
      const nextState = await api.deleteConversation({ id });
      const nextConversation = nextState.conversations.find((conversation) => conversation.agentId === selectedAgentId);
      setState(nextState);
      setSelectedConversationId(nextConversation?.id);
      trackEvent({ category: 'prompt', name: 'prompt.delete_thread' });
    });
  }

  async function deleteTask(taskId: string) {
    await runBusy('Deleting task', async () => {
      const nextState = await api.deleteTask({ id: taskId });
      setState(nextState);
      trackEvent({ category: 'calendar', name: 'issue.delete' });
    });
  }

  async function deleteTaskGroup(groupId: string) {
    await runBusy('Deleting task group', async () => {
      const nextState = await api.deleteTaskGroup({ id: groupId });
      setState(nextState);
      setSelectedTaskGroupId(undefined);
      trackEvent({ category: 'calendar', name: 'issue_group.delete' });
    });
  }

  async function updateTaskStatus(taskId: string, status: TaskStatus) {
    await runBusy('Updating task', async () => {
      const nextState = await api.updateTask({ id: taskId, status });
      setState(nextState);
    });
  }

  async function scheduleTask(taskId: string, scheduledFor?: string) {
    await runBusy('Scheduling task', async () => {
      const nextState = await api.updateTask({ id: taskId, scheduledFor });
      setState(nextState);
    });
  }

  async function createWorkItem(input: {
    title: string;
    notes?: string;
    priority?: TaskPriority;
    scheduledFor?: string;
    projectId?: string;
    externalSources?: ExternalIssueSource[];
  }) {
    await runBusy('Creating work item', async () => {
      const nextState = await api.createWorkItem(input);
      setState(nextState);
      trackEvent({ category: 'calendar', name: 'work_item.create', metadata: { hasProject: Boolean(input.projectId) } });
    });
  }

  async function updateWorkItem(input: Partial<WorkItemRecord> & { id: string }) {
    await runBusy('Updating work item', async () => {
      const nextState = await api.updateWorkItem(input);
      setState(nextState);
    });
  }

  async function deleteWorkItem(id: string) {
    await runBusy('Deleting work item', async () => {
      const nextState = await api.deleteWorkItem({ id });
      setState(nextState);
      trackEvent({ category: 'calendar', name: 'work_item.delete' });
    });
  }

  async function moveTaskGroupToReady(groupId: string) {
    await runBusy('Preparing task group', async () => {
      const nextState = await api.moveTaskGroupToReady({ groupId });
      setState(nextState);
      setSelectedTaskGroupId(groupId);
    });
  }

  async function addProjectToTaskGroup(groupId: string, projectId: string) {
    await runBusy('Adding project to group', async () => {
      const nextState = await api.addProjectToTaskGroup({ groupId, projectId });
      setState(nextState);
      setSelectedTaskGroupId(groupId);
    });
  }

  async function saveMemory(input: SaveMemoryInput) {
    await runBusy('Saving memory', async () => {
      const nextState = await api.saveMemory(input);
      setState(nextState);
    });
  }

  async function updateMemory(input: SaveMemoryInput & { id: string }) {
    await runBusy('Updating memory', async () => {
      const nextState = await api.updateMemory(input);
      setState(nextState);
    });
  }

  async function deleteMemory(id: string) {
    await runBusy('Deleting memory', async () => {
      const nextState = await api.deleteMemory({ id });
      setState(nextState);
      trackEvent({ category: 'memory', name: 'memory.delete' });
    });
  }

  async function restoreTrashItem(input: Parameters<typeof api.restoreTrashItem>[0]) {
    await runBusy('Restoring item', async () => {
      const nextState = await api.restoreTrashItem(input);
      setState(nextState);
      trackEvent({ category: 'trash', name: 'trash.restore', metadata: { type: input.type } });
    });
  }

  async function permanentlyDeleteTrashItem(input: Parameters<typeof api.permanentlyDeleteTrashItem>[0]) {
    await runBusy('Deleting permanently', async () => {
      const nextState = await api.permanentlyDeleteTrashItem(input);
      setState(nextState);
      trackEvent({ category: 'trash', name: 'trash.delete_forever', metadata: { type: input.type } });
    });
  }

  async function clearTrash() {
    await runBusy('Clearing trash', async () => {
      const nextState = await api.clearTrash();
      setState(nextState);
      trackEvent({ category: 'trash', name: 'trash.clear_all' });
    });
  }

  async function updateSettings(settings: Partial<AppSettings>, options: { silent?: boolean } = {}) {
    const applyNextState = async () => {
      const nextState = await api.updateSettings({ settings });
      setState(nextState);
      applyThemeColor(nextState.settings.themeColor, nextState.settings.themeMode);
      if (!options.silent) trackEvent({ category: 'settings', name: 'settings.update' });
    };

    if (options.silent) {
      await applyNextState();
      return;
    }

    await runBusy('Saving settings', applyNextState);
  }

  async function generateBoardWeeklyReport(input: { since: string; until: string }) {
    return runBusy('Generating weekly report', async () => {
      const result = await api.weeklyReport(input);
      trackEvent({ category: 'calendar', name: 'weekly_report.generate' });
      return result.markdown;
    });
  }

  return {
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
  };
}
