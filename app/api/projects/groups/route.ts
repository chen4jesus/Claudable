
import { NextRequest } from 'next/server';
import { getUserGroups } from '@/lib/services/users';
import { createSuccessResponse, handleApiError } from '@/lib/utils/api-response';
import { getSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !session.user) {
      return createSuccessResponse([], 200); // Or 401
    }
    const groups = await getUserGroups(session.user.id);
    return createSuccessResponse(groups);
  } catch (error) {
    return handleApiError(error, 'API', 'Failed to fetch user groups');
  }
}

export const dynamic = 'force-dynamic';
