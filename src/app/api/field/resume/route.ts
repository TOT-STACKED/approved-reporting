import { NextResponse, type NextRequest } from 'next/server';
import { FIELD_COOKIE_OPTIONS, FIELD_SESSION_COOKIE, makeFieldSession, verifyDeviceKey } from '@/lib/field-auth';
import { agentForSignIn, fieldConfigured, touchSignIn } from '@/lib/field-db';

export const dynamic = 'force-dynamic';

// Sign a remembered phone straight back in: the sign-in page posts the
// device key it kept after the last code sign-in. Only for agents still on the
// team, so switching someone off on the Team page locks this out too.
export async function POST(request: NextRequest) {
  const { key } = (await request.json().catch(() => ({}))) as { key?: unknown };
  const who = verifyDeviceKey(key);
  if (!who) return NextResponse.json({ error: 'expired' }, { status: 401 });
  if (!fieldConfigured()) return NextResponse.json({ error: 'Field is not switched on yet.' }, { status: 503 });
  try {
    const agent = await agentForSignIn(who.email);
    if (!agent) return NextResponse.json({ error: 'off-team' }, { status: 403 });
    const res = NextResponse.json({ ok: true, next: '/field' });
    res.cookies.set(FIELD_SESSION_COOKIE, makeFieldSession(who.email), FIELD_COOKIE_OPTIONS);
    void touchSignIn(agent.id).catch(() => {});
    return res;
  } catch (error: unknown) {
    console.warn('[field] resume failed', error);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
