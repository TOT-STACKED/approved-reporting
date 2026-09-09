import crypto from 'crypto';

// Six-digit sign-in codes, with no server-side store.
//
// Requesting a code returns a signed "challenge" that goes back to the
// browser as a short-lived httpOnly cookie. The challenge holds the email the
// code belongs to, a hash of the code, an expiry and an attempt count — all
// HMAC'd with SESSION_SECRET, so the browser can hold it but can't alter it.
// Verifying re-hashes what the user typed and compares.
//
// Why no database table: a codes table needs writes on every request, reads
// on every attempt, and a job to sweep expired rows. This needs none of that,
// and an expired challenge disappears on its own. The trade is that the code
// must be entered in the same browser that asked for it — which is the normal
// flow, since the email is only the delivery channel.

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export const OTP_COOKIE = 'stacked_login_challenge';

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
  return b64url(crypto.createHmac('sha256', secret()).update(payload).digest());
}

function hashCode(code: string, email: string): string {
  // Salted with the email so a hash from one challenge can't be replayed
  // against another.
  return b64url(crypto.createHmac('sha256', secret()).update(`${email}:${code}`).digest());
}

interface Challenge {
  email: string;
  hash: string;
  exp: number;
  attempts: number;
}

function pack(c: Challenge): string {
  const encoded = b64url(JSON.stringify(c));
  return `${encoded}.${sign(encoded)}`;
}

function unpack(cookie: string | undefined | null): Challenge | null {
  if (!cookie) return null;
  const [encoded, sig] = cookie.split('.');
  if (!encoded || !sig) return null;
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(sign(encoded));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const c = JSON.parse(b64urlDecode(encoded).toString('utf8')) as Challenge;
    if (typeof c.email !== 'string' || typeof c.hash !== 'string') return null;
    if (typeof c.exp !== 'number' || c.exp < Date.now()) return null;
    if (typeof c.attempts !== 'number') return null;
    return c;
  } catch {
    return null;
  }
}

/** A 6-digit code. crypto.randomInt so it isn't guessable from the clock. */
export function generateCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function makeChallenge(email: string, code: string): string {
  return pack({
    email: email.trim().toLowerCase(),
    hash: hashCode(code, email.trim().toLowerCase()),
    exp: Date.now() + CODE_TTL_MS,
    attempts: 0,
  });
}

export type VerifyResult =
  | { ok: true; email: string }
  | { ok: false; reason: 'expired' | 'wrong' | 'locked'; cookie?: string };

/**
 * Check a typed code. On a wrong answer this returns a fresh cookie with the
 * attempt count incremented, so five wrong guesses burn the challenge rather
 * than letting someone sit there trying all million.
 */
export function verifyChallenge(cookie: string | undefined | null, code: string): VerifyResult {
  const c = unpack(cookie);
  if (!c) return { ok: false, reason: 'expired' };
  if (c.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'locked' };

  const typed = hashCode(code.trim(), c.email);
  const a = Buffer.from(typed);
  const b = Buffer.from(c.hash);
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (match) return { ok: true, email: c.email };

  const next = { ...c, attempts: c.attempts + 1 };
  return {
    ok: false,
    reason: next.attempts >= MAX_ATTEMPTS ? 'locked' : 'wrong',
    cookie: pack(next),
  };
}
