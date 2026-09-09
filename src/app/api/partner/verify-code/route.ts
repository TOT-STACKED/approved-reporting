import { NextResponse, type NextRequest } from 'next/server';
import { findUserByEmail, touchSignIn } from '@/lib/partner-users';
import { OTP_COOKIE, verifyChallenge } from '@/lib/otp';
import { PARTNER_SESSION_COOKIE, makeSessionCookie } from '@/lib/partner-auth';

export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, string> = {
  expired: 'That code has expired. Ask for a new one.',
  wrong: "That code doesn't match. Check the email and try again.",
  locked: 'Too many attempts. Ask for a new code.',
};

// Step two: they type the code. On success we swap the short-lived challenge
// for the 30-day partner session cookie the dashboard reads.
export async function POST(request: NextRequest) {
  try {
    const { code } = (await request.json().catch(() => ({}))) as { code?: string };
    if (!code || !/^\d{4,8}$/.test(code.trim())) {
      return NextResponse.json({ error: 'Enter the 6-digit code' }, { status: 400 });
    }

    const result = verifyChallenge(request.cookies.get(OTP_COOKIE)?.value, code.trim());

    if (!result.ok) {
      const res = NextResponse.json({ error: MESSAGES[result.reason] }, { status: 401 });
      // Carry the incremented attempt count, or clear a spent challenge.
      if (result.cookie) {
        res.cookies.set(OTP_COOKIE, result.cookie, {
          httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 10 * 60,
        });
      } else {
        res.cookies.delete(OTP_COOKIE);
      }
      return res;
    }

    // The challenge proves they read the inbox; the row proves who they are.
    const user = await findUserByEmail(result.email);
    if (!user || !user.slug) {
      return NextResponse.json(
        { error: 'That account is no longer active. Contact the Stacked team.' },
        { status: 403 }
      );
    }

    const res = NextResponse.json({ ok: true, slug: user.slug, name: user.name });
    res.cookies.set(PARTNER_SESSION_COOKIE, makeSessionCookie(user.slug), {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });
    res.cookies.delete(OTP_COOKIE);

    void touchSignIn(user.id);
    return res;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
