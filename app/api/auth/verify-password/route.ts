import { getSession } from '@/lib/auth';
import { prisma as db } from '@/lib/db/client';
import { verifyPassword } from '@/lib/password';
import { NextResponse } from 'next/server';

/**
 * POST /api/auth/verify-password
 * Verifies the current user's password for sensitive operations
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { password } = await request.json();
    
    if (!password) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    // Get the user from database
    const user = await db.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify password
    const isValid = verifyPassword(password, user.password);
    
    if (!isValid) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 403 });
    }

    return NextResponse.json({ success: true, verified: true });
  } catch (error) {
    console.error('Password verification error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
