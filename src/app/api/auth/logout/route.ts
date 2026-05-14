import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/login', request.url), { status: 303 });
  response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
