import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';

export const runtime = 'nodejs'; // Required for streaming proxy

export async function GET(request: NextRequest) {
  return handleProxy(request);
}

export async function POST(request: NextRequest) {
  return handleProxy(request);
}

export async function PUT(request: NextRequest) {
  return handleProxy(request);
}

export async function DELETE(request: NextRequest) {
  return handleProxy(request);
}

export async function PATCH(request: NextRequest) {
  return handleProxy(request);
}

export async function HEAD(request: NextRequest) {
  return handleProxy(request);
}

export async function OPTIONS(request: NextRequest) {
  return handleProxy(request);
}

async function handleProxy(request: NextRequest) {
  // 1. Extract Project ID from query param (injected by middleware)
  const projectId = request.nextUrl.searchParams.get('__project_id');

  if (!projectId) {
    return new NextResponse('Project ID not specified in internal routing', { status: 400 });
  }

  // 2. Look up the project's port
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { previewPort: true, status: true },
  });

  if (!project || !project.previewPort) {
    return new NextResponse('Project is not running or does not exist', { status: 502 }); // Bad Gateway
  }

  // 3. Construct target URL
  const targetPort = project.previewPort;
  // Construct the target path. 
  // IMPORTANT: The request.nextUrl.pathname here will be /api/internal-proxy
  // BUT what we really want is the original path.
  // The middleware MUST pass the original path.
  // If we used a rewrite in middleware, request.nextUrl.pathname is the rewrite destination.
  // We should rely on a custom header OR search param for the original path if rewrite clobbers it.
  
  // However, `request.nextUrl` in the API route is the rewritten URL.
  // But we can construct the target path from the original request URL if we didn't lose it?
  // Let's assume the middleware passes the original path as a query param `__path`.
  
  const originalPath = request.nextUrl.searchParams.get('__path') || '/';
  const originalQuery = new URLSearchParams(request.nextUrl.searchParams);
  originalQuery.delete('__project_id');
  originalQuery.delete('__path');
  
  const queryString = originalQuery.toString();
  const targetUrl = `http://localhost:${targetPort}${originalPath}${queryString ? `?${queryString}` : ''}`;

  try {
    // 4. Proxy the request
    // We forward headers, excluding host (to avoid confusing the target web server)
    const headers = new Headers(request.headers);
    headers.set('Host', `localhost:${targetPort}`);
    // Forward-For headers are usually handled by Caddy, but good to preserve
    
    // We need to fetch with the body if it exists (and is not GET/HEAD)
    const method = request.method;
    const body = (method === 'GET' || method === 'HEAD') ? undefined : request.body;

    const response = await fetch(targetUrl, {
        method,
        headers,
        body: body as any, // Cast for Next.js fetch types
        // @ts-ignore - duxplex is node specific but supported in modern fetch
        duplex: 'half', 
        redirect: 'manual' // We want to pass redirects back to the client
    });

    // 5. Stream the response back
    return new NextResponse(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
    });

  } catch (error) {
    console.error(`[InternalProxy] Proxy failed for ${projectId} -> ${targetUrl}:`, error);
    return new NextResponse('Failed to reach preview server', { status: 502 });
  }
}
