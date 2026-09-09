import { NextResponse, type NextRequest } from 'next/server';
import { findUser } from '@/lib/partner-users';
import { generateCode, makeChallenge, OTP_COOKIE } from '@/lib/otp';
import { sendCodeByEmail } from '@/lib/send-code';

export const dynamic = 'force-dynamic';

// Step one of signing in: they type an email (or mobile) and we post a code.
//
// The response is deliberately the same whether or not the account exists.
// Otherwise this endpoint becomes a way to ask "does anyone at Nory have a
// login?", which is exactly the reconnaissance we don't want to hand out.
export async function POST(request: NextRequest) {
  try {
    const { identifier } = (await request.json().catch(() => ({}))) as { identifier?: string };
    if (!identifier || typeof identifier !== 'string' || identifier.trim().length < 3) {
      return NextResponse.json({ error: 'Enter your work email' }, { status: 400 });
    }

    const user = await findUser(identifier);

    // No account: stop here, but answer as if we'd sent one.
    if (!user || !user.email) {
      return NextResponse.json({ ok: true, sentTo: null });
    }

    const code = generateCode();
    const delivery = await sendCodeByEmail(user.email, code, user.name);
    if (!delivery.sent) {
      // A real failure the user can act on — don't pretend this one worked.
      return NextResponse.json(
        { error: delivery.error || 'Could not send your code. Try again shortly.' },
        { status: 502 }
      );
    }

    const res = NextResponse.json({ ok: true, sentTo: maskEmail(user.email) });
    res.cookies.set(OTP_COOKIE, makeChallenge(user.email, code), {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60,
    });
    return res;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** j***@nory.com — enough to confirm which inbox to open, not enough to learn one. */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '';
  const head = local.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(2, local.length - 1))}@${domain}`;
}
