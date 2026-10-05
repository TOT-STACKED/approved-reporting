# Venue marketplace — partners.wearestacked.io/venues

Tech partners pay to see which venues run which tech. A venue's trading name and stack, never
contact details. Only Tech stack review submissions with `consent = true` are listed, one per brand.

## Plans

| Plan | Price | Reveals / month | Sees |
|---|---|---|---|
| Starter | £10 + £10 per extra category | 5 | Tools in their chosen categories |
| Bundle | £49 | 25 | Every category, plus scores out of 10, gaps and the "unhappy" filter |
| Approved partner | included | 25 | Same as Bundle. Anyone in Partner Users whose partner's Package is Approved |
| Top-up | £10 one-off | +5 | Bonus reveals, which never expire |

Prices live in `src/lib/venue-plans.ts`.

## Where things live

- **Venue data**: Supabase `kohnakdevwfudzgfjmab`, table `submissions`. `src/lib/venues.ts` selects
  named columns only (no email, phone or personal names) and anonymises unrevealed venues on the server.
- **Subscribers**: Airtable, Stacked website base, table **Venue Subscribers**. Written by the Stripe
  webhook. To revoke someone, delete their row or set Status to `cancelled`.
- **Reveals**: Airtable table **Venue Reveals**, one row per unlock.

## One-time setup (Netlify env vars)

| Var | Value |
|---|---|
| `VENUES_SUPABASE_URL` | `https://kohnakdevwfudzgfjmab.supabase.co` |
| `VENUES_SUPABASE_KEY` | the service-role key for that project (RLS blocks the anon key) |
| `STRIPE_SECRET_KEY` | `sk_live_…`, or `sk_test_…` to try it out first |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from the webhook below |

In Stripe, go to **Developers → Webhooks → Add endpoint**:
`https://partners.wearestacked.io/api/venues/webhook`, with these events:
`checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
`customer.subscription.updated`, `customer.subscription.deleted`.

Turn on the **Customer portal** (Settings → Billing → Customer portal) so "Manage billing" works.
Allow card updates, invoices and cancellation. Leave plan switching off, because changing plan goes
through `/venues/join`, which cancels the old subscription itself.

Optional: once things settle, create fixed Prices and set `STRIPE_PRICE_STARTER`,
`STRIPE_PRICE_EXTRA`, `STRIPE_PRICE_BUNDLE` and `STRIPE_PRICE_TOPUP`. Until then, prices are sent
inline with each checkout.
