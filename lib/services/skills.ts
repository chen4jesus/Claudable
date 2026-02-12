/**
 * Skills Service - Load and manage project skills
 * 
 * Skills are folders containing SKILL.md files with YAML frontmatter (name, description)
 * and markdown instructions that are injected into Claude's system prompt.
 */

import fs from 'fs/promises';
import path from 'path';

const PROJECTS_DIR = process.env.PROJECTS_DIR || './data/projects';
const PROJECTS_DIR_ABSOLUTE = path.isAbsolute(PROJECTS_DIR)
  ? PROJECTS_DIR
  : path.resolve(process.cwd(), PROJECTS_DIR);

export interface Skill {
  name: string;
  description: string;
  content: string;
  path: string;
}

interface SkillFrontmatter {
  name?: string;
  description?: string;
}

/**
 * Parse YAML frontmatter from a SKILL.md file
 * Expected format:
 * ---
 * name: skill-name
 * description: What this skill does
 * ---
 * # Skill content...
 */
function parseSkillFile(fileContent: string, filePath: string): Skill | null {
  const frontmatterMatch = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  
  if (!frontmatterMatch) {
    // Try to parse as plain markdown without frontmatter
    const basename = path.basename(path.dirname(filePath));
    return {
      name: basename,
      description: '',
      content: fileContent.trim(),
      path: filePath,
    };
  }

  const [, frontmatterRaw, content] = frontmatterMatch;
  const frontmatter: SkillFrontmatter = {};

  // Simple YAML parsing for key: value pairs
  for (const line of frontmatterRaw.split(/\r?\n/)) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    
    const key = line.slice(0, colonIndex).trim().toLowerCase();
    let value = line.slice(colonIndex + 1).trim();
    
    // Remove surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    
    if (key === 'name') frontmatter.name = value;
    if (key === 'description') frontmatter.description = value;
  }

  const basename = path.basename(path.dirname(filePath));
  
  return {
    name: frontmatter.name || basename,
    description: frontmatter.description || '',
    content: content.trim(),
    path: filePath,
  };
}

/**
 * Load all skills from a project's skills directory
 * Skills are stored in: data/projects/{project_id}/skills/{skill-name}/SKILL.md
 */
export async function getActiveSkillsForProject(projectId: string): Promise<Skill[]> {
  const skillsDir = path.join(PROJECTS_DIR_ABSOLUTE, projectId, 'skills');
  const skills: Skill[] = [];

  try {
    await fs.access(skillsDir);
  } catch {
    // Skills directory doesn't exist, return empty array
    return skills;
  }

  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      
      const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
      
      try {
        const content = await fs.readFile(skillPath, 'utf-8');
        const skill = parseSkillFile(content, skillPath);
        
        if (skill) {
          skills.push(skill);
        }
      } catch {
        // SKILL.md doesn't exist in this directory, skip
        continue;
      }
    }
  } catch (error) {
    console.error(`[SkillsService] Failed to read skills directory for project ${projectId}:`, error);
  }

  return skills;
}

/**
 * Get a single skill by name from a project
 */
export async function getSkillByName(projectId: string, skillName: string): Promise<Skill | null> {
  const skillPath = path.join(PROJECTS_DIR_ABSOLUTE, projectId, 'skills', skillName, 'SKILL.md');
  
  try {
    const content = await fs.readFile(skillPath, 'utf-8');
    return parseSkillFile(content, skillPath);
  } catch {
    return null;
  }
}

/**
 * List all skill directories in a project (returns names only)
 */
export async function listSkillNames(projectId: string): Promise<string[]> {
  const skillsDir = path.join(PROJECTS_DIR_ABSOLUTE, projectId, 'skills');
  
  try {
    await fs.access(skillsDir);
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch {
    return [];
  }
}

/**
 * Create a new skill in a project
 */
export async function createSkill(
  projectId: string,
  name: string,
  description: string,
  content: string
): Promise<Skill> {
  const skillDir = path.join(PROJECTS_DIR_ABSOLUTE, projectId, 'skills', name);
  const skillPath = path.join(skillDir, 'SKILL.md');
  
  await fs.mkdir(skillDir, { recursive: true });
  
  const fileContent = `---
name: ${name}
description: ${description}
---

${content}
`;
  
  await fs.writeFile(skillPath, fileContent, 'utf-8');
  
  return {
    name,
    description,
    content,
    path: skillPath,
  };
}

/**
 * Delete a skill from a project
 */
export async function deleteSkill(projectId: string, skillName: string): Promise<boolean> {
  const skillDir = path.join(PROJECTS_DIR_ABSOLUTE, projectId, 'skills', skillName);
  
  try {
    await fs.rm(skillDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}
