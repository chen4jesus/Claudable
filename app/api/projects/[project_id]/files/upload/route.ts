/**
 * POST /api/projects/[project_id]/files/upload - Upload a file to the project
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getProjectById } from '@/lib/services/project';

interface RouteContext {
  params: Promise<{ project_id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { project_id } = await params;
    
    // Get project
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
    const targetPath = formData.get('path') as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Resolve project root
    const repoPath = project.repoPath || path.join('data', 'projects', project.id);
    const projectRoot = path.isAbsolute(repoPath)
      ? repoPath
      : path.resolve(process.cwd(), repoPath);

    // Determine project type for path mapping
    const isFlask = project.templateType === 'flask' || (project.templateType === 'git-import' && (await fs.access(path.join(projectRoot, 'wsgi.py')).then(() => true).catch(() => false)));

    // Determine target directory (default: public/images or static/images for Flask)
    let targetDir = targetPath || (isFlask ? 'app/static/images' : 'public/images');
    
    // Clean up the target path
    targetDir = targetDir.replace(/\\/g, '/').replace(/^\.?\/?/, '').replace(/\/+$/, '');
    
    // If Flask, and it's trying to go to 'public', redirect to standard static
    if (isFlask && targetDir.startsWith('public')) {
      const appStaticExists = await fs.access(path.join(projectRoot, 'app', 'static')).then(() => true).catch(() => false);
      if (appStaticExists) {
        targetDir = targetDir.replace(/^public/, 'app/static');
      } else {
        targetDir = targetDir.replace(/^public/, 'static');
      }
    }
    
    const absoluteTargetDir = path.resolve(projectRoot, targetDir);
    
    // Security: Ensure path is within project
    if (!absoluteTargetDir.startsWith(projectRoot + path.sep) && absoluteTargetDir !== projectRoot) {
      return NextResponse.json(
        { success: false, error: 'Path traversal not allowed' },
        { status: 400 }
      );
    }

    // Create target directory if it doesn't exist
    await fs.mkdir(absoluteTargetDir, { recursive: true });

    // Generate a unique filename to avoid collisions
    const originalName = file.name;
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    const timestamp = Date.now();
    const uniqueName = `${baseName}-${timestamp}${ext}`;
    
    const absoluteFilePath = path.join(absoluteTargetDir, uniqueName);

    // Write the file
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(absoluteFilePath, buffer);

    // Calculate the URL path relative to project root
    // Normalize to forward slashes for URL
    const relativePath = path.relative(projectRoot, absoluteFilePath).split(path.sep).join('/');
    
    // For static projects, the URL is typically relative to the root
    // For Next.js projects with public folder, it's relative to public
    // For Flask, it's relative to static (usually /static/...)
    let urlPath = '/' + relativePath;
    
    if (relativePath.startsWith('public/')) {
      urlPath = '/' + relativePath.substring(7); // Remove 'public/' prefix
    } else if (isFlask) {
      if (relativePath.startsWith('app/static/')) {
        urlPath = '/static/' + relativePath.substring(11);
      } else if (relativePath.startsWith('static/')) {
        urlPath = '/static/' + relativePath.substring(7);
      }
    }

    console.log(`[Upload] Saved file to: ${absoluteFilePath}, URL: ${urlPath}`);

    return NextResponse.json({
      success: true,
      data: {
        path: relativePath,
        url: urlPath,
        filename: uniqueName,
      },
    });
  } catch (error) {
    console.error('[API] Failed to upload file:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload file',
      },
      { status: 500 }
    );
  }
}
