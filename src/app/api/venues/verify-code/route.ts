import { NextResponse, type NextRequest } from 'next/server';
import { OTP_COOKIE, verifyChallenge } from '@/lib/otp';
import { VENUE_COOKIE_OPTIONS, VENUE_SESSION_COOKIE, makeVenueSession } from '@/lib/venue-auth';
import { findSubscriber, touchSubscriberSignIn } from '@/lib/venue-subscribers';

export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, string> = {
  expired: 'That code has expired. Ask for a new one.',
  wrong: "That code doesn't match. Check the email and try again.",
  locked: 'Too many attempts. Ask for a new code.',
};

export async function POST(request: NextRequest) {
  try {
    const { code } = (await request.json().catch(() => ({}))) as { code?: string };
    if (!code || !/^\d{4,8}$/.test(code.trim())) {
      return NextResponse.json({ error: 'Enter the 6-digit code' }, { status: 400 });
    }

    const result = verifyChallenge(request.cookies.get(OTP_COOKIE)?.value, code.trim());
    if (!result.ok) {
      const res = NextResponse.json({ error: MESSAGES[result.reason] }, { status: 401 });
      if (result.cookie) {
        res.cookies.set(OTP_COOKIE, result.cookie, {
          httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 10 * 60,
        });
      } else {
        res.cookies.delete(OTP_COOKIE);
      }
      return res;
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(VENUE_SESSION_COOKIE, makeVenueSession(result.email), VENUE_COOKIE_OPTIONS);
    res.cookies.delete(OTP_COOKIE);

    const sub = await findSubscriber(result.email).catch(() => null);
    if (sub) void touchSubscriberSignIn(sub.id);
    return res;
  } catch (error: unknown) {
    console.warn('[venues] verify-code failed', error);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
