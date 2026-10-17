import { NextResponse } from 'next/server';
import { FIELD_SESSION_COOKIE } from '@/lib/field-auth';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(FIELD_SESSION_COOKIE);
  return res;
}
