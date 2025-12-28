import { NextRequest, NextResponse } from 'next/server';
import { decrypt } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get('host') || '';

  // 1. Check for Subdomain (Project Preview)
  // Assumes format: project-id.domain.com OR project-id.localhost
  // We need to be careful with 'localhost' (no TLD) vs 'domain.com'
  // Let's assume standard 3-part domain for production e.g. app.claudable.ai -> project.app.claudable.ai ??
  // OR 2-part for localhost: project.localhost

  // Heuristic: If hostname has > 1 dot (production) or > 0 dots (localhost), and not 'www'
  // Actually, easiest is to allow config, but let's assume ANY subdomain that isn't 'www' is a project.
  
  // NOTE: This simple logic assumes the app is hosted at the root domain or 'localhost'.
  // If hosted at 'app.example.com', then 'proj.app.example.com' would be the preview.
  // Users might need to configure their ROOT_DOMAIN in env.
  
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const rootDomain = new URL(appUrl).hostname;
  let projectId: string | null = null;
  
  // Clean hostname (strip port if present)
  const cleanHostname = hostname.split(':')[0];

  // console.log(`[Middleware] Host: ${hostname}, CleanHost: ${cleanHostname}, RootDomain: ${rootDomain}`);
  
  if (cleanHostname !== rootDomain && cleanHostname.endsWith(rootDomain)) {
      // It is a subdomain
      const subdomainPart = cleanHostname.slice(0, -(rootDomain.length + 1)); // remove .rootDomain
      // Strictly enforce project ID format: starts with 'p-'
      if (subdomainPart && subdomainPart.startsWith('p-')) {
          projectId = subdomainPart;
          console.log(`[Middleware] Detected Project ID: ${projectId}`);
      }
  } else if (cleanHostname.endsWith('.localhost')) {
      // Fallback for local dev if NEXT_PUBLIC_APP_URL isn't set perfectly
       projectId = cleanHostname.split('.')[0];
       console.log(`[Middleware] Localhost Project ID: ${projectId}`);
  }

  if (projectId) {
     // Rewrite to Internal Proxy
     // We preserve the original path in a search param and header so the proxy knows where to go
     const url = new URL('/api/internal-proxy', request.url);
     url.searchParams.set('__project_id', projectId);
     url.searchParams.set('__path', pathname);
     
     console.log(`[Middleware] Rewriting to: ${url.toString()}`);
     
     const response = NextResponse.rewrite(url);
     response.headers.set('x-project-id', projectId);
     response.headers.set('x-original-path', pathname);
     return response;
  }


  // Paths that are always allowed
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/caddy') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/scripts') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg')
  ) {
    return NextResponse.next();
  }

  const session = request.cookies.get('session')?.value;

  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    await decrypt(session);
    return NextResponse.next();
  } catch (error) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: [
    '/((?!api/auth|api/chat/.*/stream).*)',
  ],
};
