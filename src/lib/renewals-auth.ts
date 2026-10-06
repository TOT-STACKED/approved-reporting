import crypto from 'crypto';
import { cookies } from 'next/headers';

// Session cookie for Stacked Renewals operators. Same shape as the venue
// marketplace session, but domain-separated ("renewals:") so neither a partner
// nor a marketplace cookie can ever be replayed here. Operators and suppliers
// never share a session.
export const RENEWALS_SESSION_COOKIE = 'stacked_renewals_session';
export const RENEWALS_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET env var missing');
  return s;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlDecode(s: string): Buffer {
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function sign(payload: string): string {
  return b64url(crypto.createHmac('sha256', secret()).update(`renewals:${payload}`).digest());
}

export function makeRenewalsSession(email: string): string {
  const encoded = b64url(JSON.stringify({
    email: email.trim().toLowerCase(),
    exp: Date.now() + RENEWALS_SESSION_TTL_SECONDS * 1000,
  }));
  return `${encoded}.${sign(encoded)}`;
}

export function verifyRenewalsSession(cookie: string | undefined | null): { email: string } | null {
  if (!cookie) return null;
  const [encoded, sig] = cookie.split('.');
  if (!encoded || !sig) return null;
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(sign(encoded));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(b64urlDecode(encoded).toString('utf8'));
    if (typeof payload.email !== 'string') return null;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}

export const RENEWALS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: RENEWALS_SESSION_TTL_SECONDS,
};

/** The signed-in email, from the request cookies. */
export async function sessionEmail(): Promise<string | null> {
  const jar = await cookies();
  return verifyRenewalsSession(jar.get(RENEWALS_SESSION_COOKIE)?.value)?.email ?? null;
}
