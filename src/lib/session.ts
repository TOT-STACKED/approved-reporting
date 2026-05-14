// Edge-safe signed-cookie helpers used by proxy.ts and the auth route handlers.
// Cookie value format: `<expiryUnixSeconds>.<base64urlHmac>`.

export const SESSION_COOKIE = 'tot_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function base64urlEncode(bytes: ArrayBuffer): string {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return base64urlEncode(sig);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(secret: string, ttlSeconds = SESSION_TTL_SECONDS): Promise<string> {
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = await hmac(secret, String(expiry));
  return `${expiry}.${sig}`;
}

export async function verifySessionToken(secret: string, token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const expiryStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || expiry < Math.floor(Date.now() / 1000)) return false;
  const expected = await hmac(secret, expiryStr);
  return timingSafeEqual(sig, expected);
}
