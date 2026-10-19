import { BrowserWindow, Notification } from 'electron';
import type { ChildProcess } from 'node:child_process';
import { runCodexPromptExpansion, spawnCodexTask } from './codex.js';
import { gitApplyReversePatch, gitCreateWorktreeTree, gitDiffBetweenTrees, gitSnapshot } from './git.js';
import { buildExecutorResultSummaryPrompt, buildTaskContinuationPrompt } from './promptBuilder.js';
import { AppStore } from './store.js';
import { IPC_CHANNELS, type AppState, type StartTaskRunInput } from '../../shared/types.js';

const maxRunPatchChars = 10_000_000;

export class RunManager {
  private readonly processes = new Map<string, ChildProcess>();
  private readonly appendQueues = new Map<string, Promise<void>>();
  private readonly outputBuffers = new Map<string, string>();
  private readonly flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly store: AppStore) {}

  async start(input: StartTaskRunInput) {
    const state = await this.store.read();
    const task = state.tasks.find((item) => item.id === input.taskId);
    if (!task) {
      throw new Error(`Task not found: ${input.taskId}`);
    }
    const project = state.projects.find((item) => item.id === task.projectId);
    if (!project) {
      throw new Error(`Project not found: ${task.projectId}`);
    }

    const model = state.settings.codexModel?.trim();
    const reasoningEffort = state.settings.codexReasoningEffort || 'medium';
    const command = [
      'codex exec',
      `--cd ${JSON.stringify(project.path)}`,
      '--sandbox workspace-write',
      '--skip-git-repo-check',
      model ? `--model ${JSON.stringify(model)}` : '',
      reasoningEffort ? `-c model_reasoning_effort=${JSON.stringify(reasoningEffort)}` : '',
      '-'
    ].filter(Boolean).join(' ');
    let baselineGitStatus = 'Git status unavailable.';
    let baselineGitDiff = 'Git diff unavailable.';
    let baselineGitTree: string | undefined;
    try {
      const baselineSnapshot = await gitSnapshot(project.path);
      baselineGitStatus = baselineSnapshot.status;
      baselineGitDiff = baselineSnapshot.diff;
      baselineGitTree = await gitCreateWorktreeTree(project.path);
    } catch (error) {
      baselineGitStatus = error instanceof Error ? error.message : String(error);
    }
    const { state: startedState, run } = await this.store.startRun(input, command, {
      gitStatus: baselineGitStatus,
      gitDiff: baselineGitDiff,
      gitTree: baselineGitTree
    });
    this.broadcast(startedState, run.id);

    const taskRuns = state.runs.filter((item) => item.taskId === task.id);
    const latestRun = taskRuns[0];
    let prompt = task.executionPrompt;
    if (input.feedback?.trim()) {
      let gitStatus = 'Git status unavailable.';
      let gitDiff = 'Git diff unavailable.';
      try {
        const snapshot = await gitSnapshot(project.path);
        gitStatus = snapshot.status;
        gitDiff = snapshot.diff;
      } catch (error) {
        gitStatus = error instanceof Error ? error.message : String(error);
      }
      prompt = buildTaskContinuationPrompt({
        task,
        state,
        latestRun,
        taskRuns,
        feedback: input.feedback,
        gitStatus,
        gitDiff
      });
    }

    const child = spawnCodexTask(prompt, project.path, model, reasoningEffort);
    this.processes.set(run.id, child);

    child.stdout.on('data', (chunk) => this.bufferOutput(run.id, chunk.toString()));
    child.stderr.on('data', (chunk) => this.bufferOutput(run.id, chunk.toString()));
    child.on('error', async (error) => {
      this.processes.delete(run.id);
      await this.waitForPendingAppends(run.id);
      const nextState = await this.store.finishRun(run.id, { error: error.message });
      this.broadcast(nextState, run.id);
      this.notifyWhenInactive(nextState, run.id);
    });
    child.on('close', async (code, signal) => {
      this.processes.delete(run.id);
      await this.waitForPendingAppends(run.id);
      const cancelled = signal === 'SIGTERM' || signal === 'SIGKILL';
      const nextState = await this.store.finishRun(run.id, {
        exitCode: code ?? undefined,
        cancelled,
        error: cancelled ? 'Run cancelled by user.' : code === 0 ? undefined : `codex exited with code ${code}`
      });
      this.broadcast(nextState, run.id);
      if (!cancelled) void this.finishRunFollowups(run.id, { summarize: !input.feedback?.trim() });
      if (!cancelled) this.notifyWhenInactive(nextState, run.id);
    });

    return startedState;
  }

  async cancel(runId: string) {
    const child = this.processes.get(runId);
    if (child) {
      child.kill('SIGTERM');
      return this.store.read();
    }
    const nextState = await this.store.cancelRun({ runId });
    this.broadcast(nextState, runId);
    return nextState;
  }

  async undo(runId: string) {
    const state = await this.store.read();
    const run = state.runs.find((item) => item.id === runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    if (run.status === 'running') {
      throw new Error('Cannot undo a running task.');
    }
    if (run.undoneAt) {
      throw new Error('This run has already been undone.');
    }
    if (!run.changePatch?.trim()) {
      throw new Error(run.changePatchError || 'This run does not have a safe undo patch.');
    }
    const project = state.projects.find((item) => item.id === run.projectId);
    if (!project) {
      throw new Error(`Project not found: ${run.projectId}`);
    }

    try {
      await gitApplyReversePatch(project.path, run.changePatch);
      const nextState = await this.store.markRunUndone(runId);
      this.broadcast(nextState, runId);
      return nextState;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const nextState = await this.store.markRunUndoFailed(runId, message);
      this.broadcast(nextState, runId);
      throw error;
    }
  }

  private async append(runId: string, output: string) {
    if (!output) return;
    const previous = this.appendQueues.get(runId) || Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      const nextState = await this.store.appendRunOutput(runId, output);
      this.broadcast(nextState, runId);
    });
    this.appendQueues.set(runId, next);
    try {
      await next;
    } finally {
      if (this.appendQueues.get(runId) === next) {
        this.appendQueues.delete(runId);
      }
    }
  }

  private async waitForPendingAppends(runId: string) {
    await this.flushRunOutput(runId);
    const pending = this.appendQueues.get(runId);
    if (pending) await pending.catch(() => undefined);
  }

  private bufferOutput(runId: string, output: string) {
    const nextOutput = `${this.outputBuffers.get(runId) || ''}${output}`;
    this.outputBuffers.set(runId, nextOutput);
    if (nextOutput.length >= 16_000) {
      void this.flushRunOutput(runId);
      return;
    }
    if (this.flushTimers.has(runId)) return;
    const timer = setTimeout(() => {
      this.flushTimers.delete(runId);
      void this.flushRunOutput(runId);
    }, 300);
    this.flushTimers.set(runId, timer);
  }

  private async flushRunOutput(runId: string) {
    const timer = this.flushTimers.get(runId);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(runId);
    }
    const output = this.outputBuffers.get(runId);
    if (!output) return;
    this.outputBuffers.delete(runId);
    await this.append(runId, output);
  }

  private async generateResultSummary(runId: string) {
    const state = await this.store.read();
    const run = state.runs.find((item) => item.id === runId);
    if (!run) return;
    const task = state.tasks.find((item) => item.id === run.taskId);
    const project = state.projects.find((item) => item.id === run.projectId);
    if (!task || !project) return;

    let gitStatus = 'Git status unavailable.';
    let gitDiff = 'Git diff unavailable.';
    try {
      const snapshot = await gitSnapshot(project.path);
      gitStatus = snapshot.status;
      gitDiff = snapshot.diff;
    } catch (error) {
      gitStatus = error instanceof Error ? error.message : String(error);
    }

    try {
      const prompt = buildExecutorResultSummaryPrompt({
        task,
        state,
        run,
        baselineGitStatus: run.baselineGitStatus || '无执行前 Git 状态记录。',
        baselineGitDiff: run.baselineGitDiff || '无执行前 Git Diff 记录。',
        gitStatus,
        gitDiff
      });
      const summary = await runCodexPromptExpansion(
        prompt,
        project.path,
        state.settings.codexModel?.trim(),
        state.settings.codexReasoningEffort || 'medium'
      );
      const nextState = await this.store.updateRunSummary(runId, { summary });
      this.broadcast(nextState, runId);
    } catch (error) {
      const nextState = await this.store.updateRunSummary(runId, {
        summaryError: error instanceof Error ? error.message : String(error)
      });
      this.broadcast(nextState, runId);
    }
  }

  private async finishRunFollowups(runId: string, options: { summarize: boolean }) {
    await this.captureUndoPatch(runId);
    if (options.summarize) {
      await this.generateResultSummary(runId);
    }
  }

  private async captureUndoPatch(runId: string) {
    const state = await this.store.read();
    const run = state.runs.find((item) => item.id === runId);
    if (!run) return;
    const project = state.projects.find((item) => item.id === run.projectId);
    if (!project) return;

    if (!run.baselineGitTree) {
      const nextState = await this.store.updateRunPatch(runId, {
        changePatchError: '执行前没有成功保存 Git 工作区快照，无法生成本次撤销补丁。'
      });
      this.broadcast(nextState, runId);
      return;
    }

    try {
      const afterTree = await gitCreateWorktreeTree(project.path);
      const patch = await gitDiffBetweenTrees(project.path, run.baselineGitTree, afterTree);
      if (!patch.trim()) {
        const nextState = await this.store.updateRunPatch(runId, {
          changePatchError: '本次执行没有产生可撤销的未提交改动。'
        });
        this.broadcast(nextState, runId);
        return;
      }
      if (patch.length > maxRunPatchChars) {
        const nextState = await this.store.updateRunPatch(runId, {
          changePatchError: `本次改动补丁超过 ${Math.round(maxRunPatchChars / 1024 / 1024)}MB，未保存自动撤销补丁。`
        });
        this.broadcast(nextState, runId);
        return;
      }
      const nextState = await this.store.updateRunPatch(runId, { changePatch: patch });
      this.broadcast(nextState, runId);
    } catch (error) {
      const nextState = await this.store.updateRunPatch(runId, {
        changePatchError: error instanceof Error ? error.message : String(error)
      });
      this.broadcast(nextState, runId);
    }
  }

  private broadcast(state: AppState, runId: string) {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC_CHANNELS.runUpdate, { state, runId });
    }
  }

  private notifyWhenInactive(state: AppState, runId: string) {
    if (!state.settings.systemNotificationEnabled || !Notification.isSupported() || BrowserWindow.getFocusedWindow()) return;

    const run = state.runs.find((item) => item.id === runId);
    if (!run) return;
    const task = state.tasks.find((item) => item.id === run.taskId);
    const project = state.projects.find((item) => item.id === run.projectId);
    if (!task || !project) return;

    const notification = new Notification({
      title: `Codex 执行完成 · ${project.name}`,
      body: `${task.title}\n状态：${run.status}`
    });

    notification.on('click', () => {
      const targetWindow = BrowserWindow.getAllWindows()[0];
      if (!targetWindow) return;
      if (targetWindow.isMinimized()) targetWindow.restore();
      targetWindow.show();
      targetWindow.focus();
      targetWindow.webContents.send(IPC_CHANNELS.runOpen, {
        runId: run.id,
        taskId: task.id,
        projectId: project.id
      });
    });

    notification.show();
  }
}
