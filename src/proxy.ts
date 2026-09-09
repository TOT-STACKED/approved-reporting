import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

// Public paths that must work without a session cookie. Everything else is gated.
// - /login             : the login page itself
// - /api/auth/*        : login / logout endpoints
// - /signin            : partner sign-in page (code to their own email)
// - /dashboard         : partner dashboard; gated on the partner session cookie,
//                        which it checks itself and redirects to /signin without
// - /api/partner/*     : partner sign-in endpoints, each gated on its own credential
// - /p/<token>         : partner pages already use unguessable 16-char tokens
// - /api/p/<token>     : partner-page data endpoint, same token check applies upstream
// - /api/ask           : partner-scoped AI box lives on token-gated partner pages
// - /api/report        : "Generate Report" button on token-gated partner pages
// - /api/sos-sync      : shared-secret gated, called by nightly Netlify scheduled function
// - /api/tech-usage-sync : shared-secret gated, called by nightly Netlify scheduled function
const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth/',
  '/signin',
  '/dashboard',
  '/api/partner/',
  '/p/',
  '/api/p/',
  '/api/ask',
  '/api/report',
  '/api/sos-sync',
  '/api/tech-usage-sync',
];

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
