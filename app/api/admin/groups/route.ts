
import { NextRequest } from 'next/server';
import { getAllGroups, createGroup } from '@/lib/services/groups';
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/utils/api-response';
import { getSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.user.role !== 'admin') {
      return createErrorResponse('Unauthorized', undefined, 401);
    }
    const groups = await getAllGroups();
    return createSuccessResponse(groups);
  } catch (error) {
    return handleApiError(error, 'API', 'Failed to fetch groups');
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.user.role !== 'admin') {
      return createErrorResponse('Unauthorized', undefined, 401);
    }
    const body = await request.json();
    if (!body.name) {
      return createErrorResponse('Name is required', undefined, 400);
    }
    const group = await createGroup({
      name: body.name,
      description: body.description,
    });
    return createSuccessResponse(group, 201);
  } catch (error) {
    return handleApiError(error, 'API', 'Failed to create group');
  }
}

export const dynamic = 'force-dynamic';
