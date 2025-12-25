import type { Project as ProjectEntity } from '@/types/backend';
import type { Project } from '@/types';

export function serializeProject(project: ProjectEntity & { group?: { name: string } | null }): Project {
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? null,
    status: project.status,
    previewUrl: (() => {
      // Logic to determine if we should show the public subdomain URL or the internal one
      if (project.previewPort && process.env.NEXT_PUBLIC_APP_URL) {
        try {
          const appUrl = new URL(process.env.NEXT_PUBLIC_APP_URL);
          // If we are in a production-like environment (not localhost), use subdomains
          if (appUrl.hostname !== 'localhost' && appUrl.hostname !== '127.0.0.1') {
            // protocol is usually https: in production
            return `${appUrl.protocol}//${project.id}.${appUrl.hostname}`;
          }
        } catch (e) {
          // Fallback to stored URL if parsing fails
        }
      }
      return project.previewUrl ?? null;
    })(),
    previewPort: project.previewPort ?? null,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    lastActiveAt: project.lastActiveAt ? project.lastActiveAt.toISOString() : null,
    initialPrompt: project.initialPrompt ?? null,
    preferredCli: (project.preferredCli ?? null) as Project['preferredCli'],
    selectedModel: project.selectedModel ?? null,
    templateType: project.templateType ?? 'nextjs',
    fallbackEnabled: project.fallbackEnabled,
    groupId: project.groupId ?? null,
    groupName: project.group?.name ?? (project.groupId ? null : 'Public')
  };
}

export function serializeProjects(projects: ProjectEntity[]): Project[] {
  return projects.map((project) => serializeProject(project));
}
