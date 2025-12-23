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
import {
  cleanupSmartEditScript,
  cleanupSmartEditContent,
  tagContentWithSourceIds,
} from './smart-edit-utils';

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

/**
 * Detect the actual project type based on file markers in the project directory.
 * This is especially useful for git-imported projects where we need to determine
 * what kind of project was imported.
 */
type DetectedProjectType = 'flask' | 'nextjs' | 'static-html' | 'react' | 'vue' | 'custom';

async function detectProjectType(projectPath: string): Promise<DetectedProjectType> {
  // Check for Flask (Python) project
  const wsgiPath = path.join(projectPath, 'wsgi.py');
  const requirementsTxtPath = path.join(projectPath, 'requirements.txt');
  
  try {
    // Check for wsgi.py
    if (await fileExists(wsgiPath)) {
        return 'flask';
    }
  
  } catch {
    // File doesn't exist, continue checking
  }
  
  // Check requirements.txt for Flask
  try {
    const requirements = await fs.readFile(requirementsTxtPath, 'utf8');
    if (requirements.toLowerCase().includes('flask')) {
      return 'flask';
    }
  } catch {
    // requirements.txt doesn't exist, continue checking
  }
  
  // Check for Node.js projects via package.json
  const packageJson = await readPackageJson(projectPath);
  
  if (packageJson) {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    // Check for Next.js
    if (deps['next']) {
      return 'nextjs';
    }
    
    // Check for Vue
    if (deps['vue'] || deps['nuxt']) {
      return 'vue';
    }
    
    // Check for React (but not Next.js)
    if (deps['react'] && !deps['next']) {
      return 'react';
    }
    
    // Has package.json but no recognized framework - treat as custom
    return 'custom';
  }
  
  // Check for static HTML project
  const indexHtmlPath = path.join(projectPath, 'index.html');
  try {
    await fs.access(indexHtmlPath);
    return 'static-html';
  } catch {
    // No index.html
  }
  
  // Default to custom if we can't determine the type
  return 'custom';
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

async function enforceFlaskPort(projectPath: string, entryPoint: string, log: (msg: string) => void): Promise<void> {
  const wsgiPyPath = path.join(projectPath, entryPoint);
  try {
    if (await fileExists(wsgiPyPath)) {
      let content = await fs.readFile(wsgiPyPath, 'utf8');
      
      let changed = false;

      // Ensure 'import os' exists
      if (!content.includes('import os') && !content.includes('from os import')) {
        content = 'import os\n' + content;
        changed = true;
      }

      // Check for app.run - Allow spaces: app.run ( ... )
      const appRunRegex = /app\.run\s*\(([^)]*)\)/;
      const match = content.match(appRunRegex);

      if (match) {
        const args = match[1];
        
        // Check if port arg exists
        const portRegex = /port\s*=\s*([^,)\s]+)/;
        const portMatch = args.match(portRegex);

        // Check if host arg exists
        const hostRegex = /host\s*=\s*([^,)\s]+)/;
        const hostMatch = args.match(hostRegex);

        let newArgs = args;

        // Ensure host='0.0.0.0' is present
        if (hostMatch) {
          // Replace existing host value with '0.0.0.0'
          const hostValue = hostMatch[1];
          if (hostValue !== "'0.0.0.0'" && hostValue !== '"0.0.0.0"') {
             newArgs = newArgs.replace(hostRegex, "host='0.0.0.0'");
          }
        } else {
          // Append host arg
          if (!newArgs.trim()) {
            newArgs = "host='0.0.0.0'";
          } else {
            newArgs = "host='0.0.0.0', " + newArgs;
          }
        }

        // Ensure port=int(os.environ.get('PORT', ...)) is present
        if (portMatch) {
          const originalValue = portMatch[1];
          if (!originalValue.includes("os.environ.get('PORT'")) {
            newArgs = newArgs.replace(portRegex, `port=int(os.environ.get('PORT', ${originalValue}))`);
          }
        } else {
          // Append port arg if not present
          if (!newArgs.trim()) {
            newArgs = "port=int(os.environ.get('PORT', 5000))";
          } else {
            newArgs = newArgs + ", port=int(os.environ.get('PORT', 5000))";
          }
        }
        
        if (newArgs !== args) {
          content = content.replace(match[0], `app.run(${newArgs})`);
          changed = true;
        }

        // Ensure app.run() is inside if __name__ == '__main__': guard
        const mainGuardRegex = /if\s+__name__\s*==\s*['"]__main__['"]\s*:/;
        const hasMainGuard = mainGuardRegex.test(content);
        
        if (!hasMainGuard) {
          // Find the app.run() call and wrap it in the guard
          const appRunFullRegex = /^(\s*)(app\.run\s*\([^)]*\))/m;
          const runMatch = content.match(appRunFullRegex);
          
          if (runMatch) {
            const indent = runMatch[1] || '';
            const appRunCall = runMatch[2];
            const guardedCode = `\nif __name__ == '__main__':\n${indent}    ${appRunCall}`;
            content = content.replace(runMatch[0], guardedCode);
            changed = true;
            log('[PreviewManager] Wrapped app.run() in if __name__ == "__main__": guard');
          }
        }
      } else {
        log(`[PreviewManager] Could not find app.run() call in ${entryPoint} to inject port/host.`);
      }

      if (changed) {
        await fs.writeFile(wsgiPyPath, content, 'utf8');
        log(`Injected dynamic port and host configuration into ${entryPoint}`);
      }
    }
  } catch (e) {
    log(`Failed to enforce Flask port/host: ${e}`);
  }
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
  const flaskConventionDirs = ['app', 'templates', 'static', 'admin', 'blueprints', 'views', 'models', 'forms', 'utils', 'migrations'];
  
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
  intervalMs = 1_000,
  localUrl?: string
) {
  const start = Date.now();
  let attempts = 0;

  // If localUrl is provided, we prefer it for internal checks
  const checkUrl = localUrl || url;

  while (Date.now() - start < timeoutMs) {
    attempts += 1;
    try {
      const response = await fetch(checkUrl, { method: 'HEAD' });
      if (response.ok) {
        log(
          Buffer.from(
            `[PreviewManager] Preview server responded at ${checkUrl} after ${attempts} attempt(s).`
          )
        );
        return true;
      }
      if (response.status === 405 || response.status === 501) {
        const getResponse = await fetch(checkUrl, { method: 'GET' });
        if (getResponse.ok) {
          log(
            Buffer.from(
              `[PreviewManager] Preview server responded to GET at ${checkUrl} after ${attempts} attempt(s).`
            )
          );
          return true;
        }
      }
    } catch (error) {
      if (attempts === 1) {
        log(
          Buffer.from(
            `[PreviewManager] Waiting for preview server at ${checkUrl} (${error instanceof Error ? error.message : String(error)
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
      `[PreviewManager] Preview server did not respond at ${checkUrl} within ${timeoutMs}ms; continuing regardless.`
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
  logger: (chunk: Buffer | string) => void,
  pythonCommand?: string
): Promise<void> {
  let lastError: unknown;

  const options = [...pipOptions];
  if (pythonCommand) {
    options.unshift({ cmd: pythonCommand, args: ['-m', 'pip'] });
  }

  for (const option of options) {
    try {
      const finalArgs = [...option.args, ...installArgs];
      await appendCommandLogs(option.cmd, finalArgs, cwd, env, logger);
      return; // Success
    } catch (error) {
      lastError = error;
      
      // If command not found, try next option
      if (isCommandNotFound(error) && option !== options[options.length - 1]) {
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
      if (option !== options[options.length - 1] && isCommandNotFound(error)) {
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
  if (process.platform === 'win32') {
    try {
      // Find all python paths
      const { execSync } = require('child_process');
      const output = execSync('where python', { env }).toString();
      const paths = output.split(/\r?\n/).filter((p: string) => p.trim().length > 0);
      // Look for a path that ISN'T the Microsoft Store shim
      const realPath = paths.find((p: string) => !p.includes('Microsoft\\WindowsApps')) || paths[0];
      if (realPath) return realPath;
    } catch {
      // Fallback
    }
    return 'python';
  }

  
  const candidates = ['python3', 'python', 'python3.12', 'python3.11', 'python3.10', 'python3.9', 'python3.8'];
  
  for (const cmd of candidates) {
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(cmd, ['--version'], { 
          env, 
          stdio: 'ignore',
          shell: true  // Use shell for consistent behavior with Flask execution
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
        // Detect actual project type for git imports
        const detectedType = await detectProjectType(projectPath);
        record(`Git import detected. Detected project type: ${detectedType}`);
        
        // Handle Flask projects from git imports
        if (detectedType === 'flask') {
          record('Setting up Flask project from git import...');
          // Only scaffold if absolutely necessary (e.g. missing crucial files), but usually we respect the import
          // For now, ensuring port binding on the likely entry point
          await enforceFlaskPort(projectPath, 'wsgi.py', record);
        }
        // For other detected types, dependencies will be installed below
      } else if (project.templateType === 'static-html') {
        record(`Bootstrapping static HTML app for project ${projectId}`);
        await scaffoldStaticHtmlApp(projectPath, projectId);
      } else if (project.templateType === 'flask') {
        record(`Bootstrapping Flask app for project ${projectId}`);
        await scaffoldFlaskApp(projectPath, projectId);
        await enforceFlaskPort(projectPath, 'wsgi.py', record);
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
            // Detect project type for installation
            let detectedType = project.templateType;
            if (detectedType === 'git-import') {
              detectedType = await detectProjectType(projectPath);
            }

            if (detectedType === 'flask') {
              const requirementsPath = path.join(projectPath, 'requirements.txt');
              if (await fileExists(requirementsPath)) {
                record('Installing Python dependencies for Flask project...');
                const pyCmd = await detectPythonCommand({ ...process.env });
                await runPipInstall(['install', '-r', 'requirements.txt'], projectPath, { ...process.env }, collectFromChunk, pyCmd);
              } else {
                record('Flask project detected but requirements.txt missing. Skipping pip install.');
              }
            } else {
              await runInstallWithPreferredManager(
                projectPath,
                { ...process.env },
                collectFromChunk
              );
            }
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

    record('Dependency installation/update completed.');

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

    const previewBounds = resolvePreviewBounds();
    console.info(`[PreviewManager] Preview port range: ${previewBounds.start}-${previewBounds.end} (PREVIEW_PORT_START=${process.env.PREVIEW_PORT_START || 'not set'})`);
    
    const preferredPort = await findAvailablePort(
      previewBounds.start,
      previewBounds.end
    );

    console.info(`[PreviewManager] Selected port ${preferredPort} for project ${projectId}`);
    
    const ip = getLocalIpAddress(); // Use 0.0.0.0 instead of localhost to allow network access in Docker
    const initialUrl = `http://${ip}:${preferredPort}`;

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PORT: String(preferredPort),
      WEB_PORT: String(preferredPort),
      NEXT_PUBLIC_APP_URL: initialUrl,
    };

    // Create Shadow Baselines (Original Source Snapshot)
    await this.createProjectBaselines(projectPath, (msg) => console.log(msg));

    const previewProcess: PreviewProcess = {
      process: null,
      port: preferredPort,
      url: initialUrl,
      status: 'starting',
      logs: [],
      startedAt: new Date(),
    };

    const log = this.getLogger(previewProcess);
    this.processes.set(projectId, previewProcess);

    await ensureProjectRootStructure(projectPath, (msg) => log(Buffer.from(`[PreviewManager] ${msg}`)));

    // --- AI Smart Edit Injection Setup ---
    // Ensure clean state before starting
    try {
        await this.cleanupSmartEditScript(projectPath, (msg) => log(Buffer.from(`[PreviewManager] ${msg}`)));
    } catch (e) {
        // Ignore cleanup errors on start
    }
    
    try {
      await this.injectSmartEditScript(projectPath, (msg) => log(Buffer.from(`[PreviewManager] ${msg}`)));
    } catch (e) {
      log(Buffer.from(`[PreviewManager] [Warning] Failed to inject AI Smart Edit script: ${e instanceof Error ? e.message : e}`));
    }
    // -------------------------------

    try {
      if (project.templateType === 'flask') {
        const wsgiExists = await fileExists(path.join(projectPath, 'wsgi.py'));
        
        if (!wsgiExists) {
            console.debug(`[PreviewManager] Bootstrapping Flask app for project ${projectId}`);
            await scaffoldFlaskApp(projectPath, projectId);
            await enforceFlaskPort(projectPath, 'wsgi.py', (msg) => log(Buffer.from(`[PreviewManager] ${msg}`)));
        } else {
            // If exists, ensure port binding is correct
            await enforceFlaskPort(projectPath, 'wsgi.py', (msg) => log(Buffer.from(`[PreviewManager] ${msg}`)));
        }
      } else {
        await fs.access(path.join(projectPath, 'package.json'));
      }
    } catch {
      if (project.templateType === 'git-import') {
        // Detect actual project type for git imports
        const detectedType = await detectProjectType(projectPath);
        console.debug(`[PreviewManager] Git import detected. Detected project type: ${detectedType}`);
        
        // Update project's effective type for later use in this method
        // Store detected type for use in spawn command selection
        (project as any)._detectedType = detectedType;
        
        if (detectedType === 'flask') {
          console.debug(`[PreviewManager] Setting up Flask project from git import`);
          await scaffoldFlaskApp(projectPath, projectId);
          await enforceFlaskPort(projectPath, 'wsgi.py', (msg) => log(Buffer.from(`[PreviewManager] ${msg}`)));
        }
      } else if (project.templateType === 'static-html') {
        console.debug(
          `[PreviewManager] Bootstrapping static HTML app for project ${projectId}`
        );
        await scaffoldStaticHtmlApp(projectPath, projectId);
      } else if (project.templateType === 'flask') {
        // Only scaffold if NO entry point exists
        const wsgiExists = await fileExists(path.join(projectPath, 'wsgi.py'));
        
        if (!wsgiExists) {
             console.debug(`[PreviewManager] Bootstrapping Flask app for project ${projectId}`);
             await scaffoldFlaskApp(projectPath, projectId);
             await enforceFlaskPort(projectPath, 'wsgi.py', (msg) => log(Buffer.from(`[PreviewManager] ${msg}`)));
        } else {
             console.debug(`[PreviewManager] Internal flask check: found wsgi.py, skipping scaffold.`);
             await enforceFlaskPort(projectPath, 'wsgi.py', (msg) => log(Buffer.from(`[PreviewManager] ${msg}`)));
        }
      } else {
        console.debug(
          `[PreviewManager] Bootstrapping minimal Next.js app for project ${projectId}`
        );
        await scaffoldBasicNextApp(projectPath, projectId);
      }
    }

    // Ensure dependencies with the same per-project lock used by installDependencies
    // We do this IMMEDIATELY after import/scaffold as requested.
    const ensureWithLock = async () => {
      const effectiveTypeBeforeInstall = project.templateType === 'git-import' 
        ? (project as any)._detectedType || 'custom'
        : project.templateType;

      if (effectiveTypeBeforeInstall === 'flask') {
        // Python dependency check
        if (await fileExists(path.join(projectPath, 'requirements.txt'))) {
             log(Buffer.from('[PreviewManager] Installing/Updating Python dependencies...'));
             // Detect python command BEFORE install to ensure consistency
             const pyCmd = await detectPythonCommand(env);
             // Always run install to ensure deps are up to date (pip is fast if satisfied)
             await runPipInstall(['install', '-r', 'requirements.txt'], projectPath, env, log, pyCmd);
        }
        return;
      }
      
      // Always ensure dependencies (npm will handle caching/idempotency)
      // Check concurrency lock:

      const existingInstall = this.installing.get(projectId);
      if (existingInstall) {
        log(Buffer.from('[PreviewManager] Dependency installation already in progress; waiting...'));
        await existingInstall;
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

    // Determine effective project type early for port logic
    const effectiveType = project.templateType === 'git-import' 
      ? (project as any)._detectedType || 'custom'
      : project.templateType;

    const isFlaskProject = effectiveType === 'flask';

    // Filter out environment variables that could conflict with the child process.
    // Specifically, DATABASE_URL from Claudable's own Prisma setup crashes Flask-SQLAlchemy.
    if (isFlaskProject || effectiveType === 'static-html') {
      delete env.DATABASE_URL;
      delete env.DATABASE_PRISMA_URL;
      delete env.DATABASE_URL_NON_POOLING;
      delete env.SHADOW_DATABASE_URL;
    }


    // For Flask projects, ALWAYS use the preview manager's dynamically assigned port.
    // Do NOT use the project's .env PORT to avoid conflicts with Claudable's own port.
    // For Node.js projects, we can respect the project's port preference.
    if (!isFlaskProject && overrides.port && overrides.port !== previewProcess.port) {
      previewProcess.port = overrides.port;
      env.PORT = String(overrides.port);
      env.WEB_PORT = String(overrides.port);
      log(Buffer.from(`[PreviewManager] Detected project-specified port ${overrides.port}.`));
    }

    const effectivePortFinal = previewProcess.port;
    
    // Update URL with effective port/url
    let resolvedUrl: string = `http://${ip}:${effectivePortFinal}`;
    // For Flask, always use localhost URL; don't use project's NEXT_PUBLIC_APP_URL
    if (!isFlaskProject && typeof overrides.url === 'string' && overrides.url.trim().length > 0) {
      resolvedUrl = overrides.url.trim();
    }
    env.NEXT_PUBLIC_APP_URL = resolvedUrl;
    previewProcess.url = resolvedUrl;

    // isFlaskProject and effectiveType already determined above
    console.log('isFlaskProject???', isFlaskProject);
    console.log('effectiveType???', effectiveType);
    if (isFlaskProject) {
       // Enforce dynamic port in source
       const wsgiExists = await fileExists(path.join(projectPath, 'wsgi.py'));
       
       // Prioritize wsgi.py -> app.py  
       const entryPoint = wsgiExists ? 'wsgi.py' : 'app.py';
       
       await enforceFlaskPort(projectPath, entryPoint, (msg) => log(Buffer.from(`[PreviewManager] ${msg}`)));

       spawnCommand = await detectPythonCommand(env);
       spawnArgs = [entryPoint];
       // Ensure PORT env var is respected by Flask app
       env.PORT = String(effectivePortFinal);
       
       // Set FLASK_APP to entry point
       env.FLASK_APP = entryPoint;
       console.log('spawnCommand???', spawnCommand);
       console.log('spawnArgs???', spawnArgs);
       log(Buffer.from(`[PreviewManager] Using Python command: ${spawnCommand} ${spawnArgs.join(' ')}`));
    } else {
        // Node/Next logic
        const packageJson = await readPackageJson(projectPath);
        const hasPredev = Boolean(packageJson?.scripts?.predev);

        if (hasPredev) {
          await appendCommandLogs(npmCommand, ['run', 'predev'], projectPath, env, log);
        }
         spawnArgs = ['run', 'dev', '--', '--port', String(effectivePortFinal), '-H', '0.0.0.0'];
    }

    // Inject Smart Edit Script is handled earlier in the start method via injectSmartEditScript

    // Use shell:true for Flask projects on all platforms for consistent behavior
    // Flask needs shell for proper Python command resolution on Linux
    const useShell = isFlaskProject ? true : process.platform === 'win32';
    
    // DEBUG: Log spawn details
    console.error(`[PreviewManager DEBUG] Spawning: ${spawnCommand} ${spawnArgs.join(' ')}`);
    console.error(`[PreviewManager DEBUG] CWD: ${projectPath}`);
    console.error(`[PreviewManager DEBUG] PORT: ${env.PORT}`);
    console.error(`[PreviewManager DEBUG] shell: ${useShell}`);
    
    const child = spawn(
      spawnCommand,
      spawnArgs,
      {
        cwd: projectPath,
        env,
        shell: useShell,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    
    console.error(`[PreviewManager DEBUG] Spawned child PID: ${child.pid}`);

    child.stdout?.on('data', (chunk) => {
      const msg = chunk.toString();
      console.error(`[PreviewManager STDOUT] ${msg.trim()}`);
      log(chunk);
      if (previewProcess.status === 'starting') {
        previewProcess.status = 'running';
      }
    });

    child.stderr?.on('data', (chunk) => {
      const msg = chunk.toString();
      console.error(`[PreviewManager STDERR] ${msg.trim()}`);
      log(chunk);
    });

    child.on('exit', (code, signal) => {
      console.error(`[PreviewManager DEBUG] Process ${child.pid} exited with code ${code} and signal ${signal}`);
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
      console.error(`[PreviewManager DEBUG] Process ${child.pid} encountered error: ${error.message}`);
      previewProcess.status = 'error';
      log(Buffer.from(`Preview process failed: ${error.message}`));
    });

    const internalUrl = `http://localhost:${previewProcess.port}`;
    console.error(`[PreviewManager DEBUG] Waiting for preview ready at ${previewProcess.url} (internal check: ${internalUrl})...`);
    await waitForPreviewReady(previewProcess.url, log, 30000, 1000, internalUrl).catch((err) => {
      console.error(`[PreviewManager DEBUG] waitForPreviewReady failed: ${err}`);
    });

    await updateProject(projectId, {
      previewUrl: previewProcess.url,
      previewPort: previewProcess.port,
      status: 'running',
    });

    return this.toInfo(previewProcess);
  }

  public async stop(projectId: string): Promise<PreviewInfo> {
    const project = await getProjectById(projectId);
    if (project) {
        const projectPath = project.repoPath
          ? path.resolve(project.repoPath)
          : path.join(process.cwd(), 'projects', projectId);
        try {
            await this.cleanupSmartEditScript(projectPath, (msg) => console.log(`[PreviewManager] [Cleanup on Stop] ${msg}`));
        } catch (e) {
            console.warn('[PreviewManager] Failed to cleanup script on stop:', e);
        }
    }

    const processInfo = this.processes.get(projectId);
    if (!processInfo) {
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

    if (processInfo.process) {
      // ... same process termination logic ...
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
 private async injectAllHtmlFiles(projectId: string, masterFilePath: string | undefined): Promise<void> {
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
                    const relPath = path.relative(projectPath, fullPath).replace(/\\/g, '/');
                    const localScriptTag = `<!-- AI SMART EDIT INJECTION START -->
<script>
window.__AI_SMART_EDIT_FILE__ = "${relPath}";
${scriptContent}
</script>
<!-- AI SMART EDIT INJECTION END -->`;
                    await this.injectIntoHtmlFile(fullPath, relPath, localScriptTag, log);
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

  public async cleanupSmartEditScript(projectPath: string, log: (msg: string) => void): Promise<void> {
    return cleanupSmartEditScript(projectPath, log);
  }

  public cleanupSmartEditContent(content: string): string {
    return cleanupSmartEditContent(content);
  }

  public async injectRoute(projectId: string, route: string): Promise<{ injected: boolean; detectedRoute: string }> {
    try {
      await this.injectAllHtmlFiles(projectId, undefined);
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
    const projectId = path.basename(projectPath); // Heuristic for projectId
    
    // Find the Master Layout
    let masterFilePath: string | undefined;

    const candidates = [
        path.join(projectPath, 'app', 'templates', 'base.html'),
        // path.join(projectPath, 'app', 'templates', 'layouts', 'main.html'),
        // path.join(projectPath, 'templates', 'base.html'),
        // path.join(projectPath, 'templates', 'layouts', 'main.html'),
        // path.join(projectPath, 'templates', 'index.html'),
        path.join(projectPath, 'index.html'),
        // path.join(projectPath, 'app', 'layout.tsx'),
        // path.join(projectPath, 'app', 'layout.js'),
        // path.join(projectPath, 'pages', '_app.tsx'),
        path.join(projectPath, 'pages', '_app.js')
    ];

    for (const cand of candidates) {
        if (await fileExists(cand)) {
            masterFilePath = cand;
            break;
        }
    }

    if (masterFilePath && (masterFilePath.endsWith('.tsx') || masterFilePath.endsWith('.js'))) {
        const scriptPath = path.join(process.cwd(), 'public', 'scripts', 'ai-smart-edit.js');
        if (masterFilePath.includes('_app')) {
            await this.injectSmartEditForNextJsPages(projectPath, masterFilePath, scriptPath, log);
        } else {
            await this.injectSmartEditForNextJs(projectPath, masterFilePath, scriptPath, log);
        }
        // Even for Next.js, we should still run injectAllHtmlFiles to tag .html if any
        await this.injectAllHtmlFiles(projectId, masterFilePath);
    } else {
        // For HTML/template projects, injectAllHtmlFiles handles both master and children
        await this.injectAllHtmlFiles(projectId, masterFilePath);
    }
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

  private async injectIntoHtmlFile(filePath: string, relPath: string, injection: string, log: (msg: string) => void): Promise<void> {
    try {
      let content = await fs.readFile(filePath, 'utf8');
      
      // Tag all elements with source IDs for granular editing
      content = tagContentWithSourceIds(content, relPath);
      
      // Check if already injected
      if (content.includes('AI SMART EDIT INJECTION START')) {
         // Replace existing injection to ensure latest version
         content = content.replace(/<!-- AI SMART EDIT INJECTION START -->[\s\S]*?<!-- AI SMART EDIT INJECTION END -->/, injection);
         log(`Updated AI Smart Edit script in ${path.basename(filePath)}`);
      } else {
        // Inject before </body>
        if (content.includes('</body>')) {
          content = content.replace('</body>', `\n${injection}\n</body>`);
          log(`Injected AI Smart Edit script into ${path.basename(filePath)}`);
        } else {
          // Fallback: append to end
          content += `\n${injection}\n`;
          log(`Appended AI Smart Edit script to ${path.basename(filePath)} (no </body> tag found)`);
        }
      }
      
      await fs.writeFile(filePath, content, 'utf8');
    } catch(e) {
      log(`Failed to update ${path.basename(filePath)}: ${e}`);
    }
  }


  private async createProjectBaselines(projectPath: string, log: (msg: string) => void): Promise<void> {
    const baselineDir = path.join(projectPath, '.claudable', 'baselines');
    try {
      // Check if baselines already exist for this project
      try {
        await fs.access(baselineDir);
        log(`[PreviewManager] Using existing baselines for project at ${baselineDir}`);
        return; // Already exists, don't overwrite "very original" source
      } catch {
        // Not found, proceed with creation
      }

      await fs.mkdir(baselineDir, { recursive: true });

      const copyRecursively = async (src: string, dest: string) => {
        const entries = await fs.readdir(src, { withFileTypes: true });
        for (const entry of entries) {
           const srcPath = path.join(src, entry.name);
           const destPath = path.join(dest, entry.name);
           if (entry.isDirectory()) {
             // Skip system/output directories
             if (['node_modules', '.git', '.next', 'venv', '__pycache__', '.claudable', '.claude', 'backups'].includes(entry.name)) continue;
             await fs.mkdir(destPath, { recursive: true });
             await copyRecursively(srcPath, destPath);
           } else if (entry.isFile() && (entry.name.endsWith('.html') || entry.name.endsWith('.tsx') || entry.name.endsWith('.jsx') || entry.name.endsWith('.js'))) {
             await fs.copyFile(srcPath, destPath);
           }
        }
      };
      await copyRecursively(projectPath, baselineDir);
      log(`[PreviewManager] Created original source baselines in ${baselineDir}`);
    } catch (e) {
      log(`[PreviewManager] Failed to create baselines: ${e}`);
    }
  }

  /**
   * Update a specific file baseline after it has been saved
   */
  public async updateProjectFileBaseline(projectId: string, relPath: string): Promise<void> {
    const project = await getProjectById(projectId);
    if (!project) return;

    const repoPath = project.repoPath || path.join('data', 'projects', project.id);
    const projectRoot = path.isAbsolute(repoPath) ? repoPath : path.resolve(process.cwd(), repoPath);
    
    // Normalize path to ensure consistency
    const normalizedPath = relPath.replace(/\\/g, '/').replace(/^\//, '');
    const sourcePath = path.join(projectRoot, normalizedPath);
    const baselinePath = path.join(projectRoot, '.claudable', 'baselines', normalizedPath);

    try {
      // Ensure target directory exists in baselines
      await fs.mkdir(path.dirname(baselinePath), { recursive: true });
      await fs.copyFile(sourcePath, baselinePath);
      console.log(`[PreviewManager] Updated baseline for ${normalizedPath}`);
    } catch (e) {
      console.error(`[PreviewManager] Failed to update baseline for ${normalizedPath}: ${e}`);
    }
  }
}

const globalPreviewManager = globalThis as unknown as {
  __claudable_preview_manager_v3__?: PreviewManager;
};

export const previewManager: PreviewManager =
  globalPreviewManager.__claudable_preview_manager_v3__ ??
  (globalPreviewManager.__claudable_preview_manager_v3__ = new PreviewManager());

