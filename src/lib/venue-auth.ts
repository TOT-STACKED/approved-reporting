import crypto from 'crypto';

// Session cookie for venue marketplace subscribers. Same shape as the partner
// session (`<base64url(payload)>.<base64url(hmac)>`, signed with
// SESSION_SECRET) but keyed on email rather than partner slug: marketplace
// subscribers buy their own way in and needn't be Stacked partners at all.
export const VENUE_SESSION_COOKIE = 'stacked_venues_session';
export const VENUE_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

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
  // Domain-separated so a partner session cookie can never be replayed here.
  return b64url(crypto.createHmac('sha256', secret()).update(`venues:${payload}`).digest());
}

export function makeVenueSession(email: string): string {
  const payload = JSON.stringify({
    email: email.trim().toLowerCase(),
    exp: Date.now() + VENUE_SESSION_TTL_SECONDS * 1000,
  });
  const encoded = b64url(payload);
  return `${encoded}.${sign(encoded)}`;
}

export function verifyVenueSession(cookie: string | undefined | null): { email: string } | null {
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

export const VENUE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: VENUE_SESSION_TTL_SECONDS,
};
