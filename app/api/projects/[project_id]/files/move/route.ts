/**
 * POST /api/projects/[id]/files/move - Move or rename a file/directory
 */

import { NextRequest, NextResponse } from 'next/server';
import { moveProjectFile, FileBrowserError } from '@/lib/services/file-browser';

interface RouteContext {
  params: Promise<{ project_id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { project_id } = await params;
    const body = await request.json();
    const { oldPath, newPath } = body;

    if (!oldPath || typeof oldPath !== 'string') {
      return NextResponse.json(
        { success: false, error: 'oldPath is required' },
        { status: 400 }
      );
    }

    if (!newPath || typeof newPath !== 'string') {
      return NextResponse.json(
        { success: false, error: 'newPath is required' },
        { status: 400 }
      );
    }

    await moveProjectFile(project_id, oldPath, newPath);

    return NextResponse.json({
      success: true,
      data: { oldPath, newPath },
    });
  } catch (error) {
    if (error instanceof FileBrowserError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }

    console.error('[API] Failed to move project path:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to move project path',
      },
      { status: 500 }
    );
  }
}
