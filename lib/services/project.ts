/**
 * Project Service - Project management logic
 */

import { prisma } from '@/lib/db/client';
import type { Project, CreateProjectInput, UpdateProjectInput } from '@/types/backend';
import fs from 'fs/promises';
import path from 'path';
import { normalizeModelId, getDefaultModelForCli } from '@/lib/constants/cliModels';
import { upsertProjectServiceConnection } from '@/lib/services/project-services';
import { getGithubUser } from '@/lib/services/github';

const PROJECTS_DIR = process.env.PROJECTS_DIR || './data/projects';
const PROJECTS_DIR_ABSOLUTE = path.isAbsolute(PROJECTS_DIR)
  ? PROJECTS_DIR
  : path.resolve(process.cwd(), PROJECTS_DIR);

/**
 * Retrieve all projects
 */
export async function getAllProjects(userId?: string, isAdmin?: boolean): Promise<Project[]> {
  let whereClause = {};

  if (userId && !isAdmin) {
    // Determine which projects the user can see
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { groups: { select: { id: true } } },
    });
    
    const userGroupIds = user?.groups.map(g => g.id) || [];
    
    whereClause = {
      OR: [
        { groupId: null }, // Publicly available (or legacy)
        { groupId: { in: userGroupIds } },
      ],
    };
  }

  const projects = await prisma.project.findMany({
    where: whereClause,
    orderBy: {
      lastActiveAt: 'desc',
    },
    include: {
      group: {
         select: { name: true }
      }
    }
  });

  return projects.map(project => ({
    ...project,
    selectedModel: normalizeModelId(project.preferredCli ?? 'claude', project.selectedModel ?? undefined),
    groupName: project.group?.name
  })) as Project[];
}

/**
 * Retrieve project by ID
 */
export async function getProjectById(id: string): Promise<Project | null> {
  const project = await prisma.project.findUnique({
    where: { id },
  });
  if (!project) return null;
  return {
    ...project,
    selectedModel: normalizeModelId(project.preferredCli ?? 'claude', project.selectedModel ?? undefined),
  } as Project;
}

/**
 * Create new project
 */
export async function createProject(input: CreateProjectInput): Promise<Project> {
  // Validate project ID format (Enforce p-XXXXXXXX for DNS/Routing stability)
  if (!input.project_id.startsWith('p-') || input.project_id.length > 20) {
    throw new Error('Invalid project ID format. Must start with "p-" and be less than 20 characters.');
  }

  // Create project directory
  const projectPath = path.join(PROJECTS_DIR_ABSOLUTE, input.project_id);
  
  // Handle Git clone or directory creation
  if (input.templateType === 'git-import' && input.gitRepoUrl) {
    try {
      console.debug(`[ProjectService] Cloning git repo ${input.gitRepoUrl} to ${projectPath}`);
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      // Clone into the target directory
      await execAsync(`git clone "${input.gitRepoUrl}" "${projectPath}"`);
      
      // Remove .git directory to detach from origin (optional, but usually desired for a new project start)
      // await fs.rm(path.join(projectPath, '.git'), { recursive: true, force: true });
      
    } catch (error) {
      console.error(`[ProjectService] Failed to clone git repo:`, error);
      // Clean up if clone failed
      await fs.rm(projectPath, { recursive: true, force: true }).catch(() => {});
      throw new Error(`Failed to clone repository: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    // Standard directory creation for templates
    await fs.mkdir(projectPath, { recursive: true });
  }

  // Create project in database
  const project = await prisma.project.create({
    data: {
      id: input.project_id,
      name: input.name,
      description: input.description,
      initialPrompt: input.initialPrompt,
      repoPath: projectPath,
      gitRepoUrl: input.gitRepoUrl,
      preferredCli: input.preferredCli || 'claude',
      selectedModel: normalizeModelId(input.preferredCli || 'claude', input.selectedModel ?? getDefaultModelForCli(input.preferredCli || 'claude')),
      status: 'idle',
      fallbackEnabled: false,
      templateType: input.templateType || 'nextjs',
      lastActiveAt: new Date(),
      previewUrl: null,
      previewPort: null,
      groupId: (input as any).groupId || null,
    } as any,
    include: {
      group: {
        select: { name: true }
      }
    }
  });

  // Handle GitHub Auto-Connect for Git Imports
  if (input.templateType === 'git-import' && input.gitRepoUrl) {
    try {
      const gitUrl = input.gitRepoUrl;
      let repoName = '';
      let username = '';

      // Simple parsing for GitHub URLs
      // Expected formats: https://github.com/user/repo, https://github.com/user/repo.git
      const urlParts = gitUrl.replace(/\.git$/, '').split('/');
      if (urlParts.length >= 2) {
        repoName = urlParts[urlParts.length - 1];
        username = urlParts[urlParts.length - 2];
      }

      const fullRepoName = username && repoName ? `${username}/${repoName}` : repoName || gitUrl;

      // Verify GitHub Token before connecting
      try {
        await getGithubUser();
        
        // Retry loop for DB connection to handle potential locks
        let connected = false;
        let retries = 3;
        while (retries > 0 && !connected) {
          try {
            await upsertProjectServiceConnection(project.id, 'github', {
              repo_url: gitUrl,
              repo_name: fullRepoName,
              clone_url: gitUrl, // Required for push
              username: username,
              owner: username, // Required for push (matches 'username' for personal repos)
              default_branch: 'main', // Default assumption
            });
            connected = true;
            console.debug(`[ProjectService] Auto-connected GitHub service for ${project.id}`);
          } catch (dbError) {
            retries--;
            console.warn(`[ProjectService] Failed to auto-connect GitHub service (attempt ${3 - retries}/3):`, dbError);
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
            }
          }
        }
        
        if (!connected) {
           console.error(`[ProjectService] Failed to auto-connect GitHub service after multiple attempts.`);
        }
      } catch (authError) {
        console.warn(`[ProjectService] GitHub token verification failed. Skipping auto-connect.`, authError);
      }
    } catch (error) {
      console.warn(`[ProjectService] Error in auto-connect logic:`, error);
    }
  }

  console.debug(`[ProjectService] Created project: ${project.id}`);
  return {
    ...project,
    selectedModel: normalizeModelId(project.preferredCli ?? 'claude', project.selectedModel ?? undefined),
  } as Project;
}

/**
 * Update project
 */
export async function updateProject(
  id: string,
  input: UpdateProjectInput
): Promise<Project> {
  const existing = await prisma.project.findUnique({
    where: { id },
    select: { preferredCli: true },
  });
  const targetCli = input.preferredCli ?? existing?.preferredCli ?? 'claude';
  const normalizedModel = input.selectedModel
    ? normalizeModelId(targetCli, input.selectedModel)
    : undefined;

  const project = await prisma.project.update({
    where: { id },
    data: {
      ...input,
      ...(input.selectedModel
        ? { selectedModel: normalizedModel }
        : {}),
      ...((input as any).groupId !== undefined
        ? { groupId: (input as any).groupId }
        : {}),
      updatedAt: new Date(),
    },
  });

  console.debug(`[ProjectService] Updated project: ${id}`);
  return {
    ...project,
    selectedModel: normalizeModelId(project.preferredCli ?? 'claude', project.selectedModel ?? undefined),
  } as Project;
}

/**
 * Delete project
 */
export async function deleteProject(id: string): Promise<void> {
  // Delete project directory
  const project = await getProjectById(id);
  if (project?.repoPath) {
    try {
      await fs.rm(project.repoPath, { 
        recursive: true, 
        force: true,
        maxRetries: 5,
        retryDelay: 500
      });
    } catch (error) {
      console.warn(`[ProjectService] Failed to delete project directory:`, error);
    }
  }

  // Delete project from database (related data automatically deleted via Cascade)
  await prisma.project.delete({
    where: { id },
  });

  console.debug(`[ProjectService] Deleted project: ${id}`);
}

/**
 * Update project activity time
 */
export async function updateProjectActivity(id: string): Promise<void> {
  await prisma.project.update({
    where: { id },
    data: {
      lastActiveAt: new Date(),
    },
  });
}

/**
 * Update project status
 */
export async function updateProjectStatus(
  id: string,
  status: 'idle' | 'running' | 'stopped' | 'error'
): Promise<void> {
  await prisma.project.update({
    where: { id },
    data: {
      status,
      updatedAt: new Date(),
    },
  });
  console.debug(`[ProjectService] Updated project status: ${id} -> ${status}`);
}

export interface ProjectCliPreference {
  preferredCli: string;
  fallbackEnabled: boolean;
  selectedModel: string | null;
}

export async function getProjectCliPreference(projectId: string): Promise<ProjectCliPreference | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      preferredCli: true,
      fallbackEnabled: true,
      selectedModel: true,
    },
  });

  if (!project) {
    return null;
  }

  return {
    preferredCli: project.preferredCli ?? 'claude',
    fallbackEnabled: project.fallbackEnabled ?? false,
    selectedModel: normalizeModelId(project.preferredCli ?? 'claude', project.selectedModel ?? undefined),
  };
}

export async function updateProjectCliPreference(
  projectId: string,
  input: Partial<ProjectCliPreference>
): Promise<ProjectCliPreference> {
  const existing = await prisma.project.findUnique({
    where: { id: projectId },
    select: { preferredCli: true },
  });
  const targetCli = input.preferredCli ?? existing?.preferredCli ?? 'claude';

  const result = await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(input.preferredCli ? { preferredCli: input.preferredCli } : {}),
      ...(typeof input.fallbackEnabled === 'boolean'
        ? { fallbackEnabled: input.fallbackEnabled }
        : {}),
      ...(input.selectedModel
        ? { selectedModel: normalizeModelId(targetCli, input.selectedModel) }
        : input.selectedModel === null
        ? { selectedModel: null }
        : {}),
      updatedAt: new Date(),
    },
    select: {
      preferredCli: true,
      fallbackEnabled: true,
      selectedModel: true,
    },
  });

  return {
    preferredCli: result.preferredCli ?? 'claude',
    fallbackEnabled: result.fallbackEnabled ?? false,
    selectedModel: normalizeModelId(result.preferredCli ?? 'claude', result.selectedModel ?? undefined),
  };
}
