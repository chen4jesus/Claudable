/**
 * Gemini CLI Service
 * Integration with Google Gemini CLI (@google/gemini-cli) for AI agent functionality.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import type { Message } from '@/types/backend';
import type { RealtimeMessage } from '@/types';
import { streamManager } from '@/lib/services/stream';
import { createMessage } from '@/lib/services/message';
import { getProjectById } from '@/lib/services/project';
import { serializeMessage, createRealtimeMessage } from '@/lib/serializers/chat';
import { loadGlobalSettings } from '@/lib/services/settings';
import {
  markUserRequestAsRunning,
  markUserRequestAsCompleted,
  markUserRequestAsFailed,
} from '@/lib/services/user-requests';
import {
  GEMINI_DEFAULT_MODEL,
  getGeminiModelDisplayName,
  normalizeGeminiModelId,
} from '@/lib/constants/geminiModels';
import { getSystemPromptForProjectType } from '@/lib/constants/projectTypes';

const STATUS_LABELS: Record<string, string> = {
  starting: 'Initializing Gemini CLI...',
  ready: 'Gemini CLI ready',
  running: 'Gemini is processing your request...',
  completed: 'Gemini execution completed',
};

const AUTO_INSTRUCTIONS = `Act autonomously without waiting for confirmations.
You are the Gemini CLI assistant powered by Google's Gemini models.
Work directly inside the current workspace (Next.js App Router with TypeScript and Tailwind CSS).
Use available tools to read, modify, and create files.
Do not create new top-level directories unless explicitly requested.
Avoid running package managers or starting development servers; the platform handles previews.
Explain your intent briefly when helpful, then take concrete actions until the task is complete.`;

type StreamAccumulator = {
  id: string;
  content: string;
  createdAt: string;
  isStreaming: boolean;
};

async function ensureProjectPath(projectId: string, projectPath: string): Promise<string> {
  const project = await getProjectById(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const absolute = path.isAbsolute(projectPath)
    ? path.resolve(projectPath)
    : path.resolve(process.cwd(), projectPath);
  const allowedBasePath = path.resolve(process.cwd(), process.env.PROJECTS_DIR || './data/projects');
  const relativeToBase = path.relative(allowedBasePath, absolute);
  const isWithinBase = !relativeToBase.startsWith('..') && !path.isAbsolute(relativeToBase);
  if (!isWithinBase) {
    throw new Error(`Project path must be within ${allowedBasePath}. Got: ${absolute}`);
  }

  try {
    await fs.access(absolute);
  } catch {
    await fs.mkdir(absolute, { recursive: true });
  }

  return absolute;
}

async function appendProjectContext(baseInstruction: string, repoPath: string): Promise<string> {
  try {
    const entries = await fs.readdir(repoPath, { withFileTypes: true });
    const visible = entries
      .filter((entry) => !entry.name.startsWith('.git') && entry.name !== 'AGENTS.md')
      .map((entry) => entry.name);

    if (visible.length === 0) {
      return `${baseInstruction}

<current_project_context>
This is an empty project directory. Work directly in the current folder without creating extra subdirectories.
</current_project_context>`;
    }

    return `${baseInstruction}

<current_project_context>
Current files in project directory: ${visible.sort().join(', ')}
Work directly in the current directory. Do not create subdirectories unless specifically requested.
</current_project_context>`;
  } catch (error) {
    console.warn('[GeminiService] Failed to append project context:', error);
    return baseInstruction;
  }
}

function publishStatus(projectId: string, status: string, requestId?: string, message?: string) {
  streamManager.publish(projectId, {
    type: 'status',
    data: {
      status,
      message: message ?? STATUS_LABELS[status] ?? '',
      ...(requestId ? { requestId } : {}),
    },
  });
}

async function persistAssistantMessage(
  projectId: string,
  payload: {
    role: Message['role'];
    messageType: Message['messageType'];
    content: string;
    metadata?: Record<string, unknown> | null;
  },
  requestId?: string,
  overrides?: Partial<RealtimeMessage>,
) {
  let lastError: Error | null = null;

  // Retry logic with exponential backoff
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const saved = await createMessage({
        projectId,
        role: payload.role,
        messageType: payload.messageType,
        content: payload.content,
        metadata: payload.metadata ?? null,
        cliSource: 'gemini',
        requestId,
      });

      streamManager.publish(projectId, {
        type: 'message',
        data: serializeMessage(saved, {
          ...(requestId ? { requestId } : {}),
          ...(overrides ?? {}),
        }),
      });

      console.log(`[GeminiService] Successfully persisted message on attempt ${attempt}`);
      return; // Success, exit the function
    } catch (error) {
      lastError = error as Error;
      console.error(`[GeminiService] Attempt ${attempt} failed to persist assistant message:`, error);

      if (attempt < 3) {
        // Exponential backoff: 1s, 2s
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        console.log(`[GeminiService] Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  // All retries failed, fallback to realtime emit
  console.error('[GeminiService] All retry attempts failed. Falling back to realtime emit:', lastError);
  const fallback = createRealtimeMessage({
    projectId,
    role: payload.role,
    messageType: payload.messageType,
    content: payload.content,
    metadata: payload.metadata ?? null,
    cliSource: 'gemini',
    requestId,
    ...(overrides ?? {}),
  });
  streamManager.publish(projectId, {
    type: 'message',
    data: fallback,
  });
}

async function persistToolMessage(
  projectId: string,
  content: string,
  metadata: Record<string, unknown>,
  requestId?: string,
  options: { persist?: boolean; isStreaming?: boolean; messageType?: 'tool_use' | 'tool_result' } = {},
) {
  const trimmed = content.trim();
  if (!trimmed) return;

  const { persist = true, isStreaming = false, messageType = 'tool_use' } = options;
  const enrichedMetadata: Record<string, unknown> = {
    cli_type: 'gemini',
    ...metadata,
  };

  if (!persist) {
    const realtime = createRealtimeMessage({
      projectId,
      role: 'tool',
      messageType,
      content: trimmed,
      metadata: enrichedMetadata,
      cliSource: 'gemini',
      requestId,
      isStreaming,
      isFinal: !isStreaming,
    });
    streamManager.publish(projectId, { type: 'message', data: realtime });
    return;
  }

  await persistAssistantMessage(
    projectId,
    {
      role: 'tool',
      messageType,
      content: trimmed,
      metadata: enrichedMetadata,
    },
    requestId,
    { isStreaming, isFinal: !isStreaming },
  );
}

function createStreamAccumulator(requestId?: string): StreamAccumulator {
  return {
    id: requestId ? `gemini-stream-${requestId}` : `gemini-stream-${randomUUID()}`,
    content: '',
    createdAt: new Date().toISOString(),
    isStreaming: false,
  };
}

function emitStreamingUpdate(projectId: string, accumulator: StreamAccumulator, requestId?: string, isFinal: boolean = false) {
  const realtime = createRealtimeMessage({
    id: accumulator.id,
    projectId,
    role: 'assistant',
    messageType: 'chat',
    content: accumulator.content,
    metadata: { cli_type: 'gemini' },
    cliSource: 'gemini',
    requestId,
    createdAt: accumulator.createdAt,
    isStreaming: !isFinal,
    isFinal,
    isOptimistic: true,
  });
  streamManager.publish(projectId, { type: 'message', data: realtime });
  accumulator.isStreaming = !isFinal;
}

/**
 * Execute a command using Gemini CLI
 * 
 * Uses the @google/gemini-cli command-line tool to interact with Gemini models.
 */
export async function executeGemini(
  projectId: string,
  projectPath: string,
  instruction: string,
  model: string = GEMINI_DEFAULT_MODEL,
  sessionId?: string,
  requestId?: string,
  projectType?: string
): Promise<void> {
  const normalizedModel = normalizeGeminiModelId(model);
  const modelDisplayName = getGeminiModelDisplayName(normalizedModel);

  console.log(`\n========================================`);
  console.log(`[GeminiService] 🚀 Starting Gemini CLI`);
  console.log(`[GeminiService] Project: ${projectId}`);
  console.log(`[GeminiService] Model: ${modelDisplayName} [${normalizedModel}]`);
  console.log(`[GeminiService] Session ID: ${sessionId || 'new session'}`);
  console.log(`[GeminiService] Instruction: ${instruction.substring(0, 100)}...`);
  console.log(`========================================\n`);

  let configuredApiKey: string | undefined;
  try {
    const globalSettings = await loadGlobalSettings();
    const geminiSettings = globalSettings.cli_settings?.gemini;
    if (geminiSettings && typeof geminiSettings === 'object') {
      const candidate = (geminiSettings as Record<string, unknown>).apiKey;
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        configuredApiKey = candidate.trim();
      }
    }

    // Fallback to process.env if not in settings
    if (!configuredApiKey) {
      if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0) {
        configuredApiKey = process.env.GEMINI_API_KEY.trim();
      } else if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY.trim().length > 0) {
        configuredApiKey = process.env.GOOGLE_API_KEY.trim();
      }
    }

    // STRICT VALIDATION
    if (!configuredApiKey) {
      throw new Error('No Gemini API key found. Please configure it in Settings -> AI Agents -> Gemini CLI, or set GEMINI_API_KEY in your .env file.');
    }

    if (!configuredApiKey.startsWith('AIza')) {
      console.warn('[GeminiService] Warning: API key does not start with "AIza". It might be invalid.');
      // We don't throw here just in case, but we log a strong warning
    }

    if (configuredApiKey.length < 30) {
      throw new Error(`Gemini API key seems too short (length: ${configuredApiKey.length}). Please check your settings.`);
    }

  } catch (error) {
    console.warn('[GeminiService] Settings/Key Error:', error);
    // Re-throw if it's our validation error so it stops execution
    if (error instanceof Error && error.message.includes('API key')) {
      throw error;
    }
  }

  if (configuredApiKey) {
    console.log(`[GeminiService] API Key configured from settings (length: ${configuredApiKey.length})`);
    console.log(`[GeminiService] Key prefix: ${configuredApiKey.substring(0, 4)}***`);
  } else {
    console.log('[GeminiService] No API key found in global settings. Checking process.env...');
    if (process.env.GEMINI_API_KEY) console.log('[GeminiService] Found GEMINI_API_KEY in process.env');
    if (process.env.GOOGLE_API_KEY) console.log('[GeminiService] Found GOOGLE_API_KEY in process.env');
  }

  publishStatus(projectId, 'starting', requestId);
  if (requestId) {
    await markUserRequestAsRunning(requestId);
  }

  const absoluteProjectPath = await ensureProjectPath(projectId, projectPath);
  const repoPath = await (async () => {
    const candidate = path.join(absoluteProjectPath, 'repo');
    try {
      const stats = await fs.stat(candidate);
      if (stats.isDirectory()) {
        return candidate;
      }
    } catch {
      // ignore
    }
    return absoluteProjectPath;
  })();

  publishStatus(projectId, 'ready', requestId, `Gemini detected (${modelDisplayName}). Starting execution...`);

  const systemPrompt = getSystemPromptForProjectType(projectType);
  const promptBase = `${systemPrompt ? systemPrompt + '\n\n' : ''}${AUTO_INSTRUCTIONS}\n\n${instruction}`.trim();
  const promptWithContext = await appendProjectContext(promptBase, repoPath);

  const accumulator = createStreamAccumulator(requestId);
  const stderrBuffer: string[] = [];
  const emittedToolMessages = new Set<string>();

  const emitToolMessage = async (
    content: string,
    metadata: Record<string, unknown>,
    options: { persist?: boolean; isStreaming?: boolean; messageType?: 'tool_use' | 'tool_result' } = {},
  ) => {
    const baseMetadata = {
      ...metadata,
    };

    const toolIdentifier =
      (typeof baseMetadata.toolUseId === 'string' && baseMetadata.toolUseId) ||
      (typeof baseMetadata.tool_name === 'string' && baseMetadata.tool_name) ||
      (typeof baseMetadata.toolName === 'string' && baseMetadata.toolName) ||
      '';
    const messageType = options.messageType ?? 'tool_use';
    const trimmedContent = content.trim();
    const dedupeKey = `${messageType}|${toolIdentifier}|${trimmedContent}`;

    if (dedupeKey.trim().length > 0) {
      if (emittedToolMessages.has(dedupeKey)) {
        return;
      }
      emittedToolMessages.add(dedupeKey);
    }

    await persistToolMessage(projectId, content, baseMetadata, requestId, options);
  };

  // Prepare environment - spread process.env and add Gemini keys
  const env = {
    ...process.env,
    ...(configuredApiKey ? { 
      GEMINI_API_KEY: configuredApiKey, 
      GOOGLE_API_KEY: configuredApiKey 
    } : {}),
  };

  // DEBUG: verify environment variables before spawn
  console.log('[GeminiService] Environment check:');
  console.log(`[GeminiService] GEMINI_API_KEY present: ${Boolean(env.GEMINI_API_KEY)}`);
  console.log(`[GeminiService] GOOGLE_API_KEY present: ${Boolean(env.GOOGLE_API_KEY)}`);
  if (env.GOOGLE_API_KEY) {
    console.log(`[GeminiService] GOOGLE_API_KEY prefix: ${env.GOOGLE_API_KEY.substring(0, 4)}***`);
  }

  // Declare args outside try block for error reporting
  let geminiArgs: string[] = [];

  try {
    publishStatus(projectId, 'running', requestId);

    // Spawn the Gemini CLI process
    // The gemini-cli can be invoked via npx or if installed globally
    geminiArgs = [
      promptWithContext, // Positional prompt
      '--model', normalizedModel,
      '--sandbox', 'false', // Allow file system access
    ];

    // Add session resume if available
    if (sessionId) {
      geminiArgs.push('--resume', sessionId);
    }

    console.log('[GeminiService] Spawning Gemini CLI with args:', geminiArgs.slice(0, 4).join(' '), '...');

    let geminiProcess: ChildProcess;
    
    // Try to run via npx first, fall back to global installation
    try {
      geminiProcess = spawn('npx', ['@google/gemini-cli', ...geminiArgs], {
        cwd: repoPath,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      });
    } catch {
      // Fallback to direct gemini command
      geminiProcess = spawn('gemini', geminiArgs, {
        cwd: repoPath,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      });
    }

    let outputBuffer = '';
    let currentSessionId: string | undefined = sessionId;

    // Handle stdout streaming
    geminiProcess.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      outputBuffer += chunk;
      
      // Parse streaming output
      const lines = outputBuffer.split('\n');
      outputBuffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Try to parse as JSON for structured output
        try {
          const parsed = JSON.parse(trimmed);
          
          if (parsed.type === 'session_start' && parsed.sessionId) {
            currentSessionId = parsed.sessionId;
            console.log(`[GeminiService] Session started: ${currentSessionId}`);
            
            // Note: Gemini session ID tracking would require adding activeGeminiSessionId to the project schema
            // For now, just log the session
            console.log(`[GeminiService] Session ID available for future resume: ${currentSessionId}`);
          } else if (parsed.type === 'text' || parsed.type === 'content') {
            const text = parsed.text || parsed.content || '';
            if (text) {
              accumulator.content += text;
              emitStreamingUpdate(projectId, accumulator, requestId, false);
            }
          } else if (parsed.type === 'tool_use' || parsed.type === 'tool_call') {
            const toolName = parsed.name || parsed.tool || 'tool';
            emitToolMessage(
              `Using tool: ${toolName}`,
              { toolName, tool_name: toolName, toolInput: parsed.input || parsed.args },
              { persist: false, isStreaming: true, messageType: 'tool_use' }
            );
          } else if (parsed.type === 'tool_result') {
            const toolName = parsed.name || parsed.tool || 'tool';
            const result = parsed.result || parsed.output || '';
            emitToolMessage(
              typeof result === 'string' ? result : JSON.stringify(result),
              { toolName, tool_name: toolName },
              { persist: true, isStreaming: false, messageType: 'tool_result' }
            );
          } else if (parsed.type === 'complete' || parsed.type === 'done') {
            // Final message
            if (accumulator.content.trim()) {
              emitStreamingUpdate(projectId, accumulator, requestId, true);
            }
          }
        } catch {
          // Not JSON, treat as plain text output
          if (trimmed.startsWith('[Tool:') || trimmed.startsWith('Using tool:')) {
            const toolMatch = trimmed.match(/(?:\[Tool:\s*|\bUsing tool:\s*)([^\]]+)/i);
            if (toolMatch) {
              emitToolMessage(
                trimmed,
                { toolName: toolMatch[1], tool_name: toolMatch[1] },
                { persist: false, isStreaming: true, messageType: 'tool_use' }
              );
            }
          } else if (trimmed.startsWith('Tool result:')) {
            emitToolMessage(
              trimmed,
              {},
              { persist: true, isStreaming: false, messageType: 'tool_result' }
            );
          } else {
            // Regular content
            accumulator.content += trimmed + '\n';
            emitStreamingUpdate(projectId, accumulator, requestId, false);
          }
        }
      }
    });

    // Handle stderr
    geminiProcess.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trimEnd();
      if (line) {
        if (stderrBuffer.length > 200) stderrBuffer.shift();
        stderrBuffer.push(line);
        console.error(`[GeminiService][stderr] ${line}`);
      }
    });

    // Wait for process to complete
    await new Promise<void>((resolve, reject) => {
      geminiProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Gemini CLI process exited with code ${code}`));
        }
      });

      geminiProcess.on('error', (err) => {
        reject(err);
      });
    });

    // Process remaining buffer
    if (outputBuffer.trim()) {
      accumulator.content += outputBuffer.trim();
    }

    // Finalize and persist
    if (accumulator.content.trim().length > 0) {
      emitStreamingUpdate(projectId, accumulator, requestId, true);
      await persistAssistantMessage(
        projectId,
        {
          role: 'assistant',
          messageType: 'chat',
          content: accumulator.content.trim(),
          metadata: { cli_type: 'gemini' },
        },
        requestId,
        { isStreaming: false, isFinal: true, isOptimistic: false },
      );
      accumulator.content = '';
    }

    publishStatus(projectId, 'completed', requestId);
    if (requestId) {
      await markUserRequestAsCompleted(requestId);
    }
  } catch (error) {
    const stderrTail = stderrBuffer.slice(-15).join('\n');
    let errorMessage =
      error instanceof Error
        ? error.message
        : stderrTail || 'Gemini CLI execution failed';

    const hasTail = Boolean(stderrTail);

    if (/process exited with code\s+\d+/i.test(errorMessage)) {
      const exitCodeMatch = errorMessage.match(/process exited with code\s+(\d+)/i);
      const exitCode = exitCodeMatch?.[1] ?? '1';
      errorMessage = [
        `Gemini CLI exited with code ${exitCode}.`,
        'Verify the Gemini CLI is installed and authenticated:',
        '1. Install: `npm install -g @google/gemini-cli`',
        '2. Authenticate: Run `gemini` and follow the authentication prompts',
        '3. Ensure a valid Gemini API key is configured (Settings → AI Agents → Gemini CLI or set `GEMINI_API_KEY`)',
      ].join('\n');
    } else if (/ENOENT|command not found|no such file or directory/i.test(errorMessage)) {
      errorMessage = [
        'Unable to launch Gemini CLI.',
        'Ensure the Gemini CLI is installed and available on your PATH:',
        '- Install: `npm install -g @google/gemini-cli`',
        '- Or run using npx: `npx @google/gemini-cli`',
        '- Restart the application after installation',
      ].join('\n');
    } else if (/auth|unauthorized|invalid.*key/i.test(errorMessage)) {
      errorMessage = [
        'Gemini CLI authentication required.',
        'Please authenticate by running `gemini` in your terminal and following the prompts.',
        'Alternatively, set the GEMINI_API_KEY environment variable.',
      ].join('\n');
    }

    if (hasTail && !errorMessage.includes('Detailed log:')) {
      errorMessage = `${errorMessage}\n\nDetailed log:\n${stderrTail}`;
    }

    // Append API Key debug info to the error message shown to the user
    if (errorMessage.includes('API key')) {
       const keyDebug = configuredApiKey 
         ? `(Key used: ${configuredApiKey.substring(0, 4)}...${configuredApiKey.substring(configuredApiKey.length - 4)}, Length: ${configuredApiKey.length})` 
         : '(No Key configured)';
       errorMessage = `${errorMessage}\n\nDebug Info: passed key ${keyDebug}`;
    }

    // Add reproduction command for user (PowerShell compatible since user is on Windows)
    const geminiCmd = `npx @google/gemini-cli ${geminiArgs.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`;
    const reproCmd = `$env:GEMINI_API_KEY='${configuredApiKey || 'YOUR_KEY'}'; ${geminiCmd}`;
    errorMessage = `${errorMessage}\n\nReproduction Command (PowerShell):\n${reproCmd}`;

    publishStatus(projectId, 'completed', requestId, 'Gemini CLI execution ended with errors');
    if (requestId) {
      await markUserRequestAsFailed(requestId, errorMessage);
    }

    await persistAssistantMessage(
      projectId,
      {
        role: 'assistant',
        messageType: 'chat',
        content: `⚠️ Gemini CLI reported an error:\n${errorMessage}`,
        metadata: { cli_type: 'gemini', error: true },
      },
      requestId,
      { isStreaming: false, isFinal: true, isOptimistic: false },
    );

    throw error instanceof Error ? error : new Error(errorMessage);
  }
}

/**
 * Initialize a new project using Gemini CLI
 */
export async function initializeNextJsProject(
  projectId: string,
  projectPath: string,
  initialPrompt: string,
  model: string = GEMINI_DEFAULT_MODEL,
  requestId?: string,
  projectType?: string
): Promise<void> {
  const typeLabel = projectType || 'nextjs';
  console.log(`[GeminiService] Initializing ${typeLabel} project: ${projectId}`);

  // Create prompt based on project type
  let fullPrompt: string;
  
  if (projectType === 'static-html') {
    fullPrompt = `
Create a new static HTML website with the following requirements:
${initialPrompt}

Use semantic HTML5, modern CSS, and vanilla JavaScript.
Set up a clean file structure (index.html, styles.css, script.js).
Make it responsive and accessible.
`.trim();
  } else if (projectType === 'react') {
    fullPrompt = `
Create a new React application with the following requirements:
${initialPrompt}

Use React 18+, TypeScript, and Tailwind CSS.
Set up the basic project structure and implement the requested features.
`.trim();
  } else if (projectType === 'vue') {
    fullPrompt = `
Create a new Vue.js application with the following requirements:
${initialPrompt}

Use Vue 3 with Composition API, TypeScript, and Tailwind CSS.
Set up the basic project structure and implement the requested features.
`.trim();
  } else if (projectType === 'flask') {
    fullPrompt = `
Create a new Flask application with the following requirements:
${initialPrompt}

Use Flask 3 with Python 3.x, and set up the basic project structure and implement the requested features.
`.trim();
  } else {
    // Default to Next.js
    fullPrompt = `
Create a new Next.js 15 application with the following requirements:
${initialPrompt}

Use App Router, TypeScript, and Tailwind CSS.
Set up the basic project structure and implement the requested features.
`.trim();
  }

  await executeGemini(projectId, projectPath, fullPrompt, model, undefined, requestId, projectType);
}

/**
 * Apply changes to an existing project using Gemini CLI
 */
export async function applyChanges(
  projectId: string,
  projectPath: string,
  instruction: string,
  model: string = GEMINI_DEFAULT_MODEL,
  sessionId?: string,
  requestId?: string,
  projectType?: string,
): Promise<void> {
  console.log(`[GeminiService] Applying changes to project: ${projectId}`);
  await executeGemini(projectId, projectPath, instruction, model, sessionId, requestId, projectType);
}
