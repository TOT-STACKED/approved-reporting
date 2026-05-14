import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, createSessionToken } from '@/lib/session';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!password || !secret) {
    return NextResponse.json({ error: 'Auth not configured' }, { status: 500 });
  }

  let submitted = '';
  let next = '/';
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = (await request.json().catch(() => ({}))) as { password?: string; next?: string };
    submitted = body.password ?? '';
    if (typeof body.next === 'string') next = body.next;
  } else {
    const form = await request.formData();
    submitted = String(form.get('password') ?? '');
    const formNext = form.get('next');
    if (typeof formNext === 'string' && formNext) next = formNext;
  }

  if (submitted !== password) {
    const url = new URL('/login', request.url);
    url.searchParams.set('error', '1');
    if (next && next !== '/') url.searchParams.set('next', next);
    return NextResponse.redirect(url, { status: 303 });
  }

  if (!next.startsWith('/') || next.startsWith('//')) next = '/';

  const token = await createSessionToken(secret);
  const response = NextResponse.redirect(new URL(next, request.url), { status: 303 });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
