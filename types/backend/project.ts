/**
 * Project-related types
 */

export type ProjectStatus = 'idle' | 'running' | 'stopped' | 'error';

export type TemplateType = 'nextjs' | 'static-html' | 'react' | 'vue' | 'custom' | 'flask' | 'fastapp' | 'git-import';

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  /**
   * Preview metadata (nullable when no dev server is running).
   */
  previewUrl?: string | null;
  previewPort?: number | null;
  repoPath?: string;
  gitRepoUrl?: string | null;
  initialPrompt?: string;
  templateType?: TemplateType;
  activeClaudeSessionId?: string;
  activeCursorSessionId?: string;
  preferredCli?: string;
  selectedModel?: string;
  fallbackEnabled: boolean;
  settings?: string; // JSON string
  createdAt: Date;
  updatedAt: Date;
  lastActiveAt: Date;
  groupId: string | null;
  groupName?: string | null;
}

export interface CreateProjectInput {
  project_id: string;
  name: string;
  initialPrompt: string;
  preferredCli?: string;
  selectedModel?: string;
  description?: string;
  templateType?: TemplateType;
  gitRepoUrl?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  /**
   * Legacy preview metadata retained for backward compatibility.
   */
  previewUrl?: string | null;
  previewPort?: number | null;
  preferredCli?: string;
  selectedModel?: string;
  settings?: string;
  activeClaudeSessionId?: string;
  activeCursorSessionId?: string;
  repoPath?: string | null;
}

export interface ProjectSettings {
  theme?: 'light' | 'dark' | 'system';
  autoSave?: boolean;
  [key: string]: any;
}
