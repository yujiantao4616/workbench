import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { AppStore } from './services/store.js';
import { scanProject } from './services/projectScanner.js';
import { buildPromptFallback, buildStaticPrompt, buildTaskExecutionPrompt } from './services/promptBuilder.js';
import { checkCodexHealth, runCodexPromptExpansion } from './services/codex.js';
import { RunManager } from './services/runManager.js';
import { generateWeeklyReport } from './services/weeklyReport.js';
import { importTapdDefectsFromSheet, syncTapdBugs, updateTapdBugStatus } from './services/tapd.js';
import { gitBranchInfo, gitCheckout, gitCheckoutNewBranch, gitCommit, gitCommitSuggestion, gitPush, gitSnapshot } from './services/git.js';
import { IPC_CHANNELS, type AddProjectInput, type AddProjectToTaskGroupInput, type CancelTaskRunInput, type CompleteTaskInput, type CreateConversationInput, type CreateProjectGroupInput, type CreateTaskInput, type CreateTasksFromConversationInput, type CreateWorkItemInput, type DeleteConversationInput, type DeleteMemoryInput, type DeleteProjectGroupInput, type DeleteTapdDefectsInput, type DeleteTaskGroupInput, type DeleteTaskInput, type DeleteWorkItemInput, type ExpandPromptInput, type GitCheckoutInput, type GitCheckoutNewBranchInput, type GitCommitInput, type GitCommitSuggestionInput, type GitPushInput, type GitSnapshotInput, type MoveProjectInput, type MoveTaskGroupToReadyInput, type OpenExternalInput, type OpenProjectInput, type RemoveProjectInput, type SaveMemoryInput, type SavePastedImageInput, type ShowNotificationInput, type StartTaskRunInput, type SyncTapdBugStatusInput, type TapdImportDefectsInput, type TrackAnalyticsEventInput, type TrashItemInput, type UndoTaskRunInput, type UpdateConversationInput, type UpdateMemoryInput, type UpdateProjectGroupInput, type UpdateSettingsInput, type UpdateTaskInput, type UpdateWorkItemInput, type WeeklyReportInput } from '../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', path.join(app.getPath('appData'), 'codex-prompt-studio'));
const store = new AppStore();
const runManager = new RunManager(store);
const execFileAsync = promisify(execFile);
const maxPromptAttachmentBytes = 220 * 1024;
const supportedPromptAttachmentExts = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.jsonc',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.env',
  '.csv',
  '.tsv',
  '.log',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.vue',
  '.svelte',
  '.html',
  '.css',
  '.scss',
  '.less',
  '.xml',
  '.svg',
  '.java',
  '.kt',
  '.swift',
  '.dart',
  '.py',
  '.go',
  '.rs',
  '.rb',
  '.php',
  '.c',
  '.cc',
  '.cpp',
  '.h',
  '.hpp',
  '.gradle',
  '.properties',
  '.lock'
]);

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: 'Codex Workbench',
    backgroundColor: '#fbf8ff',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  await store.recoverInterruptedRuns();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle(IPC_CHANNELS.appState, () => store.read());

ipcMain.handle(IPC_CHANNELS.showNotification, (_event, input: ShowNotificationInput) => {
  if (!Notification.isSupported()) return;
  new Notification({
    title: input.title,
    body: input.body
  }).show();
});

ipcMain.handle(IPC_CHANNELS.openExternal, async (_event, input: OpenExternalInput) => {
  if (!/^https?:\/\//i.test(input.url)) {
    throw new Error('Only http(s) URLs can be opened.');
  }
  await shell.openExternal(input.url);
});

ipcMain.handle(IPC_CHANNELS.selectProjectDirectory, async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select project directory',
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle(IPC_CHANNELS.selectPromptFiles, async () => {
  const result = await dialog.showOpenDialog({
    title: 'Attach files to prompt',
    properties: ['openFile', 'multiSelections']
  });
  if (result.canceled) return [];

  return Promise.all(
    result.filePaths.map(async (filePath) => {
      const stat = await fs.stat(filePath);
      const extension = path.extname(filePath).toLowerCase();
      const supported = supportedPromptAttachmentExts.has(extension);
      if (!supported) {
        return {
          name: path.basename(filePath),
          path: filePath,
          extension,
          content: `Unsupported file type: ${extension || 'unknown'}. Please convert it to text, markdown, JSON, CSV, or code first.`,
          size: stat.size,
          truncated: false,
          supported: false
        };
      }

      const handle = await fs.open(filePath, 'r');
      try {
        const length = Math.min(stat.size, maxPromptAttachmentBytes);
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, 0);
        return {
          name: path.basename(filePath),
          path: filePath,
          extension,
          content: buffer.toString('utf8'),
          size: stat.size,
          truncated: stat.size > maxPromptAttachmentBytes,
          supported: true
        };
      } finally {
        await handle.close();
      }
    })
  );
});

ipcMain.handle(IPC_CHANNELS.savePastedImage, async (_event, input: SavePastedImageInput) => {
  const match = input.dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!match) {
    throw new Error('Unsupported pasted image format.');
  }
  const mime = match[1];
  const extension = mime === 'image/jpeg' ? '.jpg' : mime === 'image/webp' ? '.webp' : '.png';
  const safeName = input.name.replace(/[^a-zA-Z0-9._-]/g, '_') || `pasted-${Date.now()}${extension}`;
  const name = safeName.endsWith(extension) ? safeName : `${safeName}${extension}`;
  const dir = path.join(app.getPath('userData'), 'attachments');
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${Date.now()}-${name}`);
  const imageBuffer = Buffer.from(match[2], 'base64');
  await fs.writeFile(filePath, imageBuffer);
  return {
    name,
    path: filePath,
    extension,
    content: '图片附件。请在需要时读取/查看该路径。',
    size: imageBuffer.byteLength,
    truncated: false,
    supported: false
  };
});

ipcMain.handle(IPC_CHANNELS.addProject, async (_event, input: AddProjectInput) => {
  const summary = await scanProject(input.path);
  return store.addProject(input.path, path.basename(input.path), summary);
});

ipcMain.handle(IPC_CHANNELS.removeProject, (_event, input: RemoveProjectInput) =>
  store.removeProject(input.projectId, input.mode)
);

ipcMain.handle(IPC_CHANNELS.createProjectGroup, (_event, input: CreateProjectGroupInput) =>
  store.createProjectGroup(input.name)
);

ipcMain.handle(IPC_CHANNELS.updateProjectGroup, (_event, input: UpdateProjectGroupInput) =>
  store.updateProjectGroup(input.id, input.name)
);

ipcMain.handle(IPC_CHANNELS.deleteProjectGroup, (_event, input: DeleteProjectGroupInput) =>
  store.deleteProjectGroup(input.id)
);

ipcMain.handle(IPC_CHANNELS.moveProject, (_event, input: MoveProjectInput) =>
  store.moveProject(input.projectId, input.groupId, input.beforeProjectId)
);

ipcMain.handle(IPC_CHANNELS.rescanProject, async (_event, projectId: string) => {
  const state = await store.read();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }
  project.summary = await scanProject(project.path);
  project.updatedAt = new Date().toISOString();
  return store.upsertProject(project);
});

ipcMain.handle(IPC_CHANNELS.createConversation, (_event, input: CreateConversationInput) =>
  store.createConversation(input.agentId, input.title, input.requirement, input.initialMessageContent)
);

ipcMain.handle(IPC_CHANNELS.updateConversation, (_event, input: UpdateConversationInput) =>
  store.updateConversation(input)
);

ipcMain.handle(IPC_CHANNELS.deleteConversation, (_event, input: DeleteConversationInput) =>
  store.deleteConversation(input.id)
);

ipcMain.handle(IPC_CHANNELS.saveMemory, (_event, input: SaveMemoryInput) => store.saveMemory(input));

ipcMain.handle(IPC_CHANNELS.updateMemory, (_event, input: UpdateMemoryInput) => store.updateMemory(input));

ipcMain.handle(IPC_CHANNELS.deleteMemory, (_event, input: DeleteMemoryInput) => store.deleteMemory(input.id));

ipcMain.handle(IPC_CHANNELS.createTask, async (_event, input: CreateTaskInput) => {
  const state = await store.read();
  return store.createTask({
    ...input,
    executionPrompt: buildTaskExecutionPrompt(input, state)
  });
});

ipcMain.handle(IPC_CHANNELS.createTasksFromConversation, async (_event, input: CreateTasksFromConversationInput) => {
  let state = await store.read();
  const conversation = state.conversations.find((item) => item.id === input.conversationId);
  if (!conversation) {
    throw new Error(`Conversation not found: ${input.conversationId}`);
  }
  const groupResult = await store.createTaskGroup({
    conversationId: conversation.id,
    title: conversation.title,
    description: conversation.requirement,
    projectIds: input.projectIds
  });
  state = groupResult.state;

  for (const projectId of input.projectIds) {
    const agent = state.agents.find((item) => item.projectId === projectId);
    if (!agent) {
      throw new Error(`Agent not found for project: ${projectId}`);
    }
    const taskInput: CreateTaskInput = {
      groupId: groupResult.group.id,
      conversationId: conversation.id,
      projectId,
      agentId: agent.id,
      title: conversation.title,
      description: conversation.requirement,
      executionPrompt: conversation.expandedPrompt,
      priority: input.priority ?? 'medium',
      status: input.status ?? 'inbox'
    };
    state = await store.createTask({
      ...taskInput,
      executionPrompt: buildTaskExecutionPrompt(taskInput, state)
    });
  }

  return state;
});

ipcMain.handle(IPC_CHANNELS.updateTask, (_event, input: UpdateTaskInput) => store.updateTask(input));

ipcMain.handle(IPC_CHANNELS.deleteTask, (_event, input: DeleteTaskInput) => store.deleteTask(input.id));

ipcMain.handle(IPC_CHANNELS.deleteTaskGroup, (_event, input: DeleteTaskGroupInput) => store.deleteTaskGroup(input.id));

ipcMain.handle(IPC_CHANNELS.createWorkItem, (_event, input: CreateWorkItemInput) => store.createWorkItem(input));

ipcMain.handle(IPC_CHANNELS.updateWorkItem, (_event, input: UpdateWorkItemInput) => store.updateWorkItem(input));

ipcMain.handle(IPC_CHANNELS.deleteWorkItem, (_event, input: DeleteWorkItemInput) => store.deleteWorkItem(input));

ipcMain.handle(IPC_CHANNELS.updateSettings, (_event, input: UpdateSettingsInput) => store.updateSettings(input));

ipcMain.handle(IPC_CHANNELS.tapdSyncBugs, async () => {
  const state = await store.read();
  const result = await syncTapdBugs(state.settings);
  const nextState = await store.replaceTapdMyWork(result.defects);
  return {
    state: nextState,
    syncedCount: result.syncedCount,
    currentOwner: result.currentOwner,
    workspaceCount: result.workspaceCount,
    warning: result.warning
  };
});

ipcMain.handle(IPC_CHANNELS.tapdImportFile, async (event) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  const options: Electron.OpenDialogOptions = {
    title: 'Import TAPD defects',
    properties: ['openFile'],
    filters: [
      { name: 'Excel or CSV', extensions: ['xlsx', 'xls', 'csv'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  };
  const result = parentWindow ? await dialog.showOpenDialog(parentWindow, options) : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const defects = importTapdDefectsFromSheet(filePath, 'import');
  const nextState = await store.upsertTapdDefects(defects);
  return {
    state: nextState,
    importedCount: defects.length,
    fileName: path.basename(filePath)
  };
});

ipcMain.handle(IPC_CHANNELS.tapdImportDefects, async (_event, input: TapdImportDefectsInput) => {
  const nextState = await store.upsertTapdDefects(input.defects);
  return {
    state: nextState,
    importedCount: input.defects.length,
    fileName: 'selected file'
  };
});

ipcMain.handle(IPC_CHANNELS.deleteTapdDefects, (_event, input: DeleteTapdDefectsInput) => store.deleteTapdDefects(input.ids));

ipcMain.handle(IPC_CHANNELS.syncTapdBugStatus, async (_event, input: SyncTapdBugStatusInput) => {
  const state = await store.read();
  const defects = state.tapdDefects.filter((defect) => input.ids.includes(defect.id) && !defect.deletedAt);
  const results = [];
  for (const defect of defects) {
    try {
      const result = await updateTapdBugStatus(state.settings, defect, input.status);
      results.push({ id: defect.id, ok: result.ok, error: result.error });
    } catch (error) {
      results.push({ id: defect.id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return store.markTapdBugStatusSync(input, results);
});

ipcMain.handle(IPC_CHANNELS.restoreTrashItem, (_event, input: TrashItemInput) => store.restoreTrashItem(input));

ipcMain.handle(IPC_CHANNELS.permanentlyDeleteTrashItem, (_event, input: TrashItemInput) => store.permanentlyDeleteTrashItem(input));

ipcMain.handle(IPC_CHANNELS.clearTrash, () => store.clearTrash());

ipcMain.handle(IPC_CHANNELS.trackAnalyticsEvent, (_event, input: TrackAnalyticsEventInput) => store.trackAnalyticsEvent(input));

ipcMain.handle(IPC_CHANNELS.moveTaskGroupToReady, (_event, input: MoveTaskGroupToReadyInput) =>
  store.moveTaskGroupToReady(input.groupId)
);

ipcMain.handle(IPC_CHANNELS.addProjectToTaskGroup, async (_event, input: AddProjectToTaskGroupInput) => {
  let state = await store.read();
  const group = state.taskGroups.find((item) => item.id === input.groupId);
  if (!group) throw new Error(`Task group not found: ${input.groupId}`);
  const conversation = state.conversations.find((item) => item.id === group.conversationId);
  if (!conversation) throw new Error(`Conversation not found: ${group.conversationId}`);
  const agent = state.agents.find((item) => item.projectId === input.projectId);
  if (!agent) throw new Error(`Agent not found for project: ${input.projectId}`);
  if (state.tasks.some((task) => task.groupId === group.id && task.projectId === input.projectId)) return state;

  const taskInput: CreateTaskInput = {
    groupId: group.id,
    conversationId: conversation.id,
    projectId: input.projectId,
    agentId: agent.id,
    title: conversation.title,
    description: conversation.requirement,
    executionPrompt: conversation.expandedPrompt,
    priority: 'medium',
    status: 'inbox'
  };
  state = await store.createTask({
    ...taskInput,
    executionPrompt: buildTaskExecutionPrompt(taskInput, state)
  });
  state = await store.addProjectToTaskGroup(group.id, input.projectId);
  return state;
});

ipcMain.handle(IPC_CHANNELS.startTaskRun, (_event, input: StartTaskRunInput) => runManager.start(input));

ipcMain.handle(IPC_CHANNELS.cancelTaskRun, (_event, input: CancelTaskRunInput) => runManager.cancel(input.runId));

ipcMain.handle(IPC_CHANNELS.undoTaskRun, (_event, input: UndoTaskRunInput) => runManager.undo(input.runId));

ipcMain.handle(IPC_CHANNELS.completeTask, (_event, input: CompleteTaskInput) => store.completeTask(input));

ipcMain.handle(IPC_CHANNELS.weeklyReport, async (_event, input: WeeklyReportInput) => {
  const state = await store.read();
  return generateWeeklyReport(state, input);
});

async function projectPath(projectId: string) {
  const state = await store.read();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }
  return project.path;
}

async function openProjectPath(target: string) {
  if (process.platform === 'darwin') {
    try {
      await execFileAsync('open', ['-a', 'Visual Studio Code', target]);
      return;
    } catch {
      // Continue with more portable fallbacks below.
    }
  }

  try {
    await execFileAsync('code', ['-r', target]);
    return;
  } catch {
    // Continue with the default system handler.
  }

  const error = await shell.openPath(target);
  if (error) throw new Error(error);
}

ipcMain.handle(IPC_CHANNELS.gitSnapshot, async (_event, input: GitSnapshotInput) =>
  gitSnapshot(await projectPath(input.projectId))
);

ipcMain.handle(IPC_CHANNELS.gitCommit, async (_event, input: GitCommitInput) =>
  gitCommit(await projectPath(input.projectId), input.message)
);

ipcMain.handle(IPC_CHANNELS.gitPush, async (_event, input: GitPushInput) =>
  gitPush(await projectPath(input.projectId))
);

ipcMain.handle(IPC_CHANNELS.gitBranchInfo, async (_event, input: GitSnapshotInput) =>
  gitBranchInfo(await projectPath(input.projectId))
);

ipcMain.handle(IPC_CHANNELS.gitCheckout, async (_event, input: GitCheckoutInput) =>
  gitCheckout(await projectPath(input.projectId), input.branch)
);

ipcMain.handle(IPC_CHANNELS.gitCheckoutNewBranch, async (_event, input: GitCheckoutNewBranchInput) =>
  gitCheckoutNewBranch(await projectPath(input.projectId), input.branch)
);

ipcMain.handle(IPC_CHANNELS.gitCommitSuggestion, async (_event, input: GitCommitSuggestionInput) =>
  gitCommitSuggestion(await projectPath(input.projectId))
);

ipcMain.handle(IPC_CHANNELS.openProjectInEditor, async (_event, input: OpenProjectInput) => {
  const target = await projectPath(input.projectId);
  await openProjectPath(target);
});

ipcMain.handle(IPC_CHANNELS.codexHealth, () => checkCodexHealth());

ipcMain.handle(IPC_CHANNELS.expandPrompt, async (_event, input: ExpandPromptInput) => {
  const state = await store.read();
  const basePrompt = buildStaticPrompt(input, state);
  const project = state.projects.find((item) => item.id === input.projectId);
  if (!project) {
    throw new Error(`Project not found: ${input.projectId}`);
  }

  try {
    const prompt = await runCodexPromptExpansion(basePrompt, project.path, state.settings.codexModel, state.settings.codexReasoningEffort);
    return { prompt, usedCodex: true };
  } catch (error) {
    return {
      prompt: buildPromptFallback(input, state, (error as Error).message),
      usedCodex: false,
      error: (error as Error).message
    };
  }
});
