import { NextResponse, type NextRequest } from 'next/server';
import { verifyWebhook } from '@/lib/stripe';
import { applyTopupCheckout, type CheckoutSession } from '@/lib/venue-topup';

export const dynamic = 'force-dynamic';

// Stripe → bought tokens. The backstop for a partner who pays and closes the
// tab before the return redirect lands. Register this URL in Stripe for
// checkout.session.completed and put the signing secret in
// STRIPE_WEBHOOK_SECRET.
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyWebhook(raw, request.headers.get('stripe-signature'))) {
    return NextResponse.json({ error: 'bad signature' }, { status: 400 });
  }

  const event = JSON.parse(raw) as { type: string; data: { object: Record<string, unknown> } };
  try {
    if (event.type === 'checkout.session.completed') {
      await applyTopupCheckout(event.data.object as unknown as CheckoutSession);
    }
  } catch (err) {
    // 500 so Stripe retries. Crediting is idempotent per session, so a retry
    // can't double up.
    console.warn(`[venues] webhook ${event.type} failed`, err);
    return NextResponse.json({ error: 'handler failed' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
