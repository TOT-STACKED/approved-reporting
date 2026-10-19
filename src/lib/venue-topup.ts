// Turning a paid Stripe Checkout into bought tokens. Shared by the webhook and
// the return redirect, so the tokens are there the moment the partner lands
// back — even if the webhook is a few seconds behind, or was never set up.

import { creditTopup } from './venue-subscribers';
import { TOPUP_TOKENS } from './venue-plans';

export interface CheckoutSession {
  id: string;
  created: number;
  payment_status?: string;
  customer?: string | null;
  metadata?: Record<string, string>;
}

/** Credits the tokens and returns the buyer's email, or null if it wasn't a paid top-up. */
export async function applyTopupCheckout(s: CheckoutSession): Promise<string | null> {
  const m = s.metadata || {};
  if (m.kind !== 'venues_topup' || s.payment_status !== 'paid' || !m.email) return null;
  await creditTopup({
    email: m.email,
    sessionId: s.id,
    tokens: Number(m.tokens) || TOPUP_TOKENS,
    customer: s.customer || undefined,
  });
  return m.email;
}
