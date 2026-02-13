/**
 * POST /api/projects/[project_id]/skills/upload - Upload skills.zip to the project
 * 
 * Accepts a zip file containing skill folders (each with SKILL.md).
 * Extracts to the project's skills/ directory.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getProjectById } from '@/lib/services/project';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

// AdmZip will be dynamically required

interface RouteContext {
  params: Promise<{ project_id: string }>;
}

const PROJECTS_DIR = process.env.PROJECTS_DIR || './data/projects';
const PROJECTS_DIR_ABSOLUTE = path.isAbsolute(PROJECTS_DIR)
  ? PROJECTS_DIR
  : path.resolve(process.cwd(), PROJECTS_DIR);

/**
 * Simple zip extraction using built-in modules
 */
async function extractZipToDirectory(
  zipBuffer: Buffer,
  targetDir: string
): Promise<{ extractedFolders: string[]; errors: string[] }> {
  const extractedFolders: string[] = [];
  const errors: string[] = [];
  
  try {
    // Try to use AdmZip as it's more commonly available
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();
    
    for (const entry of entries) {
      const entryPath = entry.entryName;
      
      // Skip Mac OS metadata files
      if (entryPath.includes('__MACOSX') || entryPath.includes('.DS_Store')) {
        continue;
      }
      
      // Security: prevent path traversal
      if (entryPath.includes('..')) {
        errors.push(`Skipped unsafe path: ${entryPath}`);
        continue;
      }
      
      const targetPath = path.join(targetDir, entryPath);
      
      // Ensure path is within target directory
      if (!targetPath.startsWith(targetDir + path.sep) && targetPath !== targetDir) {
        errors.push(`Skipped path outside target: ${entryPath}`);
        continue;
      }
      
      if (entry.isDirectory) {
        await fs.mkdir(targetPath, { recursive: true });
        // Track top-level folders (skill folders)
        const topLevelFolder = entryPath.split('/')[0];
        if (topLevelFolder && !extractedFolders.includes(topLevelFolder)) {
          extractedFolders.push(topLevelFolder);
        }
      } else {
        // Ensure parent directory exists
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        // Write file
        await fs.writeFile(targetPath, entry.getData());
        
        // Track which skill folder this belongs to
        const topLevelFolder = entryPath.split('/')[0];
        if (topLevelFolder && !extractedFolders.includes(topLevelFolder)) {
          extractedFolders.push(topLevelFolder);
        }
      }
    }
  } catch (error) {
    throw new Error(
      `Failed to extract zip. Please install 'adm-zip' package: npm install adm-zip`
    );
  }
  
  return { extractedFolders, errors };
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { project_id } = await params;

    const project = await getProjectById(project_id);
    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    // Parse the multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.name.endsWith('.zip')) {
      return NextResponse.json(
        { success: false, error: 'Only .zip files are accepted' },
        { status: 400 }
      );
    }

    // Limit file size (10MB max)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      );
    }

    // Get the skills directory for this project
    const skillsDir = path.join(PROJECTS_DIR_ABSOLUTE, project_id, 'skills');
    
    // Create skills directory if it doesn't exist
    await fs.mkdir(skillsDir, { recursive: true });

    // Read the zip file
    const zipBuffer = Buffer.from(await file.arrayBuffer());

    // Extract the zip file
    const { extractedFolders, errors } = await extractZipToDirectory(zipBuffer, skillsDir);

    // Check which folders contain valid skills (have SKILL.md)
    const validSkills: string[] = [];
    const invalidFolders: string[] = [];

    for (const folder of extractedFolders) {
      const skillMdPath = path.join(skillsDir, folder, 'SKILL.md');
      try {
        await fs.access(skillMdPath);
        validSkills.push(folder);
      } catch {
        invalidFolders.push(folder);
      }
    }

    console.log(`[SkillsUpload] Project ${project_id}: Extracted ${validSkills.length} skills, ${invalidFolders.length} folders without SKILL.md`);

    return NextResponse.json({
      success: true,
      data: {
        extractedSkills: validSkills,
        invalidFolders: invalidFolders.length > 0 ? invalidFolders : undefined,
        warnings: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error) {
    console.error('[API] Failed to upload skills zip:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload skills',
      },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
