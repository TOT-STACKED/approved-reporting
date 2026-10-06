import { NextResponse, type NextRequest } from 'next/server';
import { generateCode, makeChallenge, OTP_COOKIE } from '@/lib/otp';
import { knownName, renewalsConfigured } from '@/lib/renewals-db';
import { sendRenewalsCode } from '@/lib/renewals-email';

export const dynamic = 'force-dynamic';

// Sign-in step one. Open to anyone: existing members sign in, people with an
// Intelligence Review get their stack brought in, and everyone else does the
// review as part of signing up. The answer never says which, so the form
// can't be used to find out who has done a review.
export async function POST(request: NextRequest) {
  try {
    if (!renewalsConfigured()) {
      return NextResponse.json({ error: 'Renewals is not switched on yet.' }, { status: 503 });
    }
    const { email } = (await request.json().catch(() => ({}))) as { email?: string };
    const target = (email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      return NextResponse.json({ error: 'Enter your work email' }, { status: 400 });
    }

    const code = generateCode();
    const delivery = await sendRenewalsCode(target, code, await knownName(target).catch(() => ''));
    if (!delivery.sent) {
      return NextResponse.json({ error: delivery.error || 'Could not send your code. Try again shortly.' }, { status: 502 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(OTP_COOKIE, makeChallenge(target, code), {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 10 * 60,
    });
    return res;
  } catch (error: unknown) {
    console.warn('[renewals] request-code failed', error);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
