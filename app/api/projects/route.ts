/**
 * Projects API Routes
 * GET /api/projects - Get all projects
 * POST /api/projects - Create new project
 */

import { NextRequest } from 'next/server';
import { getAllProjects, createProject } from '@/lib/services/project';
import type { CreateProjectInput } from '@/types/backend';
import { serializeProjects, serializeProject } from '@/lib/serializers/project';
import { getDefaultModelForCli, normalizeModelId } from '@/lib/constants/cliModels';
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/utils/api-response';

import { getSession } from '@/lib/auth';
import { getUserGroups } from '@/lib/services/users';

/**
 * GET /api/projects
 * Get all projects list
 */
export async function GET() {
  try {
    const session = await getSession();
    const userId = session?.user?.id;
    const isAdmin = session?.user?.role === 'admin';
    
    const projects = await getAllProjects(userId, isAdmin);
    return createSuccessResponse(serializeProjects(projects));
  } catch (error) {
    return handleApiError(error, 'API', 'Failed to fetch projects');
  }
}

/**
 * POST /api/projects
 * Create new project
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const preferredCli = String(body.preferredCli || body.preferred_cli || 'claude').toLowerCase();
    const requestedModel = body.selectedModel || body.selected_model;

    const session = await getSession();
    // Check if groupId was provided at all
    let groupId = body.hasOwnProperty('groupId') ? body.groupId : body.group_id;

    // Auto-assign to user's first group ONLY if not specified at all (undefined)
    // If it's null, it means the user explicitly chose 'Public'
    if (groupId === undefined && session?.user?.id) {
       const userGroups = await getUserGroups(session.user.id);
       if (userGroups.length > 0) {
          groupId = userGroups[0].id;
       }
    }

    const input: CreateProjectInput = {
      project_id: body.project_id,
      name: body.name,
      initialPrompt: body.initialPrompt || body.initial_prompt,
      preferredCli,
      selectedModel: normalizeModelId(preferredCli, requestedModel ?? getDefaultModelForCli(preferredCli)),
      description: body.description,
      templateType: body.templateType || body.template_type || 'fastapp',
      gitRepoUrl: body.gitRepoUrl || body.git_repo_url,
      groupId: groupId,
    } as any;

    // Validation
    if (!input.project_id || !input.name) {
      return createErrorResponse('project_id and name are required', undefined, 400);
    }

    const project = await createProject(input);
    return createSuccessResponse(serializeProject(project), 201);
  } catch (error) {
    return handleApiError(error, 'API', 'Failed to create project');
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
