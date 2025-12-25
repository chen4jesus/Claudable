/**
 * Generate a unique project ID
 */
export function generateProjectId(): string {
  // Enforce latest shortened pattern: p-XXXXXXXX
  return `p-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Validate project name
 */
export function validateProjectName(name: string): boolean {
  // Allow alphanumeric, hyphens, underscores, spaces
  // Min length: 1, Max length: 50
  const regex = /^[a-zA-Z0-9-_ ]{1,50}$/;
  return regex.test(name);
}
