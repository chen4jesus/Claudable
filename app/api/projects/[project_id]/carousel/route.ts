/**
 * POST /api/projects/[id]/carousel
 * Scrapes a YouTube playlist and injects a carousel into a project file.
 */

import { NextResponse } from 'next/server';
import { injectYoutubeCarousel } from '@/lib/services/youtube';

interface RouteContext {
  params: Promise<{ project_id: string }>;
}

export async function POST(
  request: Request,
  { params }: RouteContext
) {
  let projectIdForLog = 'unknown';
  try {
    const { project_id } = await params;
    projectIdForLog = project_id;
    
    const { filePath, playlistUrl, limit } = await request.json();

    if (!filePath || !playlistUrl) {
      return NextResponse.json(
        { success: false, error: 'filePath and playlistUrl are required' },
        { status: 400 }
      );
    }

    console.debug(`[API] Injecting YouTube carousel for project: ${project_id}, file: ${filePath}`);
    const result = await injectYoutubeCarousel(project_id, filePath, playlistUrl, limit || 6);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error(`[API] Failure injecting carousel for project ${projectIdForLog}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal Server Error',
        message:
          error instanceof Error ? error.message : 'Failed to inject carousel',
        stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined,
      },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
