import crypto from 'crypto';

// Cookie used to remember a partner's authenticated session for /p/<token>.
// Format: `<base64url(payload)>.<base64url(hmac)>`. Payload is `{slug,exp}`.
// Signed with SESSION_SECRET so partners can't forge cookies.
export const PARTNER_SESSION_COOKIE = 'tot_partner_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getSecret(): string {
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
  return b64url(crypto.createHmac('sha256', getSecret()).update(payload).digest());
}

export function makeSessionCookie(slug: string): string {
  const payload = JSON.stringify({ slug, exp: Date.now() + SESSION_TTL_MS });
  const encoded = b64url(payload);
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionCookie(cookie: string | undefined | null): { slug: string } | null {
  if (!cookie) return null;
  const [encoded, sig] = cookie.split('.');
  if (!encoded || !sig) return null;

  const expected = sign(encoded);
  // Constant-time compare
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(b64urlDecode(encoded).toString('utf8'));
    if (typeof payload.slug !== 'string') return null;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return { slug: payload.slug };
  } catch {
    return null;
  }
}

export function getTokenMap(): Record<string, string> {
  try {
    return JSON.parse(process.env.PARTNER_TOKENS || '{}');
  } catch {
    return {};
  }
}

export function getPasscodeMap(): Record<string, string> {
  try {
    return JSON.parse(process.env.PARTNER_PASSCODES || '{}');
  } catch {
    return {};
  }
}

// Resolve a token to its partner slug if valid, else null.
export function slugForToken(token: string): string | null {
  return getTokenMap()[token] || null;
}

// Validate a passcode for a partner slug. Constant-time compare to prevent
// timing attacks on the digit string.
export function passcodeIsValid(slug: string, passcode: string): boolean {
  const expected = getPasscodeMap()[slug];
  if (!expected || !passcode) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(passcode);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const SESSION_TTL_SECONDS = Math.floor(SESSION_TTL_MS / 1000);
