import { NextResponse, type NextRequest } from 'next/server';
import { stripe } from '@/lib/stripe';
import { applyTopupCheckout, type CheckoutSession } from '@/lib/venue-topup';

export const dynamic = 'force-dynamic';

// Stripe's success_url for a token top-up. Reads the session back from Stripe
// (the query string alone proves nothing) and credits the tokens, so they're
// there straight away. Safe to hit twice: crediting is idempotent per session.
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('session_id') || '';
  const back = (q: string) => NextResponse.redirect(new URL(`/venues?${q}`, request.url));
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return back('topup=pending');

  try {
    const s = await stripe<CheckoutSession>('GET', `/checkout/sessions/${id}`);
    return back((await applyTopupCheckout(s)) ? 'topup=1' : 'topup=pending');
  } catch (err) {
    console.warn('[venues] topup return failed', err);
    return back('topup=pending');
  }
}
