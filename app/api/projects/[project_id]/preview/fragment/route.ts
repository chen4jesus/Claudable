import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { getSourceFragmentBySrcId } from '@/lib/services/smart-edit-utils';

export async function GET(
  req: NextRequest,
  { params }: { params: { project_id: string } }
) {
  try {
    const projectId = params.project_id;
    const { searchParams } = new URL(req.url);
    const srcId = searchParams.get('srcId');

    if (!srcId) {
      return NextResponse.json({ error: 'srcId is required' }, { status: 400 });
    }

    const projectPath = path.join(process.cwd(), 'projects', projectId);
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
