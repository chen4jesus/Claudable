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
  
  const rootDomain = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname : 'localhost';
  let projectId: string | null = null;
  
  if (hostname !== rootDomain && hostname.endsWith(rootDomain)) {
      // It is a subdomain
      const subdomainPart = hostname.slice(0, -(rootDomain.length + 1)); // remove .rootDomain
      if (subdomainPart && subdomainPart !== 'www') {
          projectId = subdomainPart;
      }
  } else if (hostname.endsWith('.localhost')) {
      // Fallback for local dev if NEXT_PUBLIC_APP_URL isn't set perfectly
       projectId = hostname.split('.')[0];
  }

  if (projectId) {
     // Rewrite to Internal Proxy
     // We preserve the original path in a search param so the proxy knows where to go
     // We append the project ID
     const url = request.nextUrl.clone();
     url.pathname = '/api/internal-proxy';
     url.searchParams.set('__project_id', projectId);
     url.searchParams.set('__path', pathname);
     return NextResponse.rewrite(url);
  }


  // Paths that are always allowed
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
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
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};
