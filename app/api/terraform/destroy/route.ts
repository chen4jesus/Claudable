import { NextRequest, NextResponse } from 'next/server';
import { destroyProject } from '@/lib/services/terraform';
import { getPlainServiceToken } from '@/lib/services/tokens';

export async function POST(request: NextRequest) {
  try {
    const { projectId } = await request.json();

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }

    // Get Linode token
    const token = await getPlainServiceToken('linode');
    if (!token) {
        return NextResponse.json({ error: 'Linode token not found' }, { status: 400 });
    }

    const result = await destroyProject(projectId, token);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
