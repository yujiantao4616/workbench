import fs from 'node:fs/promises';
import path from 'node:path';
import type { ProjectSummary } from '../../shared/types.js';

const DEFAULT_IGNORES = new Set([
  '.git',
  'node_modules',
  '_next',
  '.next',
  'dist',
  'build',
  '.turbo',
  'coverage',
  'release',
  '.cache'
]);

const DOCUMENT_PATTERNS = [
  /^readme/i,
  /^agents\.md$/i,
  /contributing/i,
  /issues/i,
  /migration/i,
  /setup/i,
  /env/i,
  /architecture/i,
  /overview/i
];

interface PackageJsonShape {
  name?: string;
  packageManager?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function listTopLevelDirectories(projectPath: string) {
  const entries = await fs.readdir(projectPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !DEFAULT_IGNORES.has(entry.name))
    .map((entry) => entry.name)
    .slice(0, 24);
}

async function collectDocumentFiles(projectPath: string, maxDepth = 3) {
  const results: string[] = [];

  async function walk(currentPath: string, depth: number) {
    if (depth > maxDepth || results.length >= 32) {
      return;
    }

    const entries = await fs.readdir(currentPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith('.env')) {
        continue;
      }
      if (entry.isDirectory()) {
        if (!DEFAULT_IGNORES.has(entry.name)) {
          await walk(path.join(currentPath, entry.name), depth + 1);
        }
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) {
        continue;
      }
      if (DOCUMENT_PATTERNS.some((pattern) => pattern.test(entry.name))) {
        results.push(path.relative(projectPath, path.join(currentPath, entry.name)));
      }
    }
  }

  await walk(projectPath, 0);
  return results;
}

function detectStack(packageJson: PackageJsonShape | null, files: Set<string>, directories: string[]) {
  const deps = {
    ...packageJson?.dependencies,
    ...packageJson?.devDependencies
  };
  const stack = new Set<string>();

  if (deps.next || files.has('next.config.js') || files.has('next.config.mjs') || files.has('next.config.ts')) {
    stack.add('Next.js');
  }
  if (deps.vite || files.has('vite.config.ts') || files.has('vite.config.js')) {
    stack.add('Vite');
  }
  if (deps.react || deps['react-dom']) {
    stack.add('React');
  }
  if (deps.antd || deps['@ant-design/icons']) {
    stack.add('Ant Design');
  }
  if (deps.tailwindcss || files.has('tailwind.config.js') || files.has('tailwind.config.ts')) {
    stack.add('Tailwind CSS');
  }
  if (deps.electron || deps['electron-builder']) {
    stack.add('Electron');
  }
  if (deps.umi || deps['@umijs/preset-react']) {
    stack.add('Umi');
  }
  if (deps.turbo || files.has('turbo.json') || directories.includes('apps') || directories.includes('packages')) {
    stack.add('Monorepo/Turbo');
  }
  if (deps.typescript || files.has('tsconfig.json')) {
    stack.add('TypeScript');
  }

  return Array.from(stack);
}

function detectPackageManager(packageJson: PackageJsonShape | null, files: Set<string>) {
  if (packageJson?.packageManager) {
    return packageJson.packageManager;
  }
  if (files.has('pnpm-lock.yaml')) {
    return 'pnpm';
  }
  if (files.has('yarn.lock')) {
    return 'yarn';
  }
  if (files.has('package-lock.json')) {
    return 'npm';
  }
  return undefined;
}

function buildNotes(projectPath: string, packageJson: PackageJsonShape | null, directories: string[], docs: string[]) {
  const notes: string[] = [];
  if (packageJson?.name) {
    notes.push(`package name: ${packageJson.name}`);
  }
  if (docs.length > 0) {
    notes.push(`documentation discovered: ${docs.slice(0, 8).join(', ')}`);
  }
  if (directories.includes('pages')) {
    notes.push('pages directory suggests page-router style routing.');
  }
  if (directories.includes('app')) {
    notes.push('app directory suggests app-router or application shell code.');
  }
  if (directories.includes('components')) {
    notes.push('components directory is likely important for shared UI changes.');
  }
  if (directories.includes('common')) {
    notes.push('common directory is likely important for shared utilities and business logic.');
  }
  notes.push(`root: ${projectPath}`);
  return notes;
}

export async function scanProject(projectPath: string): Promise<ProjectSummary> {
  const entries = await fs.readdir(projectPath).catch(() => {
    throw new Error(`Cannot read project directory: ${projectPath}`);
  });
  const files = new Set(entries);
  const packageJson = await readJson<PackageJsonShape>(path.join(projectPath, 'package.json'));
  const directories = await listTopLevelDirectories(projectPath);
  const docs = await collectDocumentFiles(projectPath);

  const importantDirectories = directories.filter((directory) =>
    ['src', 'app', 'pages', 'components', 'common', 'server', 'config', 'packages', 'apps', 'docs', 'styles'].includes(directory)
  );

  if (await pathExists(path.join(projectPath, 'AGENTS.md')) && !docs.includes('AGENTS.md')) {
    docs.unshift('AGENTS.md');
  }

  return {
    detectedStack: detectStack(packageJson, files, directories),
    packageManager: detectPackageManager(packageJson, files),
    scripts: packageJson?.scripts ?? {},
    documentFiles: docs,
    importantDirectories,
    notes: buildNotes(projectPath, packageJson, directories, docs),
    generatedAt: new Date().toISOString()
  };
}
