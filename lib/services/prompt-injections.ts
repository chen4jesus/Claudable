import { prisma } from '@/lib/db/client';
import { PromptInjection } from '@prisma/client';

export type InjectionPoint = 'INIT_PROMPT' | 'CHAT_MESSAGE';
export type InjectionPosition = 'BEFORE' | 'AFTER' | 'REPLACE';

export async function getActiveInjections(point: InjectionPoint, templateType?: string): Promise<PromptInjection[]> {
  const where: any = {
    injectionPoint: point,
    isEnabled: true,
  };

  // If templateType is provided, fetch rules that match the type OR have no type (global)
  if (templateType) {
    where.OR = [
      { templateType: templateType },
      { templateType: null },
      { templateType: '' },
    ];
  } else {
    // If no templateType provided, only fetch global rules
    where.OR = [
      { templateType: null },
      { templateType: '' },
    ];
  }

  return prisma.promptInjection.findMany({
    where,
    orderBy: {
      createdAt: 'asc',
    },
  });
}

export async function applyInjections(text: string, point: InjectionPoint, templateType?: string): Promise<string> {
  const injections = await getActiveInjections(point, templateType);
  
  if (injections.length === 0) {
    return text;
  }

  let result = text;

  for (const injection of injections) {
    const content = `#####Read the following system prompts before you act#####\n\n${injection.content}\n\n#####End of system prompts#####`;
    const position = injection.position as InjectionPosition;

    switch (position) {
      case 'BEFORE':
        result = `${content}\n\n${result}`;
        break;
      case 'AFTER':
        result = `${result}\n\n${content}`;
        break;
      case 'REPLACE':
        result = content;
        break;
    }
  }

  return result;
}

export async function getAllInjections() {
  return prisma.promptInjection.findMany({
    orderBy: {
      createdAt: 'desc',
    },
  });
}

export async function createInjection(data: {
  name: string;
  content: string;
  injectionPoint: string;
  templateType?: string | null;
  position?: string;
  isEnabled?: boolean;
}) {
  return prisma.promptInjection.create({
    data,
  });
}

export async function updateInjection(id: string, data: Partial<{
  name: string;
  content: string;
  injectionPoint: string;
  templateType: string | null;
  position: string;
  isEnabled: boolean;
}>) {
  return prisma.promptInjection.update({
    where: { id },
    data,
  });
}

export async function deleteInjection(id: string) {
  return prisma.promptInjection.delete({
    where: { id },
  });
}
