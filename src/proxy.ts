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
// - /api/ask           : AI box; checks the team session itself (unscoped / any
//                        slug), else pins to the partner's token or partner session
// - /api/report        : "Generate Report"; team session or the partner's token
// - /api/sos-sync      : shared-secret gated, called by nightly Netlify scheduled function
// - /api/tech-usage-sync : shared-secret gated, called by nightly Netlify scheduled function
// - /venues, /api/venues/* : the venue marketplace — public listing, gated on its own
//                        subscriber session; the webhook checks Stripe's signature
// - /renewals, /api/renewals/* : Stacked Renewals for operators, gated on its own
//                        operator session; the alerts cron checks DIGEST_SECRET
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
  '/venues',
  '/api/venues',
  '/renewals',
  '/api/renewals/',
];

// Stacked Renewals has its own domain for operators. On that host only the
// Renewals pages and API exist — the partner portal, the team dashboard and
// the venue marketplace all 404 — so an operator's domain never leads to a
// supplier surface. "/" lands on the Renewals home.
function isRenewalsHost(host: string | null): boolean {
  return Boolean(host && host.split(':')[0].startsWith('renewals.'));
}

function renewalsHost(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (pathname === '/') return NextResponse.rewrite(new URL('/renewals', request.url));
  if (pathname === '/renewals' || pathname.startsWith('/renewals/') || pathname.startsWith('/api/renewals/')) {
    return NextResponse.next();
  }
  return new NextResponse('Not found', { status: 404 });
}

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

// Once renewals.wearestacked.io is live, set RENEWALS_FORWARD=true so the
// old partners.wearestacked.io/renewals pages forward there. Operators then
// never sit on a partner address. Off by default, since forwarding before the
// domain resolves would lock operators out.
function forwardToRenewalsHost(request: NextRequest): NextResponse | null {
  if (process.env.RENEWALS_FORWARD !== 'true') return null;
  const { pathname, search } = request.nextUrl;
  if (pathname !== '/renewals' && !pathname.startsWith('/renewals/')) return null;
  const base = (process.env.RENEWALS_URL || 'https://renewals.wearestacked.io').replace(/\/$/, '');
  return NextResponse.redirect(`${base}${pathname}${search}`, 308);
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isRenewalsHost(request.headers.get('host'))) return renewalsHost(request);
  const forwarded = forwardToRenewalsHost(request);
  if (forwarded) return forwarded;
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
