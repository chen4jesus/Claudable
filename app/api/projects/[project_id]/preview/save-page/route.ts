/**
 * POST /api/projects/[project_id]/preview/save-page - Save edited page with backup
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getProjectById } from '@/lib/services/project';

interface RouteContext {
  params: Promise<{ project_id: string }>;
}

interface SavePageBody {
  path: string;
  content: string;
}

/**
 * Remove AI_SMART_EDIT injection markers from content
 * Handles both HTML (with START/END markers) and JSX/TSX (with comment + Script component) patterns
 */
function cleanupSmartEditInjection(content: string): string {
  let result = content;
  
  // 1. Handle HTML injection pattern with START/END markers
  // Pattern: <!-- AI SMART EDIT INJECTION START -->[script content]<!-- AI SMART EDIT INJECTION END -->
  const startMarker = '<!-- AI SMART EDIT INJECTION START -->';
  const endMarker = '<!-- AI SMART EDIT INJECTION END -->';
  
  // Remove all instances of the HTML injection block
  while (true) {
    const startIndex = result.indexOf(startMarker);
    if (startIndex === -1) break;
    
    const endIndex = result.indexOf(endMarker, startIndex);
    if (endIndex === -1) break; // Malformed, stop
    
    // Calculate removal range (consume preceding whitespace up to a '>')
    let removeStart = startIndex;
    const removeEnd = endIndex + endMarker.length;
    
    let cursor = startIndex - 1;
    while (cursor >= 0) {
      const char = result[cursor];
      if (char === ' ' || char === '\n' || char === '\r' || char === '\t') {
        cursor--;
      } else if (char === '>') {
        removeStart = cursor + 1;
        break;
      } else {
        break;
      }
    }
    
    result = result.substring(0, removeStart) + result.substring(removeEnd);
  }
  
  // 2. Handle JSX/TSX pattern: {/* AI_SMART_EDIT_INJECTED */}\n<Script ... ai-smart-edit.js ... />
  const jsxPattern = /\s*\{\/\*\s*AI_SMART_EDIT_INJECTED\s*\*\/\}\s*\n?\s*<Script[^>]*ai-smart-edit\.js[^>]*\/>\s*\n?/g;
  result = result.replace(jsxPattern, '');
  
  // 3. Handle standalone Script components (without comment marker)
  const scriptOnlyPattern = /<Script[^>]*ai-smart-edit\.js[^>]*\/>\s*\n?/g;
  result = result.replace(scriptOnlyPattern, '');
  
  // 4. Remove the Script import if no longer used
  const scriptUsageCount = (result.match(/<Script/g) || []).length;
  if (scriptUsageCount === 0) {
    const importPattern = /import\s+Script\s+from\s+['"]next\/script['"];?\s*\n?/g;
    result = result.replace(importPattern, '');
  }
  
  return result;
}


/**
 * Cleanup injected scripts from common layout/app files in the project
 */
async function cleanupInjectedFiles(projectRoot: string): Promise<void> {
  // 1. Clean specific layout/app files for Next.js projects
  const specificFiles = [
    'app/layout.tsx',
    'app/layout.jsx',
    'app/layout.js',
    'src/app/layout.tsx',
    'src/app/layout.jsx',
    'src/app/layout.js',
    'pages/_app.tsx',
    'pages/_app.jsx',
    'pages/_app.js',
  ];

  for (const relPath of specificFiles) {
    const filePath = path.join(projectRoot, relPath);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      if (content.includes('AI_SMART_EDIT_INJECTED') || content.includes('ai-smart-edit.js')) {
        const cleaned = cleanupSmartEditInjection(content);
        if (cleaned !== content) {
          await fs.writeFile(filePath, cleaned, 'utf-8');
          console.log(`[SavePage] Cleaned up injection from: ${relPath}`);
        }
      }
    } catch {
      // File doesn't exist or can't be read, skip silently
    }
  }

  // 2. Recursively scan and clean all HTML files
  const cleanHtmlRecursively = async (dir: string): Promise<void> => {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // Skip common directories that shouldn't be scanned
          if (['node_modules', '.git', '.next', 'venv', '__pycache__', 'backups'].includes(entry.name)) continue;
          await cleanHtmlRecursively(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.html')) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            if (content.includes('AI SMART EDIT INJECTION START') || content.includes('ai-smart-edit.js')) {
              const cleaned = cleanupSmartEditInjection(content);
              if (cleaned !== content) {
                await fs.writeFile(fullPath, cleaned, 'utf-8');
                console.log(`[SavePage] Cleaned up injection from: ${path.relative(projectRoot, fullPath)}`);
              }
            }
          } catch {
            // Skip files that can't be read
          }
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
  };

  await cleanHtmlRecursively(projectRoot);

  // 3. Remove the ai-smart-edit.js file from public/scripts/ if it exists
  const scriptPath = path.join(projectRoot, 'public', 'scripts', 'ai-smart-edit.js');
  try {
    await fs.unlink(scriptPath);
    console.log(`[SavePage] Removed ai-smart-edit.js from public/scripts/`);
  } catch {
    // File doesn't exist, ignore
  }
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
    try {
      const stats = await fs.stat(absolutePath);
      if (!stats.isFile()) {
        return NextResponse.json(
          { success: false, error: 'Not a file' },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { success: false, error: 'File not found' },
        { status: 404 }
      );
    }

    // Create backup (with injection markers removed)
    const backupDir = path.join(projectRoot, 'backups');
    await fs.mkdir(backupDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = path.basename(absolutePath);
    const backupFileName = `${fileName}.${timestamp}.bak`;
    const backupPath = path.join(backupDir, backupFileName);
    
    // Read original file, clean it, and save as backup
    const originalContent = await fs.readFile(absolutePath, 'utf-8');
    const cleanedBackup = cleanupSmartEditInjection(originalContent);
    await fs.writeFile(backupPath, cleanedBackup, 'utf-8');
    console.log(`[SavePage] Created clean backup: ${backupPath}`);


    // Clean up AI_SMART_EDIT injection from content
    let cleanedContent = cleanupSmartEditInjection(content);

    // Write new content
    await fs.writeFile(absolutePath, cleanedContent, 'utf-8');
    console.log(`[SavePage] Updated file: ${absolutePath}`);

    // Also cleanup layout.tsx and app.tsx if they exist (remove injected scripts)
    await cleanupInjectedFiles(projectRoot);

    return NextResponse.json({
      success: true,
      data: {
        path: normalizedPath,
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
