import { NextResponse } from 'next/server';
import { VENUE_SESSION_COOKIE } from '@/lib/venue-auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(VENUE_SESSION_COOKIE);
  return res;
}
