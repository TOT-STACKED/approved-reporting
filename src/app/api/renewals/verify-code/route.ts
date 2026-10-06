import { NextResponse, type NextRequest } from 'next/server';
import { OTP_COOKIE, verifyChallenge } from '@/lib/otp';
import { RENEWALS_COOKIE_OPTIONS, RENEWALS_SESSION_COOKIE, makeRenewalsSession } from '@/lib/renewals-auth';
import { findMember, provisionFromSubmission, touchSignIn } from '@/lib/renewals-db';

export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, string> = {
  expired: 'That code has expired. Ask for a new one.',
  wrong: "That code doesn't match. Check the email and try again.",
  locked: 'Too many attempts. Ask for a new code.',
};

// Sign-in step two. First time in with an Intelligence Review, this creates
// the account and seeds it with the tools from that review.
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
        res.cookies.set(OTP_COOKIE, result.cookie, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 10 * 60 });
      } else {
        res.cookies.delete(OTP_COOKIE);
      }
      return res;
    }

    const member = (await findMember(result.email)) || (await provisionFromSubmission(result.email));
    if (!member) {
      return NextResponse.json({ error: "We couldn't find an account for that email." }, { status: 403 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(RENEWALS_SESSION_COOKIE, makeRenewalsSession(result.email), RENEWALS_COOKIE_OPTIONS);
    res.cookies.delete(OTP_COOKIE);
    void touchSignIn(member.id).catch(() => {});
    return res;
  } catch (error: unknown) {
    console.warn('[renewals] verify-code failed', error);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
