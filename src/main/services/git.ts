import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { GitBranchInfoResult, GitCommitSuggestionResult, GitSnapshotResult } from '../../shared/types.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[], env?: NodeJS.ProcessEnv) {
  const { stdout, stderr } = await execFileAsync('git', ['-C', cwd, ...args], {
    env: env ? { ...process.env, ...env } : process.env,
    maxBuffer: 1024 * 1024 * 32
  });
  return `${stdout}${stderr}`.trim();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function gitSnapshot(projectPath: string): Promise<GitSnapshotResult> {
  const [status, diff] = await Promise.all([
    git(projectPath, ['status', '--short']),
    git(projectPath, ['diff', '--', '.'])
  ]);
  return {
    status: status || 'Working tree clean.',
    diff: diff || 'No unstaged diff.'
  };
}

export async function gitCreateWorktreeTree(projectPath: string) {
  const indexPath = path.join(os.tmpdir(), `codex-workbench-index-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const env = { GIT_INDEX_FILE: indexPath };
  try {
    await git(projectPath, ['read-tree', '--empty'], env);
    await git(projectPath, ['add', '-A', '--', '.'], env);
    return git(projectPath, ['write-tree'], env);
  } finally {
    await fs.rm(indexPath, { force: true });
  }
}

export async function gitDiffBetweenTrees(projectPath: string, beforeTree: string, afterTree: string) {
  if (!beforeTree.trim() || !afterTree.trim()) {
    throw new Error('Both before and after tree snapshots are required.');
  }
  return git(projectPath, ['diff', '--binary', beforeTree, afterTree, '--', '.']);
}

export async function gitApplyReversePatch(projectPath: string, patch: string): Promise<GitSnapshotResult> {
  if (!patch.trim()) {
    throw new Error('No patch is available for this run.');
  }

  const patchPath = path.join(os.tmpdir(), `codex-workbench-undo-${Date.now()}-${Math.random().toString(16).slice(2)}.patch`);
  await fs.writeFile(patchPath, patch, 'utf8');
  try {
    await git(projectPath, ['apply', '--check', '-R', patchPath]);
    await git(projectPath, ['apply', '-R', patchPath]);
    return gitSnapshot(projectPath);
  } catch (error) {
    throw new Error(`Cannot safely undo this run: ${errorMessage(error)}`);
  } finally {
    await fs.rm(patchPath, { force: true });
  }
}

export async function gitBranchInfo(projectPath: string): Promise<GitBranchInfoResult> {
  try {
    await git(projectPath, ['rev-parse', '--show-toplevel']);
    const [currentBranch, branchesRaw, status] = await Promise.all([
      git(projectPath, ['branch', '--show-current']),
      git(projectPath, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']),
      git(projectPath, ['status', '--short'])
    ]);
    return {
      currentBranch: currentBranch || 'HEAD',
      branches: branchesRaw.split('\n').map((branch) => branch.trim()).filter(Boolean),
      isDirty: Boolean(status.trim())
    };
  } catch (error) {
    return {
      currentBranch: 'Unavailable',
      branches: [],
      isDirty: false,
      error: errorMessage(error)
    };
  }
}

export async function gitCheckout(projectPath: string, branch: string): Promise<GitBranchInfoResult> {
  const info = await gitBranchInfo(projectPath);
  if (info.error) {
    throw new Error(info.error);
  }
  if (info.isDirty) {
    throw new Error('Working tree has uncommitted changes. Commit, stash, or discard changes before checkout.');
  }
  if (!info.branches.includes(branch)) {
    throw new Error(`Branch is not available locally: ${branch}`);
  }
  await git(projectPath, ['checkout', branch]);
  return gitBranchInfo(projectPath);
}

export async function gitCheckoutNewBranch(projectPath: string, branch: string): Promise<GitBranchInfoResult> {
  const trimmedBranch = branch.trim();
  if (!trimmedBranch) {
    throw new Error('Branch name is required.');
  }

  const info = await gitBranchInfo(projectPath);
  if (info.error) {
    throw new Error(info.error);
  }
  if (info.isDirty) {
    throw new Error('Working tree has uncommitted changes. Commit, stash, or discard changes before creating a branch.');
  }
  if (info.branches.includes(trimmedBranch)) {
    throw new Error(`Branch already exists locally: ${trimmedBranch}`);
  }

  await git(projectPath, ['check-ref-format', '--branch', trimmedBranch]);
  await git(projectPath, ['checkout', '-b', trimmedBranch]);
  return gitBranchInfo(projectPath);
}

export async function gitCommitSuggestion(projectPath: string): Promise<GitCommitSuggestionResult> {
  const status = await git(projectPath, ['status', '--short']);
  const changes = status
    .split('\n')
    .map(parseStatusLine)
    .filter((change): change is GitChange => Boolean(change));
  if (changes.length === 0) {
    return { message: 'chore: no local changes' };
  }

  const [unstagedDiff, stagedDiff] = await Promise.all([
    git(projectPath, ['diff', '--', '.']),
    git(projectPath, ['diff', '--cached', '--', '.'])
  ]);
  const diff = `${stagedDiff}\n${unstagedDiff}`;

  return {
    message: buildCommitSuggestion(changes, diff)
  };
}

type GitChange = {
  code: string;
  file: string;
};

function parseStatusLine(line: string): GitChange | undefined {
  if (!line.trim()) return undefined;
  const code = line.slice(0, 2);
  const rawPath = line.slice(3).trim();
  if (!rawPath) return undefined;
  const file = rawPath.includes(' -> ') ? rawPath.split(' -> ').pop()?.trim() : rawPath;
  if (!file) return undefined;
  return {
    code,
    file: file.replace(/^"|"$/g, '')
  };
}

function buildCommitSuggestion(changes: GitChange[], diff: string) {
  const files = changes.map((change) => change.file);
  const lowerFiles = files.join('\n').toLowerCase();
  const lowerDiff = diff.slice(0, 120000).toLowerCase();
  const lowerAll = `${lowerFiles}\n${lowerDiff}`;
  const type = inferCommitType(changes, lowerAll);
  const verb = inferCommitVerb(type, changes, lowerAll);
  const scope = inferCommitScope(files, lowerAll);
  return truncateCommitMessage(`${type}: ${verb} ${scope}`);
}

function inferCommitType(changes: GitChange[], lowerAll: string) {
  const files = changes.map((change) => change.file.toLowerCase());
  if (files.every((file) => /\.(md|mdx|txt|rst)$/.test(file) || file.includes('/docs/'))) return 'docs';
  if (files.every((file) => /\.(test|spec)\./.test(file) || file.includes('__tests__') || file.includes('/test'))) return 'test';
  if (files.every((file) => /\.(css|scss|sass|less)$/.test(file))) return 'style';
  if (files.every((file) => isConfigOrDependencyFile(file))) return 'chore';
  if (/(fix|bug|error|failed|failure|invalid|fallback|empty|wrong|broken|crash|exception|修复|错误|失败|异常)/i.test(lowerAll)) {
    return 'fix';
  }
  if (changes.some((change) => change.code.includes('A'))) return 'feat';
  if (/(add|create|new|support|enable|新增|添加|支持)/i.test(lowerAll)) return 'feat';
  return 'chore';
}

function isConfigOrDependencyFile(file: string) {
  return (
    /(^|\/)(package-lock|pnpm-lock|yarn.lock|bun.lockb|package)\.json$/.test(file) ||
    /(^|\/)(tsconfig|vite\.config|electron\.vite|tailwind\.config|postcss\.config|eslint\.config|prettier\.config)/.test(file) ||
    /\.(config|rc)\.(js|ts|cjs|mjs|json)$/.test(file)
  );
}

function inferCommitVerb(type: string, changes: GitChange[], lowerAll: string) {
  if (changes.every((change) => change.code.includes('D'))) return 'remove';
  if (type === 'fix') return 'fix';
  if (changes.every((change) => change.code.includes('A')) || /(add|create|new|新增|添加)/i.test(lowerAll)) return 'add';
  if (type === 'docs' || type === 'test' || type === 'style') return 'update';
  if (/(refactor|rename|move|extract|split|重构|拆分)/i.test(lowerAll)) return 'refactor';
  return 'update';
}

function inferCommitScope(files: string[], lowerAll: string) {
  const knownScopes = [
    { phrase: 'git commit message generation', patterns: ['gitcommitsuggestion', 'git:commit-suggestion', 'commit message', 'commit suggestion'] },
    { phrase: 'tapd defects import', patterns: ['tapd', 'defect'] },
    { phrase: 'executor review flow', patterns: ['executormodule', 'executor', 'task-run'] },
    { phrase: 'prompt expansion flow', patterns: ['promptmodule', 'expandprompt', 'expanded prompt'] },
    { phrase: 'work calendar', patterns: ['kanbanmodule', 'workitem', 'work calendar', 'calendar'] },
    { phrase: 'settings page', patterns: ['settingsmodule', 'settings page', 'theme color'] },
    { phrase: 'project sidebar', patterns: ['sidebar', 'project list'] },
    { phrase: 'weekly report', patterns: ['weeklyreport', 'weekly report'] },
    { phrase: 'theme tokens', patterns: ['theme', 'material', 'color scheme'] }
  ];
  const matched = knownScopes.find((scope) => scope.patterns.some((pattern) => lowerAll.includes(pattern)));
  if (matched) return matched.phrase;

  const tokens = files.flatMap(fileTokens).filter((token) => !genericFileTokens.has(token));
  const uniqueTokens = [...new Set(tokens)];
  if (uniqueTokens.length === 0) {
    return files.length === 1 ? fileNameWithoutExtension(files[0]) : `${files.length} files`;
  }

  const scopeTokens = uniqueTokens.slice(0, 3);
  return scopeTokens.join(' and ');
}

function fileTokens(file: string) {
  const parts = file
    .split('/')
    .flatMap((part) => fileNameWithoutExtension(part).split(/[-_\s.]+/))
    .flatMap(splitCamelCase)
    .map((part) => part.toLowerCase())
    .filter((part) => part.length > 2);
  return parts;
}

function fileNameWithoutExtension(file: string) {
  return file.split('/').pop()?.replace(/\.[^.]+$/, '') || file;
}

function splitCamelCase(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/\s+/);
}

const genericFileTokens = new Set([
  'src',
  'main',
  'renderer',
  'shared',
  'components',
  'component',
  'modules',
  'module',
  'hooks',
  'hook',
  'lib',
  'utils',
  'types',
  'type',
  'index',
  'app',
  'page',
  'pages',
  'service',
  'services'
]);

function truncateCommitMessage(message: string) {
  if (message.length <= 72) return message;
  return `${message.slice(0, 69).trimEnd()}...`;
}

export async function gitCommit(projectPath: string, message: string): Promise<GitSnapshotResult> {
  await git(projectPath, ['add', '--all']);
  await git(projectPath, ['commit', '-m', message]);
  return gitSnapshot(projectPath);
}

export async function gitPush(projectPath: string): Promise<GitSnapshotResult> {
  await git(projectPath, ['push']);
  return gitSnapshot(projectPath);
}
