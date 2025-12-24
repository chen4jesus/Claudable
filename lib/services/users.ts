
import { prisma } from '@/lib/db/client';

export async function getAllUsers() {
  return await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      role: true,
      createdAt: true,
      groups: {
        select: { id: true, name: true },
      },
    },
    orderBy: { username: 'asc' },
  });
}

export async function getUserGroups(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      groups: {
        select: { id: true, name: true },
      },
    },
  });
  return user?.groups || [];
}
