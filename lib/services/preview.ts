/**
 * PreviewManager - Handles per-project development servers (live preview)
 */

import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { findAvailablePort } from '@/lib/utils/ports';
import { getProjectById, updateProject, updateProjectStatus } from './project';
import { scaffoldBasicNextApp, scaffoldStaticHtmlApp, scaffoldFlaskApp } from '@/lib/utils/scaffold';
import { PREVIEW_CONFIG } from '@/lib/config/constants';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const yarnCommand = process.platform === 'win32' ? 'yarn.cmd' : 'yarn';
const bunCommand = process.platform === 'win32' ? 'bun.exe' : 'bun';

// Piper command options - try specific binaries first, then module execution
const pipOptions = process.platform === 'win32' 
  ? [{ cmd: 'pip', args: [] }, { cmd: 'python', args: ['-m', 'pip'] }]
  : [
      { cmd: 'pip3', args: [] }, 
      { cmd: 'pip', args: [] }, 
      { cmd: 'python3', args: ['-m', 'pip'] }, 
      { cmd: 'python', args: ['-m', 'pip'] }
    ];

type PackageManagerId = 'npm' | 'pnpm' | 'yarn' | 'bun';

const PACKAGE_MANAGER_COMMANDS: Record<
  PackageManagerId,
  { command: string; installArgs: string[] }
> = {
  npm: { command: npmCommand, installArgs: ['install'] },
  pnpm: { command: pnpmCommand, installArgs: ['install'] },
  yarn: { command: yarnCommand, installArgs: ['install'] },
  bun: { command: bunCommand, installArgs: ['install'] },
};

const LOG_LIMIT = PREVIEW_CONFIG.LOG_LIMIT;
const PREVIEW_FALLBACK_PORT_START = PREVIEW_CONFIG.FALLBACK_PORT_START;
const PREVIEW_FALLBACK_PORT_END = PREVIEW_CONFIG.FALLBACK_PORT_END;
const PREVIEW_MAX_PORT = 65_535;
const ROOT_ALLOWED_FILES = new Set([
  '.DS_Store',
  '.editorconfig',
  '.env',
  '.env.development',
  '.env.local',
  '.env.production',
  '.eslintignore',
  '.eslintrc',
  '.eslintrc.cjs',
  '.eslintrc.js',
  '.eslintrc.json',
  '.gitignore',
  '.npmrc',
  '.nvmrc',
  '.prettierignore',
  '.prettierrc',
  '.prettierrc.cjs',
  '.prettierrc.js',
  '.prettierrc.json',
  '.prettierrc.yaml',
  '.prettierrc.yml',
  'LICENSE',
  'README',
  'README.md',
  'package-lock.json',
  'pnpm-lock.yaml',
  'poetry.lock',
  'requirements.txt',
  'yarn.lock',
]);
const ROOT_ALLOWED_DIR_PREFIXES = ['.'];
const ROOT_ALLOWED_DIRS = new Set([
  '.git',
  '.idea',
  '.vscode',
  '.github',
  '.husky',
  '.pnpm-store',
  '.turbo',
  '.next',
  'node_modules',
]);
const ROOT_OVERWRITABLE_FILES = new Set([
  '.gitignore',
  '.eslintignore',
  '.env',
  '.env.development',
  '.env.local',
  '.env.production',
  '.npmrc',
  '.nvmrc',
  '.prettierignore',
  'README',
  'README.md',
  'README.txt',
]);

type PreviewStatus = 'starting' | 'running' | 'stopped' | 'error';

interface PreviewProcess {
  process: ChildProcess | null;
  port: number;
  url: string;
  status: PreviewStatus;
  logs: string[];
  startedAt: Date;
}

interface EnvOverrides {
  port?: number;
  url?: string;
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, '').trim();
}

function getLocalIpAddress(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

function parsePort(value?: string): number | null {
  if (!value) return null;
  const numeric = Number.parseInt(stripQuotes(value), 10);
  if (Number.isFinite(numeric) && numeric > 0 && numeric <= 65535) {
    return numeric;
  }
  return null;
}

async function readPackageJson(
  projectPath: string
): Promise<Record<string, any> | null> {
  try {
    const raw = await fs.readFile(path.join(projectPath, 'package.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function collectEnvOverrides(projectPath: string): Promise<EnvOverrides> {
  const overrides: EnvOverrides = {};
  const files = ['.env.local', '.env'];

  for (const fileName of files) {
    const filePath = path.join(projectPath, fileName);
    try {
      const contents = await fs.readFile(filePath, 'utf8');
      const lines = contents.split(/\r?\n/);
      let candidateUrl: string | null = null;

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#') || !line.includes('=')) {
          continue;
        }

        const [rawKey, ...rawValueParts] = line.split('=');
        const key = rawKey.trim();
        const rawValue = rawValueParts.join('=');
        const value = stripQuotes(rawValue);

        if (!overrides.port && (key === 'PORT' || key === 'WEB_PORT')) {
          const parsed = parsePort(value);
          if (parsed) {
            overrides.port = parsed;
          }
        }

        if (!overrides.url && key === 'NEXT_PUBLIC_APP_URL' && value) {
          candidateUrl = value;
        }
      }

      if (!overrides.url && candidateUrl) {
        overrides.url = candidateUrl;
      }

      if (!overrides.port && overrides.url) {
        try {
          const parsedUrl = new URL(overrides.url);
          if (parsedUrl.port) {
            const parsedPort = parsePort(parsedUrl.port);
            if (parsedPort) {
              overrides.port = parsedPort;
            }
          }
        } catch {
          // Ignore invalid URL formats
        }
      }

      if (overrides.port && overrides.url) {
        break;
      }
    } catch {
      // Missing env file is fine; skip
    }
  }

  return overrides;
}

function resolvePreviewBounds(): { start: number; end: number } {
  const envStartRaw = Number.parseInt(process.env.PREVIEW_PORT_START || '', 10);
  const envEndRaw = Number.parseInt(process.env.PREVIEW_PORT_END || '', 10);

  const start = Number.isInteger(envStartRaw)
    ? Math.max(1, envStartRaw)
    : PREVIEW_FALLBACK_PORT_START;

  let end = Number.isInteger(envEndRaw)
    ? Math.min(PREVIEW_MAX_PORT, envEndRaw)
    : PREVIEW_FALLBACK_PORT_END;

  if (end < start) {
    end = Math.min(start + (PREVIEW_FALLBACK_PORT_END - PREVIEW_FALLBACK_PORT_START), PREVIEW_MAX_PORT);
  }

  return { start, end };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function directoryExists(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function parsePackageManagerField(value: unknown): PackageManagerId | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  const [rawName] = value.split('@');
  const name = rawName.trim().toLowerCase();
  if (name === 'npm' || name === 'pnpm' || name === 'yarn' || name === 'bun') {
    return name as PackageManagerId;
  }
  return null;
}

function isCommandNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const err = error as NodeJS.ErrnoException;
  return err.code === 'ENOENT';
}

async function detectPackageManager(projectPath: string): Promise<PackageManagerId> {
  const packageJson = await readPackageJson(projectPath);
  const fromField = parsePackageManagerField(packageJson?.packageManager);
  if (fromField) {
    return fromField;
  }

  if (await fileExists(path.join(projectPath, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (await fileExists(path.join(projectPath, 'yarn.lock'))) {
    return 'yarn';
  }
  if (await fileExists(path.join(projectPath, 'bun.lockb'))) {
    return 'bun';
  }
  if (await fileExists(path.join(projectPath, 'package-lock.json'))) {
    return 'npm';
  }
  return 'npm';
}

async function runInstallWithPreferredManager(
  projectPath: string,
  env: NodeJS.ProcessEnv,
  logger: (chunk: Buffer | string) => void
): Promise<void> {
  const manager = await detectPackageManager(projectPath);
  const { command, installArgs } = PACKAGE_MANAGER_COMMANDS[manager];

  logger(`[PreviewManager] Installing dependencies using ${manager}.`);
  try {
    await appendCommandLogs(command, installArgs, projectPath, env, logger);
  } catch (error) {
    if (manager !== 'npm' && isCommandNotFound(error)) {
      logger(
        `[PreviewManager] ${command} unavailable. Falling back to npm install.`
      );
      await appendCommandLogs(
        PACKAGE_MANAGER_COMMANDS.npm.command,
        PACKAGE_MANAGER_COMMANDS.npm.installArgs,
        projectPath,
        env,
        logger
      );
      return;
    }
    throw error;
  }
}

async function isLikelyProjectRoot(dirPath: string): Promise<boolean> {
  // Check for index.html (Static HTML projects)
  if (await fileExists(path.join(dirPath, 'index.html'))) {
    return true;
  }

  const pkgPath = path.join(dirPath, 'package.json');
  try {
    const pkgRaw = await fs.readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(pkgRaw);
    const deps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    };
    if (typeof deps.next === 'string') {
      return true;
    }
    if (pkg.scripts && typeof pkg.scripts === 'object') {
      const scriptValues = Object.values(pkg.scripts as Record<string, unknown>);
      if (
        scriptValues.some(
          (value) =>
            typeof value === 'string' &&
            (value.includes('next dev') || value.includes('next start'))
        )
      ) {
        return true;
      }
    }
  } catch {
    // ignore
  }

  const configCandidates = [
    'next.config.js',
    'next.config.cjs',
    'next.config.mjs',
    'next.config.ts',
  ];
  for (const candidate of configCandidates) {
    if (await fileExists(path.join(dirPath, candidate))) {
      return true;
    }
  }

  const appDirCandidates = [
    'app',
    path.join('src', 'app'),
    'pages',
    path.join('src', 'pages'),
  ];
  for (const candidate of appDirCandidates) {
    if (await directoryExists(path.join(dirPath, candidate))) {
      return true;
    }
  }

  return false;
}

function isAllowedRootFile(name: string): boolean {
  if (ROOT_ALLOWED_FILES.has(name)) {
    return true;
  }
  if (name.endsWith('.md') || name.startsWith('.env.')) {
    return true;
  }
  return false;
}

function isAllowedRootDirectory(name: string): boolean {
  if (ROOT_ALLOWED_DIRS.has(name)) {
    return true;
  }
  return ROOT_ALLOWED_DIR_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function isOverwritableRootFile(name: string): boolean {
  if (ROOT_OVERWRITABLE_FILES.has(name)) {
    return true;
  }
  if (name.startsWith('.env.') || name.endsWith('.md')) {
    return true;
  }
  return false;
}

async function ensureProjectRootStructure(
  projectPath: string,
  log: (message: string) => void
): Promise<void> {
  const entries = await fs.readdir(projectPath, { withFileTypes: true });
  const hasRootPackageJson = entries.some(
    (entry) => entry.isFile() && entry.name === 'package.json'
  );
  if (hasRootPackageJson) {
    return;
  }

  const candidateDirs: { name: string; path: string }[] = [];
  // Flask convention directories - these should not be considered as separate projects
  const flaskConventionDirs = ['templates', 'static', 'admin', 'blueprints', 'views', 'models', 'forms', 'utils', 'migrations'];
  
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (entry.name === 'node_modules') {
      continue;
    }
    // Skip Flask convention directories
    if (flaskConventionDirs.includes(entry.name.toLowerCase())) {
      continue;
    }
    const dirPath = path.join(projectPath, entry.name);
    // quick skip for empty directory
    const isCandidate = await isLikelyProjectRoot(dirPath);
    if (isCandidate) {
      candidateDirs.push({ name: entry.name, path: dirPath });
    }
  }

  if (candidateDirs.length === 0) {
    return;
  }

  if (candidateDirs.length > 1) {
    const dirNames = candidateDirs.map((dir) => dir.name).join(', ');
    throw new Error(
      `Multiple potential projects detected in subdirectories (${dirNames}). Please move the desired project files to the project root.`
    );
  }

  const candidate = candidateDirs[0];
  const { name: nestedName, path: nestedPath } = candidate;

  for (const entry of entries) {
    if (entry.name === nestedName) {
      continue;
    }
    if (entry.isDirectory()) {
      if (!isAllowedRootDirectory(entry.name)) {
        throw new Error(
          `Cannot normalize project structure because directory "${entry.name}" exists alongside "${nestedName}". Move project files to the root manually.`
        );
      }
      continue;
    }

    if (!isAllowedRootFile(entry.name)) {
      throw new Error(
        `Cannot normalize project structure because file "${entry.name}" exists alongside "${nestedName}". Move project files to the root manually.`
      );
    }
  }

  // Remove nested node_modules and root node_modules (if any) to avoid conflicts during move.
  await fs.rm(path.join(nestedPath, 'node_modules'), { recursive: true, force: true });
  await fs.rm(path.join(projectPath, 'node_modules'), { recursive: true, force: true });

  const nestedEntries = await fs.readdir(nestedPath, { withFileTypes: true });
  for (const nestedEntry of nestedEntries) {
    const sourcePath = path.join(nestedPath, nestedEntry.name);
    const destinationPath = path.join(projectPath, nestedEntry.name);
    if (await pathExists(destinationPath)) {
      if (nestedEntry.isFile() && isOverwritableRootFile(nestedEntry.name)) {
        await fs.rm(destinationPath, { force: true });
        await fs.rename(sourcePath, destinationPath);
        log(
          `Replaced existing root file "${nestedEntry.name}" with the version from "${nestedName}".`
        );
        continue;
      }
      throw new Error(
        `Cannot move "${nestedEntry.name}" from "${nestedName}" because "${nestedEntry.name}" already exists in the project root.`
      );
    }
    await fs.rename(sourcePath, destinationPath);
  }

  await fs.rm(nestedPath, { recursive: true, force: true });
  log(
    `Detected project inside subdirectory "${nestedName}". Contents moved to the project root.`
  );
}

async function waitForPreviewReady(
  url: string,
  log: (chunk: Buffer | string) => void,
  timeoutMs = 30_000,
  intervalMs = 1_000
) {
  const start = Date.now();
  let attempts = 0;

  while (Date.now() - start < timeoutMs) {
    attempts += 1;
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) {
        log(
          Buffer.from(
            `[PreviewManager] Preview server responded after ${attempts} attempt(s).`
          )
        );
        return true;
      }
      if (response.status === 405 || response.status === 501) {
        const getResponse = await fetch(url, { method: 'GET' });
        if (getResponse.ok) {
          log(
            Buffer.from(
              `[PreviewManager] Preview server responded to GET after ${attempts} attempt(s).`
            )
          );
          return true;
        }
      }
    } catch (error) {
      if (attempts === 1) {
        log(
          Buffer.from(
            `[PreviewManager] Waiting for preview server at ${url} (${error instanceof Error ? error.message : String(error)
            }).`
          )
        );
      }
    }

    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  log(
    Buffer.from(
      `[PreviewManager] Preview server did not respond within ${timeoutMs}ms; continuing regardless.`
    )
  );
  return false;
}

async function appendCommandLogs(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  logger: (chunk: Buffer | string) => void
) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', logger);
    child.stderr?.on('data', logger);

    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(`${command} ${args.join(' ')} exited with code ${code}`)
        );
      }
    });
  });
}

/**
 * Run pip install with fallback - tries multiple methods (pip3, pip, python -m pip, etc.)
 */
async function runPipInstall(
  installArgs: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  logger: (chunk: Buffer | string) => void
): Promise<void> {
  let lastError: unknown;

  for (const option of pipOptions) {
    try {
      const finalArgs = [...option.args, ...installArgs];
      await appendCommandLogs(option.cmd, finalArgs, cwd, env, logger);
      return; // Success
    } catch (error) {
      lastError = error;
      
      // If command not found, try next option
      if (isCommandNotFound(error) && option !== pipOptions[pipOptions.length - 1]) {
        logger(Buffer.from(`[PreviewManager] '${option.cmd}' not found, trying next method...`));
        continue;
      }
      
      // If command failed with exit code, it might be PEP 668 (externally managed environment)
      // Try with --break-system-packages as a fallback
      if (
        String(error).includes('exited with code') && 
        !installArgs.includes('--break-system-packages')
      ) {
         try {
           logger(Buffer.from(`[PreviewManager] Install failed, retrying with --break-system-packages...`));
           const breakArgs = [...option.args, ...installArgs, '--break-system-packages'];
           await appendCommandLogs(option.cmd, breakArgs, cwd, env, logger);
           return; // Success on retry
         } catch (breakError) {
           // If that failed too, it might be permission issue. Try --user
           if (!installArgs.includes('--user')) {
             try {
               logger(Buffer.from(`[PreviewManager] Install failed again, retrying with --user --break-system-packages...`));
               const userArgs = [...option.args, ...installArgs, '--user', '--break-system-packages'];
               await appendCommandLogs(option.cmd, userArgs, cwd, env, logger);
               return; // Success on second retry
             } catch (userError) {
               lastError = userError;
             }
           } else {
             lastError = breakError;
           }
         }
      }

      // If we are here, we failed and likely shouldn't try other binaries if the first one was found but failed.
      // But for robustness, we continue if it wasn't the last option? 
      // Actually usually 'python -m pip' is the most reliable. If that failed, others will likely fail too.
      // But let's stick to the flow: if it's strictly NOT ENOENT, we probably shouldn't continue loop unless we want to be super aggressive.
      // Given the 'break-system-packages' retry didn't work, we probably just stop.
      // But the original code allowed continue only on ENOENT.
      if (option !== pipOptions[pipOptions.length - 1] && isCommandNotFound(error)) {
         continue; 
      }
      
      // If we caught an exit code error and retry failed, success is false.
      // We break loop and throw.
      break; 
    }
  }
  
  throw lastError;
}

/**
 * Verify which python binary is available (python3 vs python vs specific versions)
 */
async function detectPythonCommand(env: NodeJS.ProcessEnv): Promise<string> {
  if (process.platform === 'win32') return 'python';
  
  const candidates = ['python3', 'python', 'python3.12', 'python3.11', 'python3.10', 'python3.9', 'python3.8'];
  
  for (const cmd of candidates) {
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(cmd, ['--version'], { 
          env, 
          stdio: 'ignore' 
        });
        child.on('error', reject);
        child.on('exit', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Exit code ${code}`));
        });
      });
      return cmd;
    } catch {
      // Continue to next candidate
    }
  }
  
  // Fallback to python3 as requested by user (standard on modern Linux)
  return 'python3';
}

async function ensureDependencies(
  projectPath: string,
  env: NodeJS.ProcessEnv,
  logger: (chunk: Buffer | string) => void
) {
  try {
    await fs.access(path.join(projectPath, 'node_modules'));
    return;
  } catch {
    // node_modules missing, fall back to npm install
  }

  await runInstallWithPreferredManager(projectPath, env, logger);
}

export interface PreviewInfo {
  port: number | null;
  url: string | null;
  status: PreviewStatus;
  logs: string[];
  pid?: number;
}

class PreviewManager {
  private processes = new Map<string, PreviewProcess>();
  private installing = new Map<string, Promise<void>>();

  private getLogger(processInfo: PreviewProcess) {
    return (chunk: Buffer | string) => {
      const lines = chunk
        .toString()
        .split(/\r?\n/)
        .filter((line) => line.trim().length);
      lines.forEach((line) => {
        processInfo.logs.push(line);
        if (processInfo.logs.length > LOG_LIMIT) {
          processInfo.logs.shift();
        }
      });
    };
  }

  public async installDependencies(projectId: string): Promise<{ logs: string[] }> {
    const project = await getProjectById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const projectPath = project.repoPath
      ? path.resolve(project.repoPath)
      : path.join(process.cwd(), 'projects', projectId);

    await fs.mkdir(projectPath, { recursive: true });

    const logs: string[] = [];
    const record = (message: string) => {
      const formatted = `[PreviewManager] ${message}`;
      console.debug(formatted);
      logs.push(formatted);
    };

    await ensureProjectRootStructure(projectPath, record);

    try {
      await fs.access(path.join(projectPath, 'package.json'));
    } catch {
      if (project.templateType === 'git-import') {
        record('Git import detected. Skipping scaffolding.');
      } else if (project.templateType === 'static-html') {
        record(`Bootstrapping static HTML app for project ${projectId}`);
        await scaffoldStaticHtmlApp(projectPath, projectId);
      } else if (project.templateType === 'flask') {
        record(`Bootstrapping Flask app for project ${projectId}`);
        await scaffoldFlaskApp(projectPath, projectId);
      } else {
        record(`Bootstrapping minimal Next.js app for project ${projectId}`);
        await scaffoldBasicNextApp(projectPath, projectId);
      }
    }

    const hadNodeModules = await directoryExists(path.join(projectPath, 'node_modules'));

    const collectFromChunk = (chunk: Buffer | string) => {
      chunk
        .toString()
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .forEach((line) => record(line));
    };

    // Use a per-project lock to avoid concurrent install commands
    const runInstall = async () => {
      const installPromise = (async () => {
        try {
            await runInstallWithPreferredManager(
              projectPath,
              { ...process.env },
              collectFromChunk
            );
        } catch (error) {
          record('Dependency installation failed. Cleaning up node_modules to allow retry.');
          await fs.rm(path.join(projectPath, 'node_modules'), { recursive: true, force: true }).catch(() => {});
          throw error;
        } finally {
          this.installing.delete(projectId);
        }
      })();
      this.installing.set(projectId, installPromise);
      await installPromise;
    };

    // If an install is already in progress, wait for it; otherwise start one
    const existing = this.installing.get(projectId);
    if (existing) {
      record('Dependency installation already in progress; waiting for completion.');
      await existing;
    } else {
      await runInstall();
    }

    if (hadNodeModules) {
      record('Dependencies already installed. Skipped install command.');
    } else {
      record('Dependency installation completed.');
    }

    return { logs };
  }

  public async start(projectId: string): Promise<PreviewInfo> {
    const existing = this.processes.get(projectId);
    if (existing && existing.status !== 'error') {
      return this.toInfo(existing);
    }

    const project = await getProjectById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const projectPath = project.repoPath
      ? path.resolve(project.repoPath)
      : path.join(process.cwd(), 'projects', projectId);

    await fs.mkdir(projectPath, { recursive: true });

    const pendingLogs: string[] = [];
    const queueLog = (message: string) => {
      const formatted = `[PreviewManager] ${message}`;
      console.debug(formatted);
      pendingLogs.push(formatted);
    };

    await ensureProjectRootStructure(projectPath, queueLog);

    // --- AI Smart Edit Injection Setup ---
    // Ensure clean state before starting
    try {
        await this.cleanupSmartEditScript(projectPath, queueLog);
    } catch (e) {
        // Ignore cleanup errors on start
    }
    
    try {
      await this.injectSmartEditScript(projectPath, queueLog);
    } catch (e) {
      queueLog(`[Warning] Failed to inject AI Smart Edit script: ${e instanceof Error ? e.message : e}`);
    }
    // -------------------------------

    try {
      if (project.templateType === 'flask') {
        const appPyExists = await fileExists(path.join(projectPath, 'app.py'));
        if (!appPyExists) {
            console.debug(`[PreviewManager] Bootstrapping Flask app for project ${projectId}`);
            await scaffoldFlaskApp(projectPath, projectId);
        }
      } else {
        await fs.access(path.join(projectPath, 'package.json'));
      }
    } catch {
      if (project.templateType === 'git-import') {
        console.debug(`[PreviewManager] Git import detected for project ${projectId}. Skipping scaffolding.`);
      } else if (project.templateType === 'static-html') {
        console.debug(
          `[PreviewManager] Bootstrapping static HTML app for project ${projectId}`
        );
        await scaffoldStaticHtmlApp(projectPath, projectId);
      } else if (project.templateType === 'flask') {
         // Should be handled above, but fallback just in case
         console.debug(`[PreviewManager] Bootstrapping Flask app for project ${projectId}`);
         await scaffoldFlaskApp(projectPath, projectId);
      } else {
        console.debug(
          `[PreviewManager] Bootstrapping minimal Next.js app for project ${projectId}`
        );
        await scaffoldBasicNextApp(projectPath, projectId);
      }
    }

    const previewBounds = resolvePreviewBounds();
    const preferredPort = await findAvailablePort(
      previewBounds.start,
      previewBounds.end
    );

    const ip = getLocalIpAddress();
    const initialUrl = `http://${ip}:${preferredPort}`;

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PORT: String(preferredPort),
      WEB_PORT: String(preferredPort),
      NEXT_PUBLIC_APP_URL: initialUrl,
    };

    const previewProcess: PreviewProcess = {
      process: null,
      port: preferredPort,
      url: initialUrl,
      status: 'starting',
      logs: [],
      startedAt: new Date(),
    };

    const log = this.getLogger(previewProcess);
    const flushPendingLogs = () => {
      if (pendingLogs.length === 0) {
        return;
      }
      const entries = pendingLogs.splice(0);
      entries.forEach((entry) => log(Buffer.from(entry)));
    };
    flushPendingLogs();

    // Ensure dependencies with the same per-project lock used by installDependencies
    const ensureWithLock = async () => {
      if (project.templateType === 'flask') {
        // Python dependency check
        const venvExists = await directoryExists(path.join(projectPath, 'venv'));
        if (!venvExists && await fileExists(path.join(projectPath, 'requirements.txt'))) {
             log(Buffer.from('[PreviewManager] Installing Python dependencies...'));
             await runPipInstall(['install', '-r', 'requirements.txt'], projectPath, env, log);
        }
        return;
      }
      
      // Always ensure dependencies (npm will handle caching/idempotency)
      // Check concurrency lock:

      const existing = this.installing.get(projectId);
      if (existing) {
        log(Buffer.from('[PreviewManager] Dependency installation already in progress; waiting...'));
        await existing;
        return;
      }
      const installPromise = (async () => {
        try {
          // Double-check just before install
          await runInstallWithPreferredManager(projectPath, env, log);
        } catch (error) {
          log(Buffer.from('Dependency installation failed. Cleaning up node_modules and lockfiles to allow retry.'));
          await Promise.all([
            fs.rm(path.join(projectPath, 'node_modules'), { recursive: true, force: true }).catch(() => {}),
            fs.rm(path.join(projectPath, 'package-lock.json'), { force: true }).catch(() => {}),
            fs.rm(path.join(projectPath, 'yarn.lock'), { force: true }).catch(() => {}),
            fs.rm(path.join(projectPath, 'pnpm-lock.yaml'), { force: true }).catch(() => {}),
            fs.rm(path.join(projectPath, 'bun.lockb'), { force: true }).catch(() => {}),
          ]);
          throw error;
        } finally {
          this.installing.delete(projectId);
        }
      })();
      this.installing.set(projectId, installPromise);
      await installPromise;
    };

    await ensureWithLock();

    // ... (rest of start method logic remains similar but needs modification for spawning)
    
    // Determine command to run based on project type
    let spawnCommand = npmCommand;
    let spawnArgs: string[] = [];

    const overrides = await collectEnvOverrides(projectPath);

    if (overrides.port && overrides.port !== previewProcess.port) {
      previewProcess.port = overrides.port;
      env.PORT = String(overrides.port);
      env.WEB_PORT = String(overrides.port);
      log(Buffer.from(`[PreviewManager] Detected project-specified port ${overrides.port}.`));
    }

    const effectivePortFinal = previewProcess.port;
    
    // Update URL with effective port/url
    let resolvedUrl: string = `http://${ip}:${effectivePortFinal}`;
    if (typeof overrides.url === 'string' && overrides.url.trim().length > 0) {
      resolvedUrl = overrides.url.trim();
    }
    env.NEXT_PUBLIC_APP_URL = resolvedUrl;
    previewProcess.url = resolvedUrl;

    if (project.templateType === 'flask') {
       spawnCommand = await detectPythonCommand(env);
       spawnArgs = ['app.py'];
       // Ensure PORT env var is respected by Flask app
       env.PORT = String(effectivePortFinal);
       log(Buffer.from(`[PreviewManager] Using Python command: ${spawnCommand}`));
    } else {
        // Node/Next logic
        const packageJson = await readPackageJson(projectPath);
        const hasPredev = Boolean(packageJson?.scripts?.predev);

        if (hasPredev) {
          await appendCommandLogs(npmCommand, ['run', 'predev'], projectPath, env, log);
        }
         spawnArgs = ['run', 'dev', '--', '--port', String(effectivePortFinal)];
    }

    // Inject Smart Edit Script
    try {
        await this.injectAllHtmlFiles(projectId);
    } catch (e) {
        console.warn(`[PreviewManager] Failed to inject Smart Edit script: ${e}`);
    }

    const child = spawn(
      spawnCommand,
      spawnArgs,
      {
        cwd: projectPath,
        env,
        shell: process.platform === 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    // ... (std/err handlers)
    previewProcess.process = child;
    this.processes.set(projectId, previewProcess);

    child.stdout?.on('data', (chunk) => {
      log(chunk);
      if (previewProcess.status === 'starting') {
        previewProcess.status = 'running';
      }
    });

    child.stderr?.on('data', (chunk) => {
      log(chunk);
    });

    child.on('exit', (code, signal) => {
      previewProcess.status = code === 0 ? 'stopped' : 'error';
      this.processes.delete(projectId);
      updateProject(projectId, {
        previewUrl: null,
        previewPort: null,
      }).catch((error) => {
        console.error('[PreviewManager] Failed to reset project preview:', error);
      });
      updateProjectStatus(projectId, 'idle').catch((error) => {
        console.error('[PreviewManager] Failed to reset project status:', error);
      });
      log(
        Buffer.from(
          `Preview process exited (code: ${code ?? 'null'}, signal: ${
            signal ?? 'null'
          })`
        )
      );
    });

    child.on('error', (error) => {
      previewProcess.status = 'error';
      log(Buffer.from(`Preview process failed: ${error.message}`));
    });

    await waitForPreviewReady(previewProcess.url, log).catch(() => {
      // wait function already logged; ignore errors
    });

    await updateProject(projectId, {
      previewUrl: previewProcess.url,
      previewPort: previewProcess.port,
      status: 'running',
    });

    return this.toInfo(previewProcess);
  }

  public async stop(projectId: string): Promise<PreviewInfo> {
    const processInfo = this.processes.get(projectId);
    if (!processInfo) {
      const project = await getProjectById(projectId);
      if (project) {
        await updateProject(projectId, {
          previewUrl: null,
          previewPort: null,
        });
        await updateProjectStatus(projectId, 'idle');
      }
      return {
        port: null,
        url: null,
        status: 'stopped',
        logs: [],
      };
    }

    // Cleanup injected script on stop
    const project = await getProjectById(projectId);
    if (project) {
        const projectPath = project.repoPath
          ? path.resolve(project.repoPath)
          : path.join(process.cwd(), 'projects', projectId);
        try {
            await this.cleanupSmartEditScript(projectPath, (msg) => console.debug(`[PreviewManager] ${msg}`));
        } catch (e) {
            console.warn('[PreviewManager] Failed to cleanup script on stop:', e);
        }
    }

    if (processInfo.process) {
      await new Promise<void>((resolve) => {
        const proc = processInfo.process!;
        // If already exited, resolve immediately
        if (proc.exitCode !== null) {
          resolve();
          return;
        }

        // Wait for exit with timeout
        const timeout = setTimeout(() => {
          console.warn(`[PreviewManager] Process ${proc.pid} did not exit within 2000ms after SIGTERM.`);
          resolve();
        }, 5000);

        proc.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });

        try {
          proc.kill('SIGTERM');
        } catch (error) {
          console.error('[PreviewManager] Failed to stop preview process:', error);
          clearTimeout(timeout);
          resolve();
        }
      });
    }

    this.processes.delete(projectId);
    await updateProject(projectId, {
      previewUrl: null,
      previewPort: null,
    });
    await updateProjectStatus(projectId, 'idle');

    return {
      port: null,
      url: null,
      status: 'stopped',
      logs: processInfo.logs,
    };
  }

  // ... (getStatus, getLogs remain)

  private async injectAllHtmlFiles(projectId: string): Promise<void> {
    const project = await getProjectById(projectId);
    if (!project) return;

    const projectPath = project.repoPath
      ? path.resolve(project.repoPath)
      : path.join(process.cwd(), 'projects', projectId);
    
    // 1. Prepare script content
    const scriptPath = path.join(process.cwd(), 'public', 'scripts', 'ai-smart-edit.js');
    let scriptContent = '';
    try {
      scriptContent = await fs.readFile(scriptPath, 'utf8');
    } catch {
      return;
    }

    const scriptTag = `
<!-- AI SMART EDIT INJECTION START -->
<script>
${scriptContent}
</script>
<!-- AI SMART EDIT INJECTION END -->
`;
    
    // 2. Inject into ALL HTML files (recursively find .html)
    const log = (msg: string) => console.debug(`[PreviewManager] [Inject] ${msg}`);

    const injectRecursively = async (dir: string) => {
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.next' || entry.name === 'venv' || entry.name === '__pycache__') continue;
                    await injectRecursively(fullPath);
                } else if (entry.isFile() && entry.name.endsWith('.html')) {
                    await this.injectIntoHtmlFile(fullPath, scriptTag, log);
                }
            }
        } catch {
             // ignore
        }
    };

    try {
        await injectRecursively(projectPath);
    } catch (e) {
        log(`Failed to recursively inject: ${e}`);
    }
  }

  private async cleanupSmartEditScript(projectPath: string, log: (msg: string) => void): Promise<void> {
    // 1. Clean up HTML files (static/Flask)
    const injectRecursively = async (dir: string) => {
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.next' || entry.name === 'venv' || entry.name === '__pycache__') continue;
                    await injectRecursively(fullPath);
                } else if (entry.isFile() && entry.name.endsWith('.html')) {
                    await this.removeScriptFromHtmlFile(fullPath, log);
                }
            }
        } catch {
            // ignore
        }
    };
    await injectRecursively(projectPath);

    // 2. Clean up Next.js App Router (layout.tsx / layout.js)
    const appLayoutTsxPath = path.join(projectPath, 'app', 'layout.tsx');
    const appLayoutJsPath = path.join(projectPath, 'app', 'layout.js');
    if (await fileExists(appLayoutTsxPath)) {
      await this.removeSmartEditFromNextJsFile(appLayoutTsxPath, log);
    }
    if (await fileExists(appLayoutJsPath)) {
      await this.removeSmartEditFromNextJsFile(appLayoutJsPath, log);
    }

    // 3. Clean up Next.js Pages Router (_app.tsx / _app.js)
    const pagesAppTsxPath = path.join(projectPath, 'pages', '_app.tsx');
    const pagesAppJsPath = path.join(projectPath, 'pages', '_app.js');
    if (await fileExists(pagesAppTsxPath)) {
      await this.removeSmartEditFromNextJsFile(pagesAppTsxPath, log);
    }
    if (await fileExists(pagesAppJsPath)) {
      await this.removeSmartEditFromNextJsFile(pagesAppJsPath, log);
    }

    // 4. Remove the copied script file from public/scripts/
    const copiedScriptPath = path.join(projectPath, 'public', 'scripts', 'ai-smart-edit.js');
    try {
      await fs.unlink(copiedScriptPath);
      log(`Removed ai-smart-edit.js from public/scripts/`);
    } catch {
      // File doesn't exist or already removed - ignore
    }
  }

  /**
   * Remove AI Smart Edit injection from Next.js layout/app files
   */
  private async removeSmartEditFromNextJsFile(filePath: string, log: (msg: string) => void): Promise<void> {
    try {
      let content = await fs.readFile(filePath, 'utf8');
      
      // Check if our injection marker exists
      if (!content.includes('AI_SMART_EDIT_INJECTED') && !content.includes('ai-smart-edit.js')) {
        return;
      }

      let hasChanges = false;

      // Remove the Script component line(s)
      const scriptLinePattern = /\s*\{\/\*\s*AI_SMART_EDIT_INJECTED\s*\*\/\}\s*\n?\s*<Script[^>]*ai-smart-edit\.js[^>]*\/>\s*\n?/g;
      if (scriptLinePattern.test(content)) {
        content = content.replace(scriptLinePattern, '');
        hasChanges = true;
      }

      // Also try alternative pattern (just the Script tag without comment)
      const scriptOnlyPattern = /<Script[^>]*ai-smart-edit\.js[^>]*\/>\s*\n?/g;
      if (scriptOnlyPattern.test(content)) {
        content = content.replace(scriptOnlyPattern, '');
        hasChanges = true;
      }

      // Remove the Script import if it was added solely for our injection
      // Only remove if there are no other uses of Script in the file
      const scriptUsageCount = (content.match(/<Script/g) || []).length;
      if (scriptUsageCount === 0) {
        // Remove the import line
        const importPattern = /import\s+Script\s+from\s+['"]next\/script['"];\s*\n?/g;
        if (importPattern.test(content)) {
          content = content.replace(importPattern, '');
          hasChanges = true;
        }
      }

      if (hasChanges) {
        await fs.writeFile(filePath, content, 'utf8');
        log(`Cleaned up AI Smart Edit from ${path.basename(filePath)}`);
      }
    } catch (e) {
      log(`Failed to cleanup ${path.basename(filePath)}: ${e}`);
    }
  }

  private async removeScriptFromHtmlFile(filePath: string, log: (msg: string) => void): Promise<void> {
      try {
          const content = await fs.readFile(filePath, 'utf8');
          const startMarker = '<!-- AI SMART EDIT INJECTION START -->';
          const endMarker = '<!-- AI SMART EDIT INJECTION END -->';
          
          let newContent = content;
          let hasChanges = false;
          
          // Loop to remove all instances
          while (true) {
              const startIndex = newContent.indexOf(startMarker);
              if (startIndex === -1) break;

              const endIndex = newContent.indexOf(endMarker, startIndex);
              if (endIndex === -1) {
                   // If we have a start but no end, we abort to strictly avoid data loss
                   log(`[WARNING] Malformed injection markers in ${path.basename(filePath)}. Aborting cleanup.`);
                   break;
              }

              // Calculate the range to remove
              let removeStart = startIndex;
              const removeEnd = endIndex + endMarker.length;

              // Look backwards from startIndex to consume preceding whitespace up to a '>'
              // This strictly replicates the regex logic (?<=[>])[\s\r\n]+ but safely
              let cursor = startIndex - 1;
              while (cursor >= 0) {
                  const char = newContent[cursor];
                  if (char === ' ' || char === '\n' || char === '\r' || char === '\t') {
                      cursor--;
                  } else if (char === '>') {
                      // Found the closing bracket of the previous tag, so we can verify this whitespace is safe to remove
                      removeStart = cursor + 1; // Start removal AFTER the '>'
                      break;
                  } else {
                      // Found meaningful content (not whitespace, not '>'), so DO NOT touch the whitespace
                      // This ensures we don't merge distinct text nodes or break layout if not adjacent to a tag
                      break;
                  }
              }

              // Perform the cut
              newContent = newContent.substring(0, removeStart) + newContent.substring(removeEnd);
              hasChanges = true;
          }

          if (hasChanges && newContent !== content) {
              await fs.writeFile(filePath, newContent, 'utf8');
              log(`Removed AI Smart Edit script from ${path.basename(filePath)}`);
          }
      } catch (e) {
          log(`Failed to cleanup ${path.basename(filePath)}: ${e}`);
      }
  }

  public async injectRoute(projectId: string, route: string): Promise<{ injected: boolean; detectedRoute: string }> {
    try {
      await this.injectAllHtmlFiles(projectId);
      return { injected: true, detectedRoute: route };
    } catch (e) {
      console.warn(`[PreviewManager] Failed to inject route ${route}:`, e);
      return { injected: false, detectedRoute: route };
    }
  }

  public getStatus(projectId: string): PreviewInfo {
    const processInfo = this.processes.get(projectId);
    if (!processInfo) {
      return {
        port: null,
        url: null,
        status: 'stopped',
        logs: [],
      };
    }
    return this.toInfo(processInfo);
  }

  public getLogs(projectId: string): string[] {
    const processInfo = this.processes.get(projectId);
    return processInfo ? [...processInfo.logs] : [];
  }

  private toInfo(processInfo: PreviewProcess): PreviewInfo {
    return {
      port: processInfo.port,
      url: processInfo.url,
      status: processInfo.status,
      logs: [...processInfo.logs],
      pid: processInfo.process?.pid,
    };
  }

  private async injectSmartEditScript(projectPath: string, log: (msg: string) => void): Promise<void> {
    const scriptPath = path.join(process.cwd(), 'public', 'scripts', 'ai-smart-edit.js');
    let scriptContent = '';
    
    try {
      scriptContent = await fs.readFile(scriptPath, 'utf8');
    } catch (e) {
      log(`Could not read ai-smart-edit.js from ${scriptPath}`);
      return;
    }

    const scriptTag = `<!-- AI SMART EDIT INJECTION START --><script>${scriptContent.trim()}</script><!-- AI SMART EDIT INJECTION END -->`;
    
    // Determine where to inject based on project structure
    // 1. Static HTML (index.html)
    const indexHtmlPath = path.join(projectPath, 'index.html');
    if (await fileExists(indexHtmlPath)) {
      await this.injectIntoHtmlFile(indexHtmlPath, scriptTag, log);
      return;
    }

    // 2. Flask (templates/index.html)
    const flaskTemplatePath = path.join(projectPath, 'templates', 'index.html');
    if (await fileExists(flaskTemplatePath)) {
       await this.injectIntoHtmlFile(flaskTemplatePath, scriptTag, log);
       return;
    }
    
    // 3. Next.js App Router (app/layout.tsx)
    const appLayoutPath = path.join(projectPath, 'app', 'layout.tsx');
    if (await fileExists(appLayoutPath)) {
      await this.injectSmartEditForNextJs(projectPath, appLayoutPath, scriptPath, log);
      return;
    }

    // 4. Next.js App Router (app/layout.js)
    const appLayoutJsPath = path.join(projectPath, 'app', 'layout.js');
    if (await fileExists(appLayoutJsPath)) {
      await this.injectSmartEditForNextJs(projectPath, appLayoutJsPath, scriptPath, log);
      return;
    }

    // 5. Next.js Pages Router (_app.tsx or pages/_app.tsx)
    const pagesAppPath = path.join(projectPath, 'pages', '_app.tsx');
    if (await fileExists(pagesAppPath)) {
      await this.injectSmartEditForNextJsPages(projectPath, pagesAppPath, scriptPath, log);
      return;
    }

    const pagesAppJsPath = path.join(projectPath, 'pages', '_app.js');
    if (await fileExists(pagesAppJsPath)) {
      await this.injectSmartEditForNextJsPages(projectPath, pagesAppJsPath, scriptPath, log);
      return;
    }

    // log('No suitable entry point found for AI Smart Edit injection.');
  }

  /**
   * Inject AI Smart Edit script for Next.js App Router projects
   * - Copies the script to the project's public/scripts/ folder
   * - Modifies the layout.tsx to include a Script component
   */
  private async injectSmartEditForNextJs(
    projectPath: string,
    layoutPath: string,
    sourceScriptPath: string,
    log: (msg: string) => void
  ): Promise<void> {
    try {
      // 1. Copy the script to project's public/scripts/
      const targetScriptDir = path.join(projectPath, 'public', 'scripts');
      const targetScriptPath = path.join(targetScriptDir, 'ai-smart-edit.js');
      
      await fs.mkdir(targetScriptDir, { recursive: true });
      await fs.copyFile(sourceScriptPath, targetScriptPath);
      log(`Copied ai-smart-edit.js to ${path.relative(projectPath, targetScriptPath)}`);

      // 2. Read the layout file
      let layoutContent = await fs.readFile(layoutPath, 'utf8');

      // Check if already injected
      if (layoutContent.includes('ai-smart-edit.js') || layoutContent.includes('AI_SMART_EDIT_INJECTED')) {
        log(`AI Smart Edit already injected in ${path.basename(layoutPath)}`);
        return;
      }

      // 3. Check if Script is already imported from next/script
      const hasScriptImport = /import\s+Script\s+from\s+['"]next\/script['"]/.test(layoutContent) ||
                              /import\s+{\s*[^}]*Script[^}]*}\s+from\s+['"]next\/script['"]/.test(layoutContent);

      // 4. Add Script import if not present
      if (!hasScriptImport) {
        // Find a good place to insert the import - after existing imports
        const importMatch = layoutContent.match(/^(import\s+.+?['"][^'"]+['"];?\s*\n)/gm);
        if (importMatch && importMatch.length > 0) {
          const lastImport = importMatch[importMatch.length - 1];
          const lastImportIndex = layoutContent.lastIndexOf(lastImport) + lastImport.length;
          layoutContent = layoutContent.slice(0, lastImportIndex) +
                          "import Script from 'next/script';\n" +
                          layoutContent.slice(lastImportIndex);
        } else {
          // No imports found, add at the top
          layoutContent = "import Script from 'next/script';\n" + layoutContent;
        }
        log(`Added Script import to ${path.basename(layoutPath)}`);
      }

      // 5. Inject the Script component before </body>
      const scriptComponent = `{/* AI_SMART_EDIT_INJECTED */}\n        <Script src="/scripts/ai-smart-edit.js" strategy="afterInteractive" />`;
      
      if (layoutContent.includes('</body>')) {
        layoutContent = layoutContent.replace(
          '</body>',
          `${scriptComponent}\n      </body>`
        );
        log(`Injected AI Smart Edit Script component into ${path.basename(layoutPath)}`);
      } else {
        // Fallback: try to find {children} and add after it
        const childrenMatch = layoutContent.match(/(\{children\})/);
        if (childrenMatch) {
          layoutContent = layoutContent.replace(
            '{children}',
            `{children}\n        ${scriptComponent}`
          );
          log(`Injected AI Smart Edit Script component after {children} in ${path.basename(layoutPath)}`);
        } else {
          log(`Could not find suitable injection point in ${path.basename(layoutPath)}`);
          return;
        }
      }

      // 6. Write the modified layout
      await fs.writeFile(layoutPath, layoutContent, 'utf8');
      log(`Successfully enabled AI Smart Edit for Next.js App Router project`);

    } catch (e) {
      log(`Failed to inject AI Smart Edit for Next.js: ${e instanceof Error ? e.message : e}`);
    }
  }

  /**
   * Inject AI Smart Edit script for Next.js Pages Router projects
   * - Copies the script to the project's public/scripts/ folder
   * - Modifies the _app.tsx to include a Script component
   */
  private async injectSmartEditForNextJsPages(
    projectPath: string,
    appPath: string,
    sourceScriptPath: string,
    log: (msg: string) => void
  ): Promise<void> {
    try {
      // 1. Copy the script to project's public/scripts/
      const targetScriptDir = path.join(projectPath, 'public', 'scripts');
      const targetScriptPath = path.join(targetScriptDir, 'ai-smart-edit.js');
      
      await fs.mkdir(targetScriptDir, { recursive: true });
      await fs.copyFile(sourceScriptPath, targetScriptPath);
      log(`Copied ai-smart-edit.js to ${path.relative(projectPath, targetScriptPath)}`);

      // 2. Read the _app file
      let appContent = await fs.readFile(appPath, 'utf8');

      // Check if already injected
      if (appContent.includes('ai-smart-edit.js') || appContent.includes('AI_SMART_EDIT_INJECTED')) {
        log(`AI Smart Edit already injected in ${path.basename(appPath)}`);
        return;
      }

      // 3. Check if Script is already imported
      const hasScriptImport = /import\s+Script\s+from\s+['"]next\/script['"]/.test(appContent);

      // 4. Add Script import if not present
      if (!hasScriptImport) {
        const importMatch = appContent.match(/^(import\s+.+?['"][^'"]+['"];?\s*\n)/gm);
        if (importMatch && importMatch.length > 0) {
          const lastImport = importMatch[importMatch.length - 1];
          const lastImportIndex = appContent.lastIndexOf(lastImport) + lastImport.length;
          appContent = appContent.slice(0, lastImportIndex) +
                       "import Script from 'next/script';\n" +
                       appContent.slice(lastImportIndex);
        } else {
          appContent = "import Script from 'next/script';\n" + appContent;
        }
        log(`Added Script import to ${path.basename(appPath)}`);
      }

      // 5. Find <Component and add Script after it within the return
      // For Pages Router, we typically wrap or add after <Component {...pageProps} />
      const scriptComponent = `\n      {/* AI_SMART_EDIT_INJECTED */}\n      <Script src="/scripts/ai-smart-edit.js" strategy="afterInteractive" />`;
      
      // Try to find the Component render and add after it
      const componentMatch = appContent.match(/<Component\s+[^>]*\/>/);
      if (componentMatch) {
        appContent = appContent.replace(
          componentMatch[0],
          `${componentMatch[0]}${scriptComponent}`
        );
        log(`Injected AI Smart Edit Script component into ${path.basename(appPath)}`);
      } else {
        // Try closing tag pattern
        const closingComponentMatch = appContent.match(/<Component\s+[^>]*>[^<]*<\/Component>/);
        if (closingComponentMatch) {
          appContent = appContent.replace(
            closingComponentMatch[0],
            `${closingComponentMatch[0]}${scriptComponent}`
          );
          log(`Injected AI Smart Edit Script component into ${path.basename(appPath)}`);
        } else {
          log(`Could not find Component in ${path.basename(appPath)} for injection`);
          return;
        }
      }

      // 6. Write the modified _app file
      await fs.writeFile(appPath, appContent, 'utf8');
      log(`Successfully enabled AI Smart Edit for Next.js Pages Router project`);

    } catch (e) {
      log(`Failed to inject AI Smart Edit for Next.js Pages Router: ${e instanceof Error ? e.message : e}`);
    }
  }

  private async injectIntoHtmlFile(filePath: string, injection: string, log: (msg: string) => void): Promise<void> {
    try {
      let content = await fs.readFile(filePath, 'utf8');
      
      // Check if already injected
      if (content.includes('AI SMART EDIT INJECTION START')) {
         // Replace existing injection to ensure latest version
         content = content.replace(/<!-- AI SMART EDIT INJECTION START -->[\s\S]*?<!-- AI SMART EDIT INJECTION END -->/, injection);
         log(`Updated AI Smart Edit script in ${path.basename(filePath)}`);
      } else {
        // Inject before </body>
        if (content.includes('</body>')) {
          content = content.replace('</body>', `${injection}</body>`);
          log(`Injected AI Smart Edit script into ${path.basename(filePath)}`);
        } else {
          // Fallback: append to end
          content += injection;
          log(`Appended AI Smart Edit script to ${path.basename(filePath)} (no </body> tag found)`);
        }
      }
      
      await fs.writeFile(filePath, content, 'utf8');
    } catch(e) {
      log(`Failed to update ${path.basename(filePath)}: ${e}`);
    }
  }
}

const globalPreviewManager = globalThis as unknown as {
  __claudable_preview_manager_v3__?: PreviewManager;
};

export const previewManager: PreviewManager =
  globalPreviewManager.__claudable_preview_manager_v3__ ??
  (globalPreviewManager.__claudable_preview_manager_v3__ = new PreviewManager());

