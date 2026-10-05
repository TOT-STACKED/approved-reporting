import { NextResponse, type NextRequest } from 'next/server';
import { stripe, stripeConfigured } from '@/lib/stripe';
import {
  CATEGORY_LABELS,
  EXTRA_CATEGORY_PENCE,
  PLANS,
  TOPUP_PENCE,
  TOPUP_REVEALS,
  isCategory,
  type Category,
} from '@/lib/venue-plans';
import { findSubscriber } from '@/lib/venue-subscribers';
import { viewerEntitlement } from '@/lib/venue-viewer';

export const dynamic = 'force-dynamic';

// Start a Stripe Checkout. Two kinds:
//
//   { plan: 'starter'|'bundle', categories, email, name?, company? }
//       → a monthly subscription. Starter is £10 for its first category plus
//         £10 per extra; Bundle is £49 flat for all of them.
//   { topup: true }
//       → a one-off £10 for 5 more reveals, signed-in viewers only.
//
// Prices are set inline, so nothing has to be created in the Stripe dashboard
// first. Set STRIPE_PRICE_STARTER / _EXTRA / _BUNDLE / _TOPUP to use fixed
// Price objects instead (tidier reporting in Stripe once things settle).

function line(envPrice: string | undefined, pence: number, name: string, recurring: boolean, quantity = 1) {
  if (envPrice) return { price: envPrice, quantity };
  return {
    quantity,
    price_data: {
      currency: 'gbp',
      unit_amount: pence,
      product_data: { name },
      ...(recurring ? { recurring: { interval: 'month' } } : {}),
    },
  };
}

export async function POST(request: NextRequest) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'Payments are not switched on yet.' }, { status: 503 });
  }
  try {
    const body = (await request.json().catch(() => ({}))) as {
      plan?: string;
      categories?: unknown[];
      email?: string;
      name?: string;
      company?: string;
      topup?: boolean;
    };
    const origin = request.nextUrl.origin;

    if (body.topup) {
      const ent = await viewerEntitlement(request);
      if (!ent) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
      const sub = await findSubscriber(ent.email);
      const session = await stripe<{ url: string }>('POST', '/checkout/sessions', {
        mode: 'payment',
        ...(sub?.customer ? { customer: sub.customer } : { customer_email: ent.email }),
        line_items: [
          line(process.env.STRIPE_PRICE_TOPUP, TOPUP_PENCE, `Stacked Venues — ${TOPUP_REVEALS} extra reveals`, false),
        ],
        metadata: { kind: 'venues_topup', email: ent.email, reveals: TOPUP_REVEALS },
        success_url: `${origin}/venues?topup=1`,
        cancel_url: `${origin}/venues`,
      });
      return NextResponse.json({ url: session.url });
    }

    const plan = body.plan === 'bundle' ? 'bundle' : body.plan === 'starter' ? 'starter' : null;
    if (!plan) return NextResponse.json({ error: 'Pick a plan.' }, { status: 400 });

    const email = (body.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'Enter your work email.' }, { status: 400 });
    }

    const categories: Category[] = Array.from(new Set((body.categories || []).filter(isCategory)));
    if (plan === 'starter' && categories.length === 0) {
      return NextResponse.json({ error: 'Pick at least one category.' }, { status: 400 });
    }

    const lineItems =
      plan === 'bundle'
        ? [line(process.env.STRIPE_PRICE_BUNDLE, PLANS.bundle.pricePence, 'Stacked Venues — Bundle (25 reveals/mo, every category)', true)]
        : [
            line(
              process.env.STRIPE_PRICE_STARTER,
              PLANS.starter.pricePence,
              `Stacked Venues — Starter (5 reveals/mo, ${CATEGORY_LABELS[categories[0]]})`,
              true
            ),
            ...(categories.length > 1
              ? [line(process.env.STRIPE_PRICE_EXTRA, EXTRA_CATEGORY_PENCE, 'Stacked Venues — extra category', true, categories.length - 1)]
              : []),
          ];

    const metadata = {
      kind: 'venues_subscription',
      plan,
      categories: plan === 'bundle' ? '' : categories.join(','),
      email,
      name: (body.name || '').slice(0, 200),
      company: (body.company || '').slice(0, 200),
    };

    const session = await stripe<{ url: string }>('POST', '/checkout/sessions', {
      mode: 'subscription',
      customer_email: email,
      line_items: lineItems,
      metadata,
      subscription_data: { metadata },
      allow_promotion_codes: true,
      success_url: `${origin}/api/venues/welcome?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/venues/join`,
    });
    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    console.warn('[venues] checkout failed', error);
    // Stripe's own message (it masks keys), so a setup problem is visible
    // on the page rather than only in the function logs.
    const detail = error instanceof Error ? error.message : '';
    return NextResponse.json({ error: 'Could not start checkout. Try again shortly.', detail }, { status: 502 });
  }
}
