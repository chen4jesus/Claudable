
import { NextRequest } from 'next/server';
import { getAllUsers } from '@/lib/services/users';
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/utils/api-response';
import { getSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.user.role !== 'admin') {
      return createErrorResponse('Unauthorized', undefined, 401);
    }
    const users = await getAllUsers();
    return createSuccessResponse(users);
  } catch (error) {
    return handleApiError(error, 'API', 'Failed to fetch users');
  }
}

export const dynamic = 'force-dynamic';
