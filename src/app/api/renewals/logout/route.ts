import { NextResponse } from 'next/server';
import { RENEWALS_SESSION_COOKIE } from '@/lib/renewals-auth';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(RENEWALS_SESSION_COOKIE);
  return res;
}
