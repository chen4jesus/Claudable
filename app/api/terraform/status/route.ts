import { NextRequest, NextResponse } from 'next/server';
import { getProjectStatus } from '@/lib/services/terraform';

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  }

  const status = await getProjectStatus(projectId);
  return NextResponse.json(status);
}
