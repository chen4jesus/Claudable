import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { getSourceFragmentBySrcId } from '@/lib/services/smart-edit-utils';
import { getProjectById } from '@/lib/services/project';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ project_id: string }> }
) {
  try {
    const { project_id: projectId } = await params;
    const { searchParams } = new URL(req.url);
    const srcId = searchParams.get('srcId');

    if (!srcId) {
      return NextResponse.json({ error: 'srcId is required' }, { status: 400 });
    }

    // Look up the project to get the correct path (may have a custom repoPath)
    const project = await getProjectById(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const repoPath = project.repoPath || path.join('data', 'projects', project.id);
    const projectPath = path.isAbsolute(repoPath)
      ? repoPath
      : path.resolve(process.cwd(), repoPath);
    const fragment = await getSourceFragmentBySrcId(projectPath, srcId);

    return NextResponse.json({ success: true, data: { fragment } });
  } catch (error) {
    console.error('[FragmentAPI] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch source fragment' },
      { status: 500 }
    );
  }
}
