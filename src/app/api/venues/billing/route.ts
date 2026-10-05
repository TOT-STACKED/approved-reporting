import { NextResponse, type NextRequest } from 'next/server';
import { stripe } from '@/lib/stripe';
import { findSubscriber } from '@/lib/venue-subscribers';
import { viewerEntitlement } from '@/lib/venue-viewer';

export const dynamic = 'force-dynamic';

// Hand a subscriber to Stripe's billing portal to change card, see invoices
// or cancel. Cancelling there fires customer.subscription.* back to the webhook.
export async function POST(request: NextRequest) {
  try {
    const ent = await viewerEntitlement(request);
    if (!ent) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
    const sub = await findSubscriber(ent.email);
    if (!sub?.customer) return NextResponse.json({ error: 'No billing account on file.' }, { status: 404 });

    const portal = await stripe<{ url: string }>('POST', '/billing_portal/sessions', {
      customer: sub.customer,
      return_url: `${request.nextUrl.origin}/venues`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (error: unknown) {
    console.warn('[venues] billing portal failed', error);
    // Stripe's own message (it masks keys), so a setup problem is visible
    // on the page rather than only in the function logs.
    const detail = error instanceof Error ? error.message : '';
    return NextResponse.json({ error: 'Could not open billing. Try again shortly.', detail }, { status: 502 });
  }
}
