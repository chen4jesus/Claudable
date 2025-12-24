
import { prisma } from '@/lib/db/client';

export interface CreateGroupInput {
  name: string;
  description?: string;
}

export interface UpdateGroupInput {
  name?: string;
  description?: string;
}

export async function getAllGroups() {
  return await prisma.group.findMany({
    include: {
      _count: {
        select: { users: true, projects: true },
      },
    },
    orderBy: { name: 'asc' },
  });
}

export async function getGroupById(id: string) {
  return await prisma.group.findUnique({
    where: { id },
    include: {
      users: {
        select: { id: true, username: true, role: true },
      },
      projects: {
        select: { id: true, name: true },
      },
    },
  });
}

export async function createGroup(input: CreateGroupInput) {
  return await prisma.group.create({
    data: input,
  });
}

export async function updateGroup(id: string, input: UpdateGroupInput) {
  return await prisma.group.update({
    where: { id },
    data: input,
  });
}

export async function deleteGroup(id: string) {
  return await prisma.group.delete({
    where: { id },
  });
}

export async function addUserToGroup(groupId: string, userId: string) {
  return await prisma.group.update({
    where: { id: groupId },
    data: {
      users: {
        connect: { id: userId },
      },
    },
  });
}

export async function removeUserFromGroup(groupId: string, userId: string) {
  return await prisma.group.update({
    where: { id: groupId },
    data: {
      users: {
        disconnect: { id: userId },
      },
    },
  });
}

export async function addProjectToGroup(groupId: string, projectId: string) {
  return await prisma.project.update({
    where: { id: projectId },
    data: {
      groupId: groupId,
    },
  });
}

export async function removeProjectFromGroup(projectId: string) {
  return await prisma.project.update({
    where: { id: projectId },
    data: {
      groupId: null,
    },
  });
}
