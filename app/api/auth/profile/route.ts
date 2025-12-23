import { prisma as db } from '@/lib/db/client';
import { getSession, hashPassword, verifyPassword } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Current and new passwords are required' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify current password
    if (!verifyPassword(currentPassword, user.password)) {
      return NextResponse.json({ error: 'Incorrect current password' }, { status: 400 });
    }

    // Update to new password
    await db.user.update({
      where: { id: user.id },
      data: {
        password: hashPassword(newPassword),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update profile:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
