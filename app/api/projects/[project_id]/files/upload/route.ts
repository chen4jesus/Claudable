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

    // Determine target directory (default: public/images or images)
    let targetDir = targetPath || 'public/images';
    // Clean up the path
    targetDir = targetDir.replace(/\\/g, '/').replace(/^\.?\/?/, '').replace(/\/+$/, '');
    
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
    const relativePath = path.relative(projectRoot, absoluteFilePath).replace(/\\/g, '/');
    
    // For static projects, the URL is typically relative to the root
    // For Next.js projects with public folder, it's relative to public
    let urlPath = '/' + relativePath;
    if (relativePath.startsWith('public/')) {
      urlPath = '/' + relativePath.substring(7); // Remove 'public/' prefix
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
