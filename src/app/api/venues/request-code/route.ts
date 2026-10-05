import { NextResponse, type NextRequest } from 'next/server';
import { findSubscriber } from '@/lib/venue-subscribers';
import { findUserByEmail } from '@/lib/partner-users';
import { generateCode, makeChallenge, OTP_COOKIE } from '@/lib/otp';
import { sendCodeByEmail } from '@/lib/send-code';

export const dynamic = 'force-dynamic';

// Sign-in step one for the venue marketplace. Anyone with a subscriber row or a
// Partner Users login can ask for a code — whether that login actually comes
// with marketplace access is decided after sign-in, by entitlementFor.
//
// Same answer whether or not the email exists, as with partner sign-in.
export async function POST(request: NextRequest) {
  try {
    const { email } = (await request.json().catch(() => ({}))) as { email?: string };
    const target = (email || '').trim().toLowerCase();
    if (!target.includes('@')) {
      return NextResponse.json({ error: 'Enter your work email' }, { status: 400 });
    }

    const [sub, user] = await Promise.all([findSubscriber(target), findUserByEmail(target)]);
    if (!sub && !user) return NextResponse.json({ ok: true });

    const code = generateCode();
    const delivery = await sendCodeByEmail(target, code, sub?.name || user?.name || '');
    if (!delivery.sent) {
      return NextResponse.json(
        { error: delivery.error || 'Could not send your code. Try again shortly.' },
        { status: 502 }
      );
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(OTP_COOKIE, makeChallenge(target, code), {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60,
    });
    return res;
  } catch (error: unknown) {
    console.warn('[venues] request-code failed', error);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
