export type MemoryScope = 'global' | 'project' | 'agent' | 'conversation';
export type WorkflowModule = 'issues' | 'prompt' | 'kanban' | 'tapd' | 'executor' | 'memory' | 'settings' | 'trash';
export type TaskStatus = 'inbox' | 'ready' | 'in-progress' | 'blocked' | 'review' | 'need-changes' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskWorkflowMode = 'standard' | 'quick-change';
export type WorkItemStatus = 'planned' | 'prompting' | 'issued' | 'done';
export type ExecutorRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type ThemeMode = 'light' | 'dark' | 'system';
export type CodexReasoningEffort = 'low' | 'medium' | 'high';
export type TrashEntityType = 'project' | 'conversation' | 'task' | 'taskGroup' | 'workItem' | 'memory' | 'tapdDefect';
export type AnalyticsEventCategory = 'navigation' | 'project' | 'prompt' | 'calendar' | 'executor' | 'memory' | 'tapd' | 'git' | 'settings' | 'trash';

export interface ProjectSummary {
  detectedStack: string[];
  packageManager?: string;
  scripts: Record<string, string>;
  documentFiles: string[];
  importantDirectories: string[];
  notes: string[];
  generatedAt: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  path: string;
  groupId?: string;
  sortOrder?: number;
  hiddenAt?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
  summary?: ProjectSummary;
}

export interface AppSettings {
  codexModel: string;
  codexReasoningEffort: CodexReasoningEffort;
  promptCorePreset: string;
  promptRules: string;
  weeklyReportCorePreset: string;
  weeklyReportRules: string;
  executorRunCorePreset: string;
  executorRunRules: string;
  executorContinueCorePreset: string;
  executorContinueRules: string;
  themeColor: string;
  themeMode: ThemeMode;
  showTodayOnStartup: boolean;
  dailyUnfinishedReminderEnabled: boolean;
  systemNotificationEnabled: boolean;
  tapdApiBaseUrl: string;
  tapdAuthName: string;
  tapdAuthToken: string;
  tapdAssigneeKeyword: string;
  tapdStatuses: string[];
}

export interface ProjectGroupRecord {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRecord {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationRecord {
  id: string;
  agentId: string;
  title: string;
  requirement: string;
  expandedPrompt: string;
  promptMessages?: PromptMessage[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface PromptMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface MemoryRecord {
  id: string;
  scope: MemoryScope;
  ownerId?: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface TaskRecord {
  id: string;
  groupId?: string;
  conversationId?: string;
  projectId: string;
  agentId: string;
  title: string;
  description: string;
  executionPrompt: string;
  workflowMode?: TaskWorkflowMode;
  status: TaskStatus;
  priority: TaskPriority;
  scheduledFor?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface TaskGroupRecord {
  id: string;
  conversationId: string;
  title: string;
  description: string;
  projectIds: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface WorkItemRecord {
  id: string;
  title: string;
  notes: string;
  priority: TaskPriority;
  scheduledFor?: string;
  projectId?: string;
  conversationId?: string;
  taskId?: string;
  externalSources?: ExternalIssueSource[];
  status: WorkItemStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface ExternalIssueSource {
  provider: 'tapd';
  tapdType?: 'bug' | 'task' | 'story';
  workspaceId: string;
  workspaceName?: string;
  projectId?: string;
  defectId: string;
  title: string;
  description?: string;
  url?: string;
  status?: string;
  priority?: string;
  severity?: string;
  assignee?: string;
  updatedAt?: string;
  syncedAt?: string;
  statusSyncedAt?: string;
  statusSyncError?: string;
}

export interface TapdDefectRecord {
  id: string;
  type?: 'bug' | 'task' | 'story';
  workspaceId: string;
  workspaceName?: string;
  projectId?: string;
  defectId: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  severity?: string;
  assignee?: string;
  reporter?: string;
  url?: string;
  raw?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  syncedAt: string;
  statusSyncedAt?: string;
  statusSyncError?: string;
  deletedAt?: string;
}

export interface ExecutorRunRecord {
  id: string;
  taskId: string;
  projectId: string;
  agentId: string;
  status: ExecutorRunStatus;
  command: string;
  feedback?: string;
  output: string;
  summary?: string;
  summaryError?: string;
  baselineGitStatus?: string;
  baselineGitDiff?: string;
  baselineGitTree?: string;
  changePatch?: string;
  changePatchError?: string;
  undoneAt?: string;
  undoError?: string;
  exitCode?: number;
  error?: string;
  startedAt: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsEventRecord {
  id: string;
  name: string;
  category: AnalyticsEventCategory;
  metadata?: Record<string, string | number | boolean | undefined>;
  createdAt: string;
}

export interface AppState {
  projectGroups: ProjectGroupRecord[];
  projects: ProjectRecord[];
  agents: AgentRecord[];
  conversations: ConversationRecord[];
  memories: MemoryRecord[];
  taskGroups: TaskGroupRecord[];
  tasks: TaskRecord[];
  workItems: WorkItemRecord[];
  tapdDefects: TapdDefectRecord[];
  runs: ExecutorRunRecord[];
  analyticsEvents: AnalyticsEventRecord[];
  settings: AppSettings;
}

export interface AddProjectInput {
  path: string;
}

export interface RemoveProjectInput {
  projectId: string;
  mode: 'hide' | 'delete';
}

export interface CreateProjectGroupInput {
  name: string;
}

export interface UpdateProjectGroupInput {
  id: string;
  name: string;
}

export interface DeleteProjectGroupInput {
  id: string;
}

export interface MoveProjectInput {
  projectId: string;
  groupId?: string;
  beforeProjectId?: string;
}

export interface WeeklyReportInput {
  since: string;
  until: string;
}

export interface WeeklyReportResult {
  markdown: string;
  commitCount: number;
  since: string;
  until: string;
}

export interface GitSnapshotInput {
  projectId: string;
}

export interface GitSnapshotResult {
  status: string;
  diff: string;
}

export interface GitBranchInfoResult {
  currentBranch: string;
  branches: string[];
  isDirty: boolean;
  error?: string;
}

export interface GitCommitInput {
  projectId: string;
  message: string;
}

export interface GitPushInput {
  projectId: string;
}

export interface GitCheckoutInput {
  projectId: string;
  branch: string;
}

export interface GitCheckoutNewBranchInput {
  projectId: string;
  branch: string;
}

export interface GitCommitSuggestionInput {
  projectId: string;
}

export interface GitCommitSuggestionResult {
  message: string;
}

export interface OpenProjectInput {
  projectId: string;
}

export interface OpenExternalInput {
  url: string;
}

export interface PromptAttachment {
  name: string;
  path: string;
  extension: string;
  content: string;
  size: number;
  truncated: boolean;
  supported: boolean;
}

export interface SavePastedImageInput {
  name: string;
  dataUrl: string;
}

export interface CreateConversationInput {
  agentId: string;
  title: string;
  requirement: string;
  initialMessageContent?: string;
}

export interface UpdateConversationInput {
  id: string;
  agentId?: string;
  title?: string;
  requirement?: string;
  initialMessageContent?: string;
  expandedPrompt?: string;
  appendMessages?: Array<Omit<PromptMessage, 'id' | 'createdAt'> & { id?: string; createdAt?: string }>;
}

export interface DeleteConversationInput {
  id: string;
}

export interface SaveMemoryInput {
  scope: MemoryScope;
  ownerId?: string;
  title: string;
  content: string;
}

export interface UpdateMemoryInput extends SaveMemoryInput {
  id: string;
}

export interface DeleteMemoryInput {
  id: string;
}

export interface ExpandPromptInput {
  conversationId?: string;
  projectId: string;
  agentId: string;
  requirement: string;
}

export interface ExpandPromptResult {
  prompt: string;
  usedCodex: boolean;
  error?: string;
}

export interface CreateTaskInput {
  groupId?: string;
  conversationId?: string;
  projectId: string;
  agentId: string;
  title: string;
  description: string;
  executionPrompt?: string;
  workflowMode?: TaskWorkflowMode;
  priority?: TaskPriority;
  status?: TaskStatus;
  scheduledFor?: string;
}

export interface CreateTasksFromConversationInput {
  conversationId: string;
  projectIds: string[];
  priority?: TaskPriority;
  status?: TaskStatus;
}

export interface DeleteTaskInput {
  id: string;
}

export interface DeleteTaskGroupInput {
  id: string;
}

export interface MoveTaskGroupToReadyInput {
  groupId: string;
}

export interface AddProjectToTaskGroupInput {
  groupId: string;
  projectId: string;
}

export interface UpdateTaskInput {
  id: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  scheduledFor?: string;
  title?: string;
  description?: string;
  executionPrompt?: string;
  workflowMode?: TaskWorkflowMode;
}

export interface CreateWorkItemInput {
  title: string;
  notes?: string;
  priority?: TaskPriority;
  scheduledFor?: string;
  projectId?: string;
  externalSources?: ExternalIssueSource[];
}

export interface UpdateWorkItemInput {
  id: string;
  title?: string;
  notes?: string;
  priority?: TaskPriority;
  scheduledFor?: string;
  projectId?: string;
  conversationId?: string;
  taskId?: string;
  externalSources?: ExternalIssueSource[];
  status?: WorkItemStatus;
}

export interface TapdImportResult {
  state: AppState;
  importedCount: number;
  fileName: string;
}

export interface TapdSyncResult {
  state: AppState;
  syncedCount: number;
  currentOwner: string;
  workspaceCount?: number;
  warning?: string;
}

export interface TapdImportDefectsInput {
  defects: TapdDefectRecord[];
}

export interface DeleteTapdDefectsInput {
  ids: string[];
}

export interface SyncTapdBugStatusInput {
  ids: string[];
  status: string;
}

export interface DeleteWorkItemInput {
  id: string;
}

export interface TrashItemInput {
  type: TrashEntityType;
  id: string;
}

export interface TrackAnalyticsEventInput {
  name: string;
  category: AnalyticsEventCategory;
  metadata?: Record<string, string | number | boolean | undefined>;
}

export interface UpdateSettingsInput {
  settings: Partial<AppSettings>;
}

export interface StartTaskRunInput {
  taskId: string;
  feedback?: string;
}

export interface CancelTaskRunInput {
  runId: string;
}

export interface UndoTaskRunInput {
  runId: string;
}

export interface RunUpdateEvent {
  state: AppState;
  runId: string;
}

export interface RunOpenEvent {
  runId: string;
  taskId: string;
  projectId: string;
}

export interface CodexHealthResult {
  ok: boolean;
  version?: string;
  error?: string;
}

export interface ShowNotificationInput {
  title: string;
  body: string;
}

export interface CompleteTaskInput {
  taskId: string;
  runId?: string;
  saveMemory?: boolean;
}

export interface CodexPromptStudioApi {
  appState(): Promise<AppState>;
  selectProjectDirectory(): Promise<string | null>;
  selectPromptFiles(): Promise<PromptAttachment[]>;
  savePastedImage(input: SavePastedImageInput): Promise<PromptAttachment>;
  addProject(input: AddProjectInput): Promise<AppState>;
  removeProject(input: RemoveProjectInput): Promise<AppState>;
  createProjectGroup(input: CreateProjectGroupInput): Promise<AppState>;
  updateProjectGroup(input: UpdateProjectGroupInput): Promise<AppState>;
  deleteProjectGroup(input: DeleteProjectGroupInput): Promise<AppState>;
  moveProject(input: MoveProjectInput): Promise<AppState>;
  rescanProject(projectId: string): Promise<AppState>;
  createConversation(input: CreateConversationInput): Promise<AppState>;
  updateConversation(input: UpdateConversationInput): Promise<AppState>;
  deleteConversation(input: DeleteConversationInput): Promise<AppState>;
  saveMemory(input: SaveMemoryInput): Promise<AppState>;
  updateMemory(input: UpdateMemoryInput): Promise<AppState>;
  deleteMemory(input: DeleteMemoryInput): Promise<AppState>;
  expandPrompt(input: ExpandPromptInput): Promise<ExpandPromptResult>;
  createTask(input: CreateTaskInput): Promise<AppState>;
  createTasksFromConversation(input: CreateTasksFromConversationInput): Promise<AppState>;
  moveTaskGroupToReady(input: MoveTaskGroupToReadyInput): Promise<AppState>;
  addProjectToTaskGroup(input: AddProjectToTaskGroupInput): Promise<AppState>;
  updateTask(input: UpdateTaskInput): Promise<AppState>;
  deleteTask(input: DeleteTaskInput): Promise<AppState>;
  deleteTaskGroup(input: DeleteTaskGroupInput): Promise<AppState>;
  createWorkItem(input: CreateWorkItemInput): Promise<AppState>;
  updateWorkItem(input: UpdateWorkItemInput): Promise<AppState>;
  deleteWorkItem(input: DeleteWorkItemInput): Promise<AppState>;
  updateSettings(input: UpdateSettingsInput): Promise<AppState>;
  tapdSyncBugs(): Promise<TapdSyncResult>;
  tapdImportFile(): Promise<TapdImportResult | null>;
  tapdImportDefects(input: TapdImportDefectsInput): Promise<TapdImportResult>;
  deleteTapdDefects(input: DeleteTapdDefectsInput): Promise<AppState>;
  syncTapdBugStatus(input: SyncTapdBugStatusInput): Promise<AppState>;
  restoreTrashItem(input: TrashItemInput): Promise<AppState>;
  permanentlyDeleteTrashItem(input: TrashItemInput): Promise<AppState>;
  clearTrash(): Promise<AppState>;
  trackAnalyticsEvent(input: TrackAnalyticsEventInput): Promise<AppState>;
  startTaskRun(input: StartTaskRunInput): Promise<AppState>;
  cancelTaskRun(input: CancelTaskRunInput): Promise<AppState>;
  undoTaskRun(input: UndoTaskRunInput): Promise<AppState>;
  completeTask(input: CompleteTaskInput): Promise<AppState>;
  weeklyReport(input: WeeklyReportInput): Promise<WeeklyReportResult>;
  gitSnapshot(input: GitSnapshotInput): Promise<GitSnapshotResult>;
  gitCommit(input: GitCommitInput): Promise<GitSnapshotResult>;
  gitPush(input: GitPushInput): Promise<GitSnapshotResult>;
  gitBranchInfo(input: GitSnapshotInput): Promise<GitBranchInfoResult>;
  gitCheckout(input: GitCheckoutInput): Promise<GitBranchInfoResult>;
  gitCheckoutNewBranch(input: GitCheckoutNewBranchInput): Promise<GitBranchInfoResult>;
  gitCommitSuggestion(input: GitCommitSuggestionInput): Promise<GitCommitSuggestionResult>;
  openProjectInEditor(input: OpenProjectInput): Promise<void>;
  openExternal(input: OpenExternalInput): Promise<void>;
  showNotification(input: ShowNotificationInput): Promise<void>;
  codexHealth(): Promise<CodexHealthResult>;
  onRunUpdate(callback: (event: RunUpdateEvent) => void): () => void;
  onRunOpen(callback: (event: RunOpenEvent) => void): () => void;
}

export const IPC_CHANNELS = {
  appState: 'app:state',
  selectProjectDirectory: 'project:select-directory',
  selectPromptFiles: 'prompt:select-files',
  savePastedImage: 'prompt:save-pasted-image',
  addProject: 'project:add',
  removeProject: 'project:remove',
  createProjectGroup: 'project-group:create',
  updateProjectGroup: 'project-group:update',
  deleteProjectGroup: 'project-group:delete',
  moveProject: 'project:move',
  rescanProject: 'project:rescan',
  createConversation: 'conversation:create',
  updateConversation: 'conversation:update',
  deleteConversation: 'conversation:delete',
  saveMemory: 'memory:save',
  updateMemory: 'memory:update',
  deleteMemory: 'memory:delete',
  expandPrompt: 'codex:expand-prompt',
  createTask: 'task:create',
  createTasksFromConversation: 'task:create-from-conversation',
  moveTaskGroupToReady: 'task-group:ready',
  addProjectToTaskGroup: 'task-group:add-project',
  updateTask: 'task:update',
  deleteTask: 'task:delete',
  deleteTaskGroup: 'task-group:delete',
  createWorkItem: 'work-item:create',
  updateWorkItem: 'work-item:update',
  deleteWorkItem: 'work-item:delete',
  updateSettings: 'settings:update',
  tapdSyncBugs: 'tapd:sync-bugs',
  tapdImportFile: 'tapd:import-file',
  tapdImportDefects: 'tapd:import-defects',
  deleteTapdDefects: 'tapd:delete-defects',
  syncTapdBugStatus: 'tapd:sync-bug-status',
  restoreTrashItem: 'trash:restore',
  permanentlyDeleteTrashItem: 'trash:delete-permanently',
  clearTrash: 'trash:clear-all',
  trackAnalyticsEvent: 'analytics:track',
  startTaskRun: 'task-run:start',
  cancelTaskRun: 'task-run:cancel',
  undoTaskRun: 'task-run:undo',
  completeTask: 'task:complete',
  weeklyReport: 'project:weekly-report',
  gitSnapshot: 'git:snapshot',
  gitCommit: 'git:commit',
  gitPush: 'git:push',
  gitBranchInfo: 'git:branch-info',
  gitCheckout: 'git:checkout',
  gitCheckoutNewBranch: 'git:checkout-new-branch',
  gitCommitSuggestion: 'git:commit-suggestion',
  openProjectInEditor: 'project:open-editor',
  openExternal: 'app:open-external',
  showNotification: 'app:show-notification',
  codexHealth: 'codex:health',
  runUpdate: 'task-run:update',
  runOpen: 'task-run:open'
} as const;
