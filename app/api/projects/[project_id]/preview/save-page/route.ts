/**
 * POST /api/projects/[project_id]/preview/save-page - Save edited page with backup
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getProjectById } from '@/lib/services/project';
import { previewManager } from '@/lib/services/preview';
import { cleanupSmartEditScript, cleanupSmartEditContent, applyGranularChanges } from '@/lib/services/smart-edit-utils';

interface RouteContext {
  params: Promise<{ project_id: string }>;
}

interface SavePageBody {
  path: string;
  content: string;
  changes?: any[];
}

// Common template directories to search in for template-based projects (Flask, FastAPI, etc.)
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

    // --- Grouping changes by file ---
    const filesToUpdate = new Map<string, any[]>();
    
    if (body.changes && Array.isArray(body.changes)) {
      for (const change of body.changes) {
        let changeFilePath = normalizedPath; // Default to main path
        
        if (change.srcId && change.srcId.includes('::')) {
          changeFilePath = change.srcId.split('::')[0];
        }
        
        if (!filesToUpdate.has(changeFilePath)) {
          filesToUpdate.set(changeFilePath, []);
        }
        filesToUpdate.get(changeFilePath)!.push(change);
      }
    } else {
      // Fallback: update the main file with the full content if no granular changes
      filesToUpdate.set(normalizedPath, []);
    }

    const updatedFiles: string[] = [];
    const savedBackups: string[] = [];

    // --- Process each file ---
    for (const [relPath, fileChanges] of filesToUpdate.entries()) {
      let targetAbsolutePath = path.resolve(projectRoot, relPath);
      let found = false;

      // Try relative path first
      try {
        const stats = await fs.stat(targetAbsolutePath);
        if (stats.isFile()) found = true;
      } catch {
        // Search in template directories
        const fileName = path.basename(relPath);
        const candidates = HOME_SYNONYMS.includes(fileName.toLowerCase()) ? HOME_SYNONYMS : [fileName];
        for (const tplDir of TEMPLATE_DIRS) {
          for (const cand of candidates) {
            const candPath = path.resolve(projectRoot, tplDir, cand);
            try {
              const s = await fs.stat(candPath);
              if (s.isFile()) {
                targetAbsolutePath = candPath;
                found = true;
                break;
              }
            } catch {}
          }
          if (found) break;
        }
      }

      if (!found) {
        console.warn(`[SavePage] Could not locate file to update: ${relPath}`);
        continue;
      }

      // Create backup
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const actualFileName = path.basename(targetAbsolutePath);
      const backupDir = path.join(projectRoot, 'backups');
      await fs.mkdir(backupDir, { recursive: true });
      const backupPath = path.join(backupDir, `${actualFileName}.${timestamp}.bak`);
      
      const originalFileContent = await fs.readFile(targetAbsolutePath, 'utf-8');
      const cleanedBackup = cleanupSmartEditContent(originalFileContent);
      await fs.writeFile(backupPath, cleanedBackup, 'utf-8');
      savedBackups.push(path.relative(projectRoot, backupPath).replace(/\\/g, '/'));

      // Apply changes
      let contentToWrite: string;
      if (fileChanges.length > 0) {
        console.log(`[SavePage] Applying ${fileChanges.length} changes to ${relPath}...`);
        contentToWrite = applyGranularChanges(originalFileContent, fileChanges, relPath);
        contentToWrite = cleanupSmartEditContent(contentToWrite);
      } else if (relPath === normalizedPath) {
        // If it's the main file and no granular changes, use the provided full content
        // CRITICAL: Prevent layout files (base.html, layout.tsx, etc.) from being overwritten with 
        // full rendered HTML, which causes "flattening" and duplication.
        const isLayoutFile = /base\.html$|layout\.(tsx|js|html)$|main\.html$|_app\.(tsx|js)$|header\.html$|footer\.html$/.test(relPath.toLowerCase());
        if (isLayoutFile) {
          console.warn(`[SavePage] Skipping full content write for layout file: ${relPath}. Only granular changes allowed.`);
          continue;
        }
        contentToWrite = cleanupSmartEditContent(content);
      } else {
        // Skip files that have no changes and aren't the main file
        continue;
      }

      await fs.writeFile(targetAbsolutePath, contentToWrite, 'utf-8');
      updatedFiles.push(path.relative(projectRoot, targetAbsolutePath).replace(/\\/g, '/'));
      console.log(`[SavePage] Updated file: ${targetAbsolutePath}`);

      // Sync the shadow baseline for the next edit session
      try {
        const relativeTarget = path.relative(projectRoot, targetAbsolutePath).replace(/\\/g, '/');
        await previewManager.updateProjectFileBaseline(project_id, relativeTarget);
      } catch (e) {
        console.error(`[SavePage] Failed to sync baseline: ${e}`);
      }
    }

    // Cleanup and re-inject
    await cleanupInjectedFiles(project_id, projectRoot);
    try {
      await previewManager.injectRoute(project_id, normalizedPath);
    } catch (e) {
      console.warn(`[SavePage] Post-save injection failed: ${e}`);
    }

    return NextResponse.json({
      success: true,
      data: {
        updatedFiles,
        backups: savedBackups,
        // For backward compatibility
        path: updatedFiles[0] || normalizedPath,
        backupPath: savedBackups[0] || '',
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
