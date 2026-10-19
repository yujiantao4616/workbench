import { api } from '../lib/api';
import type { GitBranchInfoResult, ProjectRecord } from '../../shared/types';

type RunBusy = <T>(label: string, action: () => Promise<T>) => Promise<T>;

export function useGitActions({
  runBusy,
  selectedProject,
  setGitBranchInfo
}: {
  runBusy: RunBusy;
  selectedProject?: ProjectRecord;
  setGitBranchInfo: (info: GitBranchInfoResult | undefined) => void;
}) {
  async function refreshGitState() {
    if (!selectedProject) return;
    await runBusy('Refreshing git branch', async () => {
      const result = await api.gitBranchInfo({ projectId: selectedProject.id });
      setGitBranchInfo(result);
    });
  }

  async function commitGitChanges(message: string) {
    if (!selectedProject) return;
    await runBusy('Committing changes', async () => {
      await api.gitCommit({ projectId: selectedProject.id, message });
      const result = await api.gitBranchInfo({ projectId: selectedProject.id });
      setGitBranchInfo(result);
    });
  }

  async function pushGitChanges() {
    if (!selectedProject) return;
    await runBusy('Pushing changes', async () => {
      await api.gitPush({ projectId: selectedProject.id });
      const result = await api.gitBranchInfo({ projectId: selectedProject.id });
      setGitBranchInfo(result);
    });
  }

  async function checkoutGitBranch(branch: string) {
    if (!selectedProject) return;
    await runBusy('Checking out branch', async () => {
      const result = await api.gitCheckout({ projectId: selectedProject.id, branch });
      setGitBranchInfo(result);
    });
  }

  async function checkoutNewGitBranch(branch: string) {
    if (!selectedProject) return;
    await runBusy('Creating branch', async () => {
      const result = await api.gitCheckoutNewBranch({ projectId: selectedProject.id, branch });
      setGitBranchInfo(result);
    });
  }

  async function generateCommitMessage() {
    if (!selectedProject) return undefined;
    return runBusy('Generating commit message', async () => {
      const result = await api.gitCommitSuggestion({ projectId: selectedProject.id });
      return result.message;
    });
  }

  async function openProjectInEditor() {
    if (!selectedProject) return;
    await runBusy('Opening project', async () => {
      await api.openProjectInEditor({ projectId: selectedProject.id });
    });
  }

  return {
    refreshGitState,
    commitGitChanges,
    pushGitChanges,
    checkoutGitBranch,
    checkoutNewGitBranch,
    generateCommitMessage,
    openProjectInEditor
  };
}
