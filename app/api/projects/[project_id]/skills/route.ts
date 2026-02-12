/**
 * Project Skills API Route
 * GET /api/projects/[project_id]/skills - List skills in project
 * POST /api/projects/[project_id]/skills - Create a new skill
 */

import { NextRequest, NextResponse } from 'next/server';
import { getProjectById } from '@/lib/services/project';
import {
  getActiveSkillsForProject,
  createSkill,
  listSkillNames,
} from '@/lib/services/skills';

interface RouteContext {
  params: Promise<{ project_id: string }>;
}

/**
 * GET /api/projects/[project_id]/skills
 * List all skills in a project
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { project_id } = await params;

    const project = await getProjectById(project_id);
    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    const skills = await getActiveSkillsForProject(project_id);

    return NextResponse.json({
      success: true,
      skills: skills.map(skill => ({
        name: skill.name,
        description: skill.description,
        path: skill.path,
      })),
    });
  } catch (error) {
    console.error('[API] Failed to list skills:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to list skills' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects/[project_id]/skills
 * Create a new skill in the project
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { project_id } = await params;
    const body = await request.json();

    const project = await getProjectById(project_id);
    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    const { name, description, content } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Skill name is required' },
        { status: 400 }
      );
    }

    // Validate skill name format (lowercase, hyphens only)
    const validNamePattern = /^[a-z0-9-]+$/;
    if (!validNamePattern.test(name)) {
      return NextResponse.json(
        { success: false, error: 'Skill name must be lowercase letters, numbers, and hyphens only' },
        { status: 400 }
      );
    }

    // Check if skill already exists
    const existingSkills = await listSkillNames(project_id);
    if (existingSkills.includes(name)) {
      return NextResponse.json(
        { success: false, error: 'Skill already exists' },
        { status: 409 }
      );
    }

    const skill = await createSkill(
      project_id,
      name,
      description || '',
      content || ''
    );

    return NextResponse.json({
      success: true,
      skill: {
        name: skill.name,
        description: skill.description,
        path: skill.path,
      },
    });
  } catch (error) {
    console.error('[API] Failed to create skill:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create skill' },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
