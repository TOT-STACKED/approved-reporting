import crypto from 'crypto';
import { cookies } from 'next/headers';

// Session cookie for Stacked Field agents. Same shape as the Renewals session,
// but domain-separated ("field:") so no partner, marketplace or operator
// cookie can ever be replayed here. Long-lived, because agents sign in once on
// their phone and use it on the street.
export const FIELD_SESSION_COOKIE = 'stacked_field_session';
export const FIELD_SESSION_TTL_SECONDS = 60 * 24 * 60 * 60;

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
  return b64url(crypto.createHmac('sha256', secret()).update(`field:${payload}`).digest());
}

export function makeFieldSession(email: string): string {
  const encoded = b64url(JSON.stringify({
    email: email.trim().toLowerCase(),
    exp: Date.now() + FIELD_SESSION_TTL_SECONDS * 1000,
  }));
  return `${encoded}.${sign(encoded)}`;
}

export function verifyFieldSession(cookie: string | undefined | null): { email: string } | null {
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

export const FIELD_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: FIELD_SESSION_TTL_SECONDS,
};

/** The signed-in email, from the request cookies. */
export async function fieldSessionEmail(): Promise<string | null> {
  const jar = await cookies();
  return verifyFieldSession(jar.get(FIELD_SESSION_COOKIE)?.value)?.email ?? null;
}

/** Emails that are always managers, so the first manager can sign in before anyone adds them. */
export function bootstrapManagers(): string[] {
  return (process.env.FIELD_MANAGERS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

// ── Remember this phone ─────────────────────────────────────────────────────
//
// A year-long key the phone keeps in its own storage after a code sign-in.
// iPhones can drop a home-screen app's cookie (and reload the app mid
// sign-in), so when the session cookie is missing the sign-in page hands this
// key to /api/field/resume, which sets a fresh session without a code. Signed
// in its own "field-device:" domain, so it can't be used as a session cookie
// (or vice versa). Switching an agent off on the Team page still locks them
// out: resume checks the agent is active, every time. Signing out deletes it.

export const DEVICE_KEY_TTL_MS = 365 * 24 * 60 * 60 * 1000;

function signDevice(payload: string): string {
  return b64url(crypto.createHmac('sha256', secret()).update(`field-device:${payload}`).digest());
}

export function makeDeviceKey(email: string): string {
  const encoded = b64url(JSON.stringify({ email: email.trim().toLowerCase(), exp: Date.now() + DEVICE_KEY_TTL_MS }));
  return `${encoded}.${signDevice(encoded)}`;
}

export function verifyDeviceKey(key: unknown): { email: string } | null {
  if (typeof key !== 'string' || key.length > 2000) return null;
  const [encoded, sig] = key.split('.');
  if (!encoded || !sig) return null;
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(signDevice(encoded));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(b64urlDecode(encoded).toString('utf8'));
    if (typeof payload.email !== 'string' || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}
