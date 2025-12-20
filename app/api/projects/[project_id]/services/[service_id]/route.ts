import { NextResponse } from 'next/server';
import { deleteProjectService, deleteProjectServiceByProvider } from '@/lib/services/project-services';

interface RouteContext {
  params: Promise<{ project_id: string; service_id: string }>;
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { service_id, project_id } = await params;
    
    // The frontend sends the provider name (e.g. 'github') as the service_id
    // So we try to delete by provider first
    const deleted = await deleteProjectServiceByProvider(project_id, service_id);
    
    if (!deleted) {
      // Fallback: try deleting by ID if it happens to be a UUID
      // This supports both provider names and direct IDs
      const deletedById = await deleteProjectService(service_id);
      if (!deletedById) {
        return NextResponse.json({ success: false, error: 'Service not found' }, { status: 404 });
      }
    }

    return NextResponse.json({ success: true, message: 'Service disconnected' });
  } catch (error) {
    console.error('[API] Failed to delete project service:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete project service',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
