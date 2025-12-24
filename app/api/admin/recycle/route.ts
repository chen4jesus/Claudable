import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { previewManager } from '@/lib/services/preview';

/**
 * POST /api/admin/recycle
 * Stops all running preview processes (admin only)
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user is admin
    if (session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Admin access required' },
        { status: 403 }
      );
    }

    // Stop all preview processes
    await previewManager.stopAll();

    return NextResponse.json({
      success: true,
      message: 'All preview processes have been stopped',
    });
  } catch (error) {
    console.error('[API] Error in recycle endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to recycle preview processes' },
      { status: 500 }
    );
  }
}
