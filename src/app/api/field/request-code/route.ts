import { NextResponse, type NextRequest } from 'next/server';
import { generateCode, makeChallenge, OTP_COOKIE } from '@/lib/otp';
import { agentForSignIn, fieldConfigured } from '@/lib/field-db';
import { sendCodeByEmail } from '@/lib/send-code';

export const dynamic = 'force-dynamic';

// Sign-in step one. Field is invite-only: a manager adds agents on the Team
// page, and FIELD_MANAGERS lets the first manager in. It's an internal tool,
// so an email that isn't on the team is told so plainly.
export async function POST(request: NextRequest) {
  try {
    if (!fieldConfigured()) {
      return NextResponse.json({ error: 'Field is not switched on yet.' }, { status: 503 });
    }
    const { email } = (await request.json().catch(() => ({}))) as { email?: string };
    const target = (email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      return NextResponse.json({ error: 'Enter your work email' }, { status: 400 });
    }

    const agent = await agentForSignIn(target);
    if (!agent) {
      return NextResponse.json({ error: "That email isn't on the field team. Ask your manager to add you." }, { status: 403 });
    }

    const code = generateCode();
    const delivery = await sendCodeByEmail(target, code, agent.name || '');
    if (!delivery.sent) {
      return NextResponse.json({ error: delivery.error || 'Could not send your code. Try again shortly.' }, { status: 502 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(OTP_COOKIE, makeChallenge(target, code), {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 10 * 60,
    });
    return res;
  } catch (error: unknown) {
    console.warn('[field] request-code failed', error);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
