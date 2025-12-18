
import { NextResponse } from 'next/server';
import { previewManager } from '@/lib/services/preview';

interface RouteContext {
  params: Promise<{ project_id: string }>;
}

export async function POST(
  request: Request,
  { params }: RouteContext
) {
  try {
    const { project_id } = await params;
    const body = await request.json();
    const { route } = body;

    if (!route || typeof route !== 'string') {
        return NextResponse.json({ success: false, error: 'Route is required' }, { status: 400 });
    }

    const { injected, detectedRoute } = await previewManager.injectRoute(project_id, route);

    return NextResponse.json({
      success: true,
      injected,
      detectedRoute
    });
  } catch (error) {
    console.error('[API] Failed to inject script:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to inject script',
      },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
