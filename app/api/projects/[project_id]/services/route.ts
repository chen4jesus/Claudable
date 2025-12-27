import { NextResponse } from 'next/server';
import { listProjectServices } from '@/lib/services/project-services';

interface RouteContext {
  params: Promise<{ project_id: string }>;
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { project_id } = await params;
    const services = await listProjectServices(project_id);
    
    // Check for global Linode token and add as a "virtual" service if present
    const { getPlainServiceToken } = await import('@/lib/services/tokens');
    const linodeToken = await getPlainServiceToken('linode');
    
    const payload = services.map((service) => ({
      ...service,
      service_data: service.serviceData,
    }));

    if (linodeToken) {
      // Only add virtual service if one doesn't already exist in the DB
      const hasLinode = services.some(s => s.provider === 'linode');
      if (!hasLinode) {
        payload.push({
          id: 'virtual-linode',
          projectId: project_id,
          provider: 'linode',
          status: 'connected',
          createdAt: new Date(),
          updatedAt: new Date(),
          serviceData: {},
          service_data: {},
        } as any);
      }
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error('[API] Failed to load project services:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to load project services',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { project_id } = await params;
    const body = await request.json();
    const { provider, serviceData } = body;

    if (!provider || !serviceData) {
      return NextResponse.json(
        { error: 'Provider and serviceData are required' },
        { status: 400 }
      );
    }

    const { upsertProjectServiceConnection } = await import('@/lib/services/project-services');
    const result = await upsertProjectServiceConnection(project_id, provider, serviceData);

    return NextResponse.json({
      ...result,
      service_data: result.serviceData
    });
  } catch (error) {
    console.error('[API] Failed to save project service:', error);
    return NextResponse.json(
      { error: 'Failed to save service configuration' },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
