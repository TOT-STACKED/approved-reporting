import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

// Public paths that must work without a session cookie. Everything else is gated.
// - /login        : the login page itself
// - /api/auth/*   : login / logout endpoints
// - /p/<token>    : partner pages already use unguessable 16-char tokens
// - /api/p/<token>: partner-page data endpoint, same token check applies upstream
// - /api/ask      : partner-scoped AI box lives on token-gated partner pages
// - /api/report   : "Generate Report" button on token-gated partner pages
const PUBLIC_PREFIXES = ['/login', '/api/auth/', '/p/', '/api/p/', '/api/ask', '/api/report'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // Misconfigured deploy — fail closed so we never ship an open dashboard.
    return new NextResponse('Auth not configured', { status: 500 });
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(secret, token)) return NextResponse.next();

  const loginUrl = new URL('/login', request.url);
  if (pathname !== '/') loginUrl.searchParams.set('next', pathname + search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Run on everything except Next internals, static assets, and the favicon.
  matcher: ['/((?!_next/static|_next/image|_next/data|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js|map)).*)'],
};
