import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get('domain');

  if (!domain) {
    return new NextResponse('Domain parameter required', { status: 400 });
  }

  // Allow domains that end with our expected root domain
  // In production: .build.faithconnect.us
  // We can make this dynamic based on env or hardcoded for now as it matches Caddy behavior
  const allowedSuffix = process.env.NEXT_PUBLIC_APP_URL 
    ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname
    : 'faithconnect.us';

  // Check if it is a subdomain of our root
  // e.g. foo.build.faithconnect.us ends with build.faithconnect.us
  if (domain.endsWith(allowedSuffix)) {
    return new NextResponse('Allowed', { status: 200 });
  }

  return new NextResponse('Forbidden', { status: 403 });
}
