/**
 * POST /api/projects/[project_id]/preview/save-page - Save edited page with backup
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getProjectById } from '@/lib/services/project';
import { previewManager } from '@/lib/services/preview';
import { cleanupSmartEditScript, cleanupSmartEditContent } from '@/lib/services/smart-edit-utils';

interface RouteContext {
  params: Promise<{ project_id: string }>;
}

interface SavePageBody {
  path: string;
  content: string;
}

// Common template directories to search in for template-based projects (Flask, etc.)
const TEMPLATE_DIRS = [
  'app/templates/pages',
  'app/templates',
  'templates/pages',
  'templates',
  'app/pages', // For some Next.js structures
  'src/pages',
  'pages',
];

// Home page variations to try if requested file is not found
const HOME_SYNONYMS = ['index.html', 'home.html', 'landing.html', 'main.html'];

/**
 * Cleanup injected scripts from common layout/app files in the project
 */
async function cleanupInjectedFiles(projectId: string, projectRoot: string): Promise<void> {
  await cleanupSmartEditScript(projectRoot, (msg) => console.log(`[SavePage] [Cleanup] ${msg}`));
}


/**
 * Save edited page with backup
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { project_id } = await params;
    const body = await request.json() as SavePageBody;
    const { path: filePath, content } = body;

    if (!filePath || typeof filePath !== 'string') {
      return NextResponse.json(
        { success: false, error: 'path is required' },
        { status: 400 }
      );
    }

    if (typeof content !== 'string') {
      return NextResponse.json(
        { success: false, error: 'content must be a string' },
        { status: 400 }
      );
    }

    // Get project
    const project = await getProjectById(project_id);
    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    // Resolve project root
    const repoPath = project.repoPath || path.join('data', 'projects', project.id);
    const projectRoot = path.isAbsolute(repoPath)
      ? repoPath
      : path.resolve(process.cwd(), repoPath);

    // Normalize and validate path
    const normalizedPath = filePath.replace(/\\/g, '/').replace(/^\.?\/?/, '').replace(/\/+$/, '');
    const absolutePath = path.resolve(projectRoot, normalizedPath);
    
    // Security: Ensure path is within project
    if (!absolutePath.startsWith(projectRoot + path.sep) && absolutePath !== projectRoot) {
      return NextResponse.json(
        { success: false, error: 'Path traversal not allowed' },
        { status: 400 }
      );
    }

    // Check file exists
    let finalAbsolutePath = absolutePath;
    let fileFound = false;

    try {
      const stats = await fs.stat(finalAbsolutePath);
      if (stats.isFile()) {
        fileFound = true;
      }
    } catch {
      // Not found at root, try template directories
      console.log(`[SavePage] File not found at ${finalAbsolutePath}, searching template directories...`);
      
      const fileName = path.basename(normalizedPath);
      const isHomeFile = HOME_SYNONYMS.includes(fileName.toLowerCase());
      const candidates = isHomeFile ? HOME_SYNONYMS : [fileName];

      for (const tplDir of TEMPLATE_DIRS) {
        for (const cand of candidates) {
          const candidatePath = path.resolve(projectRoot, tplDir, cand);
          try {
            const stats = await fs.stat(candidatePath);
            if (stats.isFile()) {
              finalAbsolutePath = candidatePath;
              fileFound = true;
              console.log(`[SavePage] Found file in template directory: ${candidatePath}`);
              break;
            }
          } catch {
            // Continue searching
          }
        }
        if (fileFound) break;
      }
    }

    if (!fileFound) {
      return NextResponse.json(
        { success: false, error: `File not found: ${normalizedPath}` },
        { status: 404 }
      );
    }

    // Create backup (with injection markers removed)
    const backupDir = path.join(projectRoot, 'backups');
    await fs.mkdir(backupDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const actualFileName = path.basename(finalAbsolutePath);
    const backupFileName = `${actualFileName}.${timestamp}.bak`;
    const backupPath = path.join(backupDir, backupFileName);
    
    // Read original file, clean it, and save as backup
    const originalContent = await fs.readFile(finalAbsolutePath, 'utf-8');
    const cleanedBackup = cleanupSmartEditContent(originalContent);
    await fs.writeFile(backupPath, cleanedBackup, 'utf-8');
    console.log(`[SavePage] Created clean backup: ${backupPath}`);


    // Clean up AI_SMART_EDIT injection from content
    let cleanedContent = cleanupSmartEditContent(content);

    // Write new content
    await fs.writeFile(finalAbsolutePath, cleanedContent, 'utf-8');
    console.log(`[SavePage] Updated file: ${finalAbsolutePath}`);

    // Also cleanup layout.tsx and app.tsx if they exist (remove injected scripts)
    await cleanupInjectedFiles(project_id, projectRoot);

    // Re-inject for the active session (since we just cleaned it up from disk)
    try {
      await previewManager.injectRoute(project_id, normalizedPath);
    } catch (e) {
      console.warn(`[SavePage] Post-save injection failed: ${e}`);
    }

    return NextResponse.json({
      success: true,
      data: {
        path: path.relative(projectRoot, finalAbsolutePath).replace(/\\/g, '/'),
        backupPath: path.relative(projectRoot, backupPath).replace(/\\/g, '/'),
      },
    });
  } catch (error) {
    console.error('[API] Failed to save page:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save page',
      },
      { status: 500 }
    );
  }
}
