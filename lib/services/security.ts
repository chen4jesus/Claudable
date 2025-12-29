/**
 * Security Service - Path validation and access control
 */

import path from 'path';

const PROJECTS_DIR = process.env.PROJECTS_DIR || './data/projects';
const PROJECTS_DIR_ABSOLUTE = path.isAbsolute(PROJECTS_DIR)
  ? PROJECTS_DIR
  : path.resolve(process.cwd(), PROJECTS_DIR);

/**
 * Validates that a target path is safely contained within a project's directory.
 * Prevents directory traversal and access to files outside the project scope.
 * 
 * @param targetPath - The path to validate (absolute or relative)
 * @param projectId - The unique identifier for the project
 * @returns The absolute, validated path
 * @throws Error if the path is invalid or outside the allowed project directory
 */
export function validateSafePath(targetPath: string, projectId: string): string {
  if (!targetPath) {
    throw new Error('Target path is required');
  }

  // Define the allowed project root
  const projectRoot = path.join(PROJECTS_DIR_ABSOLUTE, projectId);
  
  // Resolve the target path relative to the current working directory or as an absolute path
  const absoluteTarget = path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(process.cwd(), targetPath);

  // Check if the absolute target path starts with the project root
  const relativeFromRoot = path.relative(projectRoot, absoluteTarget);
  
  const isWithinRoot = !relativeFromRoot.startsWith('..') && !path.isAbsolute(relativeFromRoot);

  if (!isWithinRoot) {
    throw new Error(`Security Violation: Path traversal detected or access outside project directory denied. Target: ${targetPath}`);
  }

  return absoluteTarget;
}

/**
 * Validates that a target path is safely contained within the general projects directory.
 * 
 * @param targetPath - The path to validate
 * @returns The absolute, validated path
 * @throws Error if the path is outside the projects directory
 */
export function validateProjectRootAccess(targetPath: string): string {
  const absoluteTarget = path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(process.cwd(), targetPath);

  const relativeFromBase = path.relative(PROJECTS_DIR_ABSOLUTE, absoluteTarget);
  const isWithinBase = !relativeFromBase.startsWith('..') && !path.isAbsolute(relativeFromBase);

  if (!isWithinBase) {
    throw new Error(`Security Violation: Access denied to path outside projects directory. Target: ${targetPath}`);
  }

  return absoluteTarget;
}

/**
 * Checks if a given path is safely contained within any of the allowed paths.
 * 
 * @param targetPath - The path to validate
 * @param allowedPaths - Array of allowed directory paths
 * @returns true if the path is within one of the allowed paths
 */
function isPathAllowed(targetPath: string, allowedPaths: string[]): boolean {
  const absoluteTarget = path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(process.cwd(), targetPath);

  for (const allowedPath of allowedPaths) {
    const absoluteAllowed = path.isAbsolute(allowedPath)
      ? path.resolve(allowedPath)
      : path.resolve(process.cwd(), allowedPath);
    
    const relativeFromAllowed = path.relative(absoluteAllowed, absoluteTarget);
    const isWithin = !relativeFromAllowed.startsWith('..') && !path.isAbsolute(relativeFromAllowed);
    
    if (isWithin) {
      return true;
    }
  }
  
  return false;
}

/**
 * Creates a security interceptor for the Claude Agent SDK (canUseTool handler).
 * This handler auto-allows safe operations within allowed paths and denies anything outside.
 * 
 * @param projectId - The project ID (used for fallback to project data directory)
 * @param allowedPaths - Optional array of additional allowed paths (e.g., working directory)
 * @returns A CanUseTool compatible function
 */
export function createSecurityInterceptor(projectId: string, allowedPaths?: string[]) {
  // Build the list of all allowed paths
  const projectRoot = path.join(PROJECTS_DIR_ABSOLUTE, projectId);
  const allAllowedPaths = [projectRoot, ...(allowedPaths || [])];

  return async (toolName: string, input: Record<string, unknown>, options: any): Promise<any> => {
    // 1. Validate file-based tools that use 'file_path' or 'notebook_path'
    const pathField = input.file_path || input.notebook_path || input.path;
    if (pathField && typeof pathField === 'string') {
      if (!isPathAllowed(pathField, allAllowedPaths)) {
        return {
          behavior: 'deny',
          message: `Security Violation: Access to ${pathField} is denied. AI agents are restricted to the project directory.`
        };
      }
    }

    // 2. Validate Bash commands for obvious escapes
    if (toolName === 'Bash' && typeof input.command === 'string') {
      const command = input.command;
      
      // Block directory traversal in command (checking for both / and \ styles)
      if (command.includes('../') || command.includes('..\\')) {
         return {
           behavior: 'deny',
           message: 'Security Violation: Directory traversal (../ or ..\\) in shell commands is restricted.'
         };
      }

      // Catch explicit root access like "ls /", "> /file", or "| /cmd"
      // but ignore "./" or relative paths which are fine
      if (command.match(/(?:^|[\s;&|><])\/($|[\s\t\n\r"'])/)) {
        return {
          behavior: 'deny',
          message: 'Security Violation: Access to the root directory (/) is restricted.'
        };
      }
      
      // Block known dangerous system paths (Windows and Unix)
      // These are system directories outside of any user project
      const dangerousPathRegex = /([a-zA-Z]:[\\\/](?:Windows|Program Files|System32)[^ \t\n\r"']*|\/(?:bin|boot|dev|etc|lib|lib64|proc|run|sbin|sys|usr\/(?:bin|sbin|lib))[^ \t\n\r"']*)/gi;
      const dangerousMatches = command.match(dangerousPathRegex);
      
      if (dangerousMatches) {
        for (const m of dangerousMatches) {
          return {
            behavior: 'deny',
            message: `Security Violation: Command contains a restricted system path: ${m}`
          };
        }
      }
    }

    // 3. Auto-allow everything else
    return {
      behavior: 'allow',
      updatedInput: input
    };
  };
}
