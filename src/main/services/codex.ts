import { spawn } from 'node:child_process';
import fs from 'node:fs';

const codexCandidates = [
  'codex',
  '/Applications/Codex.app/Contents/Resources/codex',
  '/usr/local/bin/codex',
  '/opt/homebrew/bin/codex'
];

function codexCommand() {
  const absolute = codexCandidates.find((candidate) => candidate.startsWith('/') && fs.existsSync(candidate));
  return absolute || 'codex';
}

function codexEnv() {
  return {
    ...process.env,
    PATH: [
      process.env.PATH,
      '/Applications/Codex.app/Contents/Resources',
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin'
    ]
      .filter(Boolean)
      .join(':'),
    NO_COLOR: '1'
  };
}

function codexModelArgs(model?: string, reasoningEffort?: string) {
  const value = model?.trim();
  const args = value ? ['--model', value] : [];
  const effort = reasoningEffort?.trim();
  if (effort) args.push('-c', `model_reasoning_effort="${effort}"`);
  return args;
}

const CODEX_PROMPT_TIMEOUT_MS = 90_000;

export async function runCodexPromptExpansion(prompt: string, cwd: string, model?: string, reasoningEffort?: string) {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const child = spawn(codexCommand(), ['exec', '--cd', cwd, '--sandbox', 'read-only', '--skip-git-repo-check', ...codexModelArgs(model, reasoningEffort), '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: codexEnv()
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      reject(new Error(`codex prompt expansion timed out after ${Math.round(CODEX_PROMPT_TIMEOUT_MS / 1000)}s`));
    }, CODEX_PROMPT_TIMEOUT_MS);
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0 && stdout.trim()) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(stderr.trim() || `codex exited with code ${code}`));
    });
    child.stdin.end(prompt);
  });
}

export function spawnCodexTask(prompt: string, cwd: string, model?: string, reasoningEffort?: string) {
  const child = spawn(codexCommand(), ['exec', '--cd', cwd, '--sandbox', 'workspace-write', '--skip-git-repo-check', ...codexModelArgs(model, reasoningEffort), '-'], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: codexEnv()
  });
  child.stdin.end(prompt);
  return child;
}

export async function checkCodexHealth() {
  return new Promise<{ ok: boolean; version?: string; error?: string }>((resolve) => {
    const child = spawn(codexCommand(), ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: codexEnv()
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      resolve({ ok: false, error: error.message });
    });
    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        version: stdout.trim(),
        error: code === 0 ? undefined : stderr.trim() || `codex --version exited with code ${code}`
      });
    });
  });
}
