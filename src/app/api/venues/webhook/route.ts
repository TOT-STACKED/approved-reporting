import { NextResponse, type NextRequest } from 'next/server';
import { verifyWebhook } from '@/lib/stripe';
import {
  applyInvoiceFailed,
  applyInvoicePaid,
  applySubscriptionCheckout,
  applySubscriptionStatus,
  applyTopupCheckout,
  type CheckoutSession,
} from '@/lib/venue-billing';

export const dynamic = 'force-dynamic';

// Stripe → Venue Subscribers. Register this URL in Stripe with these events:
//   checkout.session.completed, invoice.paid, invoice.payment_failed,
//   customer.subscription.updated, customer.subscription.deleted
// and put the signing secret in STRIPE_WEBHOOK_SECRET.
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyWebhook(raw, request.headers.get('stripe-signature'))) {
    return NextResponse.json({ error: 'bad signature' }, { status: 400 });
  }

  const event = JSON.parse(raw) as { type: string; data: { object: Record<string, unknown> } };
  const obj = event.data.object;

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = obj as unknown as CheckoutSession;
        await applySubscriptionCheckout(s);
        await applyTopupCheckout(s);
        break;
      }
      case 'invoice.paid':
        await applyInvoicePaid(obj);
        break;
      case 'invoice.payment_failed':
        await applyInvoiceFailed(obj);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await applySubscriptionStatus(String(obj.id), String(obj.status));
        break;
    }
  } catch (err) {
    // 500 so Stripe retries — every handler above is safe to run twice except
    // a top-up, and a retry only happens if the first attempt failed.
    console.warn(`[venues] webhook ${event.type} failed`, err);
    return NextResponse.json({ error: 'handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
