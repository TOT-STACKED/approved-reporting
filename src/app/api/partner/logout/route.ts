import { NextResponse } from 'next/server';
import { PARTNER_SESSION_COOKIE } from '@/lib/partner-auth';
import { OTP_COOKIE } from '@/lib/otp';

export const dynamic = 'force-dynamic';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(PARTNER_SESSION_COOKIE);
  res.cookies.delete(OTP_COOKIE);
  return res;
}
