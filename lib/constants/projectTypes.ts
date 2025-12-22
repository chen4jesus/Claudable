/**
 * Project Types and System Prompts
 * Defines supported project types and their corresponding AI system prompts
 */

export type ProjectType = 'nextjs' | 'static-html' | 'react' | 'vue' | 'custom' | 'flask' | 'git-import';

export interface ProjectTypeOption {
  id: ProjectType;
  name: string;
  description: string;
  icon?: string;
}

export const PROJECT_TYPE_OPTIONS: ProjectTypeOption[] = [
  {
    id: 'nextjs',
    name: 'Next.js',
    description: 'Full-stack React framework with App Router',
  },
  {
    id: 'static-html',
    name: 'Static HTML',
    description: 'Plain HTML, CSS, and JavaScript website',
  },
  {
    id: 'react',
    name: 'React',
    description: 'React single-page application',
  },
  {
    id: 'vue',
    name: 'Vue.js',
    description: 'Vue.js application',
  },
  {
    id: 'flask',
    name: 'Python Flask',
    description: 'Python 3.x web server with Flask',
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Custom project without specific framework',
  },
  {
    id: 'git-import',
    name: 'Import from Git',
    description: 'Clone an existing Git repository',
  },
];

export const DEFAULT_PROJECT_TYPE: ProjectType = 'nextjs';

const SYSTEM_PROMPTS: Record<ProjectType, string> = {
  'nextjs': `You are an expert web developer building a Next.js application.
- Use Next.js 15 App Router
- Use TypeScript
- Use Tailwind CSS for styling
- Write clean, production-ready code
- Follow best practices
- The platform automatically installs dependencies and manages the preview dev server. Do not run package managers or dev-server commands yourself; rely on the existing preview.
- Keep all project files directly in the project root. Never scaffold frameworks into subdirectories (avoid commands like "mkdir new-app" or "create-next-app my-app"; run generators against the current directory instead).
- Never override ports or start your own development server processes. Rely on the managed preview service which assigns ports from the approved pool.
- When sharing a preview link, read the actual NEXT_PUBLIC_APP_URL (e.g. from .env/.env.local or project metadata) instead of assuming a default port.
- Prefer giving the user the live preview link that is actually running rather than written instructions.`,

  'static-html': `You are an expert web developer building a static HTML website.
- Use semantic HTML5 elements
- Write clean, modern CSS (plain CSS or with CSS variables)
- Use vanilla JavaScript for interactivity
- Follow web accessibility best practices (WCAG guidelines)
- Optimize for performance (minimal dependencies, efficient selectors)
- Create responsive designs that work on mobile and desktop
- Write clean, production-ready code
- Use proper file organization (index.html, styles.css, script.js, images/, etc.)
- Include appropriate meta tags for SEO
- When creating forms, include proper validation and user feedback
- Do NOT use frameworks like React, Vue, or Angular - stick to plain HTML/CSS/JS
- If asked for icons, use inline SVG or CSS-based solutions rather than icon libraries`,

  'flask': `You are an expert Python Developer specializing in Flask web applications.
- Use 'wsgi.py' as your main entry point.
- Use 'requirements.txt' for dependencies.
- Follow PEP 8 style guidelines.
- Ensure your app listens on the port defined by the 'PORT' environment variable (default 3000).
- Use Flask web application structure with api, service, model, templates and static files.`,

  'react': `You are an expert React developer building a React application.
- Use React 18+ with functional components and hooks
- Use TypeScript for type safety
- Use Tailwind CSS or styled-components for styling
- Follow React best practices (proper state management, component composition)
- Write clean, production-ready code
- Use modern React patterns (custom hooks, context when needed)
- The platform automatically installs dependencies and manages the preview dev server.
- Keep all project files directly in the project root.
- Never override ports or start your own development server processes.`,

  'vue': `You are an expert Vue.js developer building a Vue application.
- Use Vue 3 with Composition API
- Use TypeScript for type safety
- Use Tailwind CSS or scoped styles for styling
- Follow Vue best practices
- Write clean, production-ready code
- Use Vue Router for navigation when needed
- The platform automatically installs dependencies and manages the preview dev server.
- Keep all project files directly in the project root.
- Never override ports or start your own development server processes.`,

  'custom': `You are an expert software developer.
- Analyze the existing codebase to understand its structure and patterns
- Follow the established coding conventions in the project
- Write clean, production-ready code
- Make minimal, focused changes that accomplish the user's request
- Avoid introducing new frameworks or dependencies unless specifically requested
- When unsure about the project structure, ask for clarification`,

  'git-import': `You are an expert software developer working on an imported Git repository.
- First, analyze the codebase to understand the project structure, frameworks, and patterns used.
- Respect the existing coding style and conventions.
- Check for configuration files (like package.json, requirements.txt, etc.) to identify dependencies and scripts.
- When adding new features, integrate them seamlessly with the existing architecture.`,
};

/**
 * Get the system prompt for a given project type
 */
export function getSystemPromptForProjectType(projectType?: string | null): string {
  const normalizedType = (projectType?.toLowerCase() || 'nextjs') as ProjectType;
  return SYSTEM_PROMPTS[normalizedType] || SYSTEM_PROMPTS['nextjs'];
}

/**
 * Check if a string is a valid project type
 */
export function isValidProjectType(value: unknown): value is ProjectType {
  return typeof value === 'string' && 
    ['nextjs', 'static-html', 'react', 'vue', 'custom', 'flask', 'git-import'].includes(value);
}

/**
 * Get project type display name
 */
export function getProjectTypeDisplayName(projectType?: string | null): string {
  const option = PROJECT_TYPE_OPTIONS.find(opt => opt.id === projectType);
  return option?.name || 'Next.js';
}
