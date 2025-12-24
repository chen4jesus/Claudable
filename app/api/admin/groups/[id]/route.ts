
import { NextRequest } from 'next/server';
import { getGroupById, updateGroup, deleteGroup, addUserToGroup, removeUserFromGroup, addProjectToGroup, removeProjectFromGroup } from '@/lib/services/groups';
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/utils/api-response';
import { getSession } from '@/lib/auth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || session.user.role !== 'admin') {
      return createErrorResponse('Unauthorized', undefined, 401);
    }
    const { id } = await params;
    const group = await getGroupById(id);
    if (!group) {
        return createErrorResponse('Group not found', undefined, 404);
    }
    return createSuccessResponse(group);
  } catch (error) {
    return handleApiError(error, 'API', 'Failed to fetch group');
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || session.user.role !== 'admin') {
      return createErrorResponse('Unauthorized', undefined, 401);
    }
    const { id } = await params;
    const body = await request.json();
    const group = await updateGroup(id, {
        name: body.name,
        description: body.description
    });
    return createSuccessResponse(group);
  } catch (error) {
    return handleApiError(error, 'API', 'Failed to update group');
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || session.user.role !== 'admin') {
      return createErrorResponse('Unauthorized', undefined, 401);
    }
    const { id } = await params;
    await deleteGroup(id);
    return createSuccessResponse({ success: true });
  } catch (error) {
    return handleApiError(error, 'API', 'Failed to delete group');
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || session.user.role !== 'admin') {
      return createErrorResponse('Unauthorized', undefined, 401);
    }
    const { id } = await params;
    const body = await request.json();
    
    if (body.action === 'add_user') {
        if (!body.userId) return createErrorResponse('userId required', undefined, 400);
        await addUserToGroup(id, body.userId);
        return createSuccessResponse({ success: true, message: 'User added' });
    } else if (body.action === 'remove_user') {
        if (!body.userId) return createErrorResponse('userId required', undefined, 400);
        await removeUserFromGroup(id, body.userId);
         return createSuccessResponse({ success: true, message: 'User removed' });
    } else if (body.action === 'add_project') {
        if (!body.projectId) return createErrorResponse('projectId required', undefined, 400);
        await addProjectToGroup(id, body.projectId);
        return createSuccessResponse({ success: true, message: 'Project added' });
    } else if (body.action === 'remove_project') {
        if (!body.projectId) return createErrorResponse('projectId required', undefined, 400);
        await removeProjectFromGroup(body.projectId);
         return createSuccessResponse({ success: true, message: 'Project removed' });
    } else {
        return createErrorResponse('Invalid action', undefined, 400);
    }
  } catch (error) {
    return handleApiError(error, 'API', 'Failed to update group relations');
  }
}

export const dynamic = 'force-dynamic';
