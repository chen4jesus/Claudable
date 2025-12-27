import { NextRequest, NextResponse } from 'next/server';
import { getAllInjections, createInjection } from '@/lib/services/prompt-injections';
import { decrypt } from '@/lib/auth';

async function isAdmin(request: NextRequest) {
  const session = request.cookies.get('session')?.value;
  if (!session) return false;
  try {
    const payload = await decrypt(session);
    return payload?.user?.role === 'admin';
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  if (!await isAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const injections = await getAllInjections();
    return NextResponse.json({ success: true, data: injections });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch injections' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!await isAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const injection = await createInjection(body);
    return NextResponse.json({ success: true, data: injection });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create injection' }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
