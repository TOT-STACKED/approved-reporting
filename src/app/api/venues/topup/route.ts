import { NextResponse, type NextRequest } from 'next/server';
import { stripe, stripeConfigured } from '@/lib/stripe';
import { TOPUP_PENCE, TOPUP_TOKENS } from '@/lib/venue-plans';
import { findSubscriber } from '@/lib/venue-subscribers';
import { viewerEntitlement } from '@/lib/venue-viewer';

export const dynamic = 'force-dynamic';

// "Buy more tokens": a one-off Stripe Checkout for 5 extra tokens at £59,
// signed-in Promote partners only. The price is sent inline, so nothing has to
// be created in Stripe first; set STRIPE_PRICE_TOPUP to use a fixed Price.
export async function POST(request: NextRequest) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'Buying tokens isn’t switched on yet. Talk to the Stacked team.' }, { status: 503 });
  }
  try {
    const ent = await viewerEntitlement(request);
    if (!ent) return NextResponse.json({ error: 'Sign in with your Promote partner email first.' }, { status: 401 });

    const sub = await findSubscriber(ent.email);
    const origin = request.nextUrl.origin;
    const price = process.env.STRIPE_PRICE_TOPUP;
    const session = await stripe<{ url: string }>('POST', '/checkout/sessions', {
      mode: 'payment',
      ...(sub?.customer ? { customer: sub.customer } : { customer_email: ent.email, customer_creation: 'always' }),
      line_items: [
        price
          ? { price, quantity: 1 }
          : {
              quantity: 1,
              price_data: {
                currency: 'gbp',
                unit_amount: TOPUP_PENCE,
                product_data: { name: `Stacked Venues: ${TOPUP_TOKENS} extra tokens` },
              },
            },
      ],
      metadata: { kind: 'venues_topup', email: ent.email, tokens: TOPUP_TOKENS },
      success_url: `${origin}/api/venues/topup/done?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/venues`,
    });
    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    console.warn('[venues] topup checkout failed', error);
    // Stripe's own message (it masks keys), so a setup problem shows on the page.
    const detail = error instanceof Error ? error.message : '';
    return NextResponse.json({ error: 'Could not start checkout. Try again shortly.', detail }, { status: 502 });
  }
}
