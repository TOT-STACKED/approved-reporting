// Turning Stripe events into Venue Subscribers rows. Shared by the webhook and
// the post-checkout redirect, so a subscriber can start using the marketplace
// the moment they land back — even if the webhook is a few seconds behind.

import { isCategory } from './venue-plans';
import { stripe } from './stripe';
import {
  addBonus,
  findSubscriberBySubscription,
  updateSubscriber,
  upsertSubscriber,
  type SubscriberStatus,
} from './venue-subscribers';

export interface CheckoutSession {
  id: string;
  status?: string;
  payment_status?: string;
  created: number;
  customer?: string | null;
  customer_email?: string | null;
  customer_details?: { email?: string | null; name?: string | null } | null;
  subscription?: string | null;
  metadata?: Record<string, string>;
}

/** Returns the subscriber's email when the session was a completed subscription. */
export async function applySubscriptionCheckout(s: CheckoutSession): Promise<string | null> {
  const m = s.metadata || {};
  if (m.kind !== 'venues_subscription') return null;
  if (s.status !== 'complete' || !s.subscription) return null;

  const email = (m.email || s.customer_details?.email || s.customer_email || '').toLowerCase();
  if (!email) return null;

  const { replaced } = await upsertSubscriber({
    email,
    name: m.name || s.customer_details?.name || '',
    company: m.company || '',
    plan: m.plan === 'bundle' ? 'bundle' : 'starter',
    categories: (m.categories || '').split(',').filter(isCategory),
    customer: s.customer || '',
    subscription: s.subscription,
    periodStart: new Date(s.created * 1000).toISOString(),
  });
  // Changing plan is a fresh checkout (Starter → Bundle, or adding categories),
  // so end the old subscription now, prorated. If the webhook and the redirect
  // both race here, the second cancel fails harmlessly on an already-cancelled sub.
  if (replaced) {
    await stripe('DELETE', `/subscriptions/${replaced}`, { prorate: true }).catch(err =>
      console.warn('[venues] could not cancel replaced subscription', replaced, err)
    );
  }
  return email;
}

export async function applyTopupCheckout(s: CheckoutSession): Promise<void> {
  const m = s.metadata || {};
  if (m.kind !== 'venues_topup' || s.payment_status !== 'paid' || !m.email) return;
  await addBonus(m.email, Number(m.reveals) || 5);
}

function mapStatus(stripeStatus: string): SubscriberStatus {
  if (stripeStatus === 'active' || stripeStatus === 'trialing') return 'active';
  if (stripeStatus === 'past_due' || stripeStatus === 'unpaid') return 'past_due';
  return 'cancelled';
}

export async function applySubscriptionStatus(subId: string, stripeStatus: string): Promise<void> {
  const sub = await findSubscriberBySubscription(subId);
  if (sub) await updateSubscriber(sub.id, { status: mapStatus(stripeStatus) });
}

interface Invoice {
  billing_reason?: string;
  subscription?: string | null;
  parent?: { subscription_details?: { subscription?: string } } | null;
  lines?: { data?: { period?: { start?: number } }[] };
}

/** Older API versions put the subscription on the invoice; newer ones under parent. */
function invoiceSubscription(inv: Invoice): string | null {
  return inv.subscription || inv.parent?.subscription_details?.subscription || null;
}

/** A renewal resets the month's reveal count. */
export async function applyInvoicePaid(inv: Invoice): Promise<void> {
  const subId = invoiceSubscription(inv);
  if (!subId) return;
  const sub = await findSubscriberBySubscription(subId);
  if (!sub) return;
  const start = inv.lines?.data?.[0]?.period?.start;
  await updateSubscriber(sub.id, {
    status: 'active',
    ...(inv.billing_reason === 'subscription_cycle' && start
      ? { periodStart: new Date(start * 1000).toISOString() }
      : {}),
  });
}

export async function applyInvoiceFailed(inv: Invoice): Promise<void> {
  const subId = invoiceSubscription(inv);
  if (!subId) return;
  const sub = await findSubscriberBySubscription(subId);
  if (sub) await updateSubscriber(sub.id, { status: 'past_due' });
}
