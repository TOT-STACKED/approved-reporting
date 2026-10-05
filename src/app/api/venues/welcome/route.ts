import { NextResponse, type NextRequest } from 'next/server';
import { stripe } from '@/lib/stripe';
import { applySubscriptionCheckout, type CheckoutSession } from '@/lib/venue-billing';
import { VENUE_COOKIE_OPTIONS, VENUE_SESSION_COOKIE, makeVenueSession } from '@/lib/venue-auth';

export const dynamic = 'force-dynamic';

// Stripe's success_url. Reads the Checkout session back from Stripe (so the
// query string alone proves nothing), writes the subscriber row, and signs
// them straight in — no "now go and check your email" step after paying.
//
// Only honoured for an hour after checkout: the URL sits in browser history,
// and it shouldn't stay a sign-in link forever.
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('session_id') || '';
  const fail = NextResponse.redirect(new URL('/venues/signin?paid=1', request.url));
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return fail;

  try {
    const s = await stripe<CheckoutSession>('GET', `/checkout/sessions/${id}`);
    if (Date.now() / 1000 - s.created > 60 * 60) return fail;
    const email = await applySubscriptionCheckout(s);
    if (!email) return fail;

    const res = NextResponse.redirect(new URL('/venues?welcome=1', request.url));
    res.cookies.set(VENUE_SESSION_COOKIE, makeVenueSession(email), VENUE_COOKIE_OPTIONS);
    return res;
  } catch (err) {
    console.warn('[venues] welcome failed', err);
    return fail;
  }
}
