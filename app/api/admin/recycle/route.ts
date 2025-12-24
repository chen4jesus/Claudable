import { NextRequest } from 'next/server';
import { previewManager } from '@/lib/services/preview';
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/utils/api-response';
import { getSession } from '@/lib/auth';

/**
 * POST /api/admin/recycle
 * Stops all running preview processes (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.user.role !== 'admin') {
      return createErrorResponse('Unauthorized', undefined, 401);
    }

    // Stop all preview processes
    await previewManager.stopAll();

    return createSuccessResponse({
      message: 'All preview processes have been stopped',
    });
  } catch (error) {
    return handleApiError(error, 'API', 'Failed to recycle preview processes');
  }
}

export const dynamic = 'force-dynamic';
