import crypto from 'crypto';

// Minimal Stripe client — form-encoded fetch plus webhook signature checks.
// The portal only needs a handful of calls (Checkout, the billing portal,
// cancelling a replaced subscription), which doesn't justify the SDK.

const API = 'https://api.stripe.com/v1';

function key(): string {
  const k = process.env.STRIPE_SECRET_KEY;
  if (!k) throw new Error('STRIPE_SECRET_KEY not configured');
  return k;
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Stripe's bracket notation: {a:{b:[{c:1}]}} → a[b][0][c]=1 */
function encode(obj: unknown, prefix = '', out: string[] = []): string[] {
  if (obj === undefined || obj === null) return out;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => encode(v, `${prefix}[${i}]`, out));
  } else if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      encode(v, prefix ? `${prefix}[${k}]` : k, out);
    }
  } else {
    out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(obj))}`);
  }
  return out;
}

export async function stripe<T = Record<string, unknown>>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  params?: Record<string, unknown>
): Promise<T> {
  const body = params ? encode(params).join('&') : undefined;
  const url = method !== 'POST' && body ? `${API}${path}?${body}` : `${API}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: method === 'POST' ? body : undefined,
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok) {
    const msg = (json as { error?: { message?: string } })?.error?.message || `Stripe ${res.status}`;
    throw new Error(msg);
  }
  return json as T;
}

/**
 * Verify a webhook's Stripe-Signature header against the raw body.
 * Header shape: `t=<unix>,v1=<hex>[,v1=<hex>]`. Rejects anything older than
 * five minutes so a captured payload can't be replayed later.
 */
export function verifyWebhook(rawBody: string, header: string | null): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;

  let t = '';
  const sigs: string[] = [];
  for (const part of header.split(',')) {
    const [k, v] = part.split('=');
    if (k === 't') t = v;
    if (k === 'v1' && v) sigs.push(v);
  }
  if (!t || sigs.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;

  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const b = Buffer.from(expected);
  return sigs.some(s => {
    const a = Buffer.from(s);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}
