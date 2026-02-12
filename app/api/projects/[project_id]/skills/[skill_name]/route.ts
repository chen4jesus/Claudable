/**
 * Individual Skill API Route
 * GET /api/projects/[project_id]/skills/[skill_name] - Get skill details
 * DELETE /api/projects/[project_id]/skills/[skill_name] - Delete a skill
 */

import { NextRequest, NextResponse } from 'next/server';
import { getProjectById } from '@/lib/services/project';
import { getSkillByName, deleteSkill } from '@/lib/services/skills';

interface RouteContext {
  params: Promise<{ project_id: string; skill_name: string }>;
}

/**
 * GET /api/projects/[project_id]/skills/[skill_name]
 * Get a specific skill's details including content
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { project_id, skill_name } = await params;

    const project = await getProjectById(project_id);
    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    const skill = await getSkillByName(project_id, skill_name);
    if (!skill) {
      return NextResponse.json(
        { success: false, error: 'Skill not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      skill: {
        name: skill.name,
        description: skill.description,
        content: skill.content,
        path: skill.path,
      },
    });
  } catch (error) {
    console.error('[API] Failed to get skill:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get skill' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[project_id]/skills/[skill_name]
 * Delete a skill from the project
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { project_id, skill_name } = await params;

    const project = await getProjectById(project_id);
    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    const success = await deleteSkill(project_id, skill_name);
    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Failed to delete skill' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Failed to delete skill:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete skill' },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
