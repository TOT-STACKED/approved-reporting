# Venue marketplace — partners.wearestacked.io/venues

Promote partners see which venues run which tech. They see a venue's trading name and stack, never
contact details. Only Tech stack review submissions with `consent = true` are listed, one per brand.

## Access

Venues is part of the **Promote** package (£249/mo) and isn't sold separately. Lite and Approved
partners don't get it. Access is decided by the partner's **Package** field on the marketplace
Partners table: anyone in Partner Users whose partner is on Promote can sign in.

Each calendar month (UTC), a Promote user gets:

- **5 reveals.** One token reveals one venue. Unused reveals don't roll over, and revealed venues stay
  unlocked.
- **Up to 5 categories**, which they pick the first time they sign in that month. Reveals show the
  tools in those categories. The pick is locked until the 1st so that 5 reveals can't be used to read
  every category in turn.

- **Buy more tokens:** £59 for 5, one-off through Stripe Checkout (`TOPUP_*` in
  `src/lib/venue-plans.ts`). Bought tokens never expire and are spent only once the monthly 5 are used.
  They're held in Bonus on the user's Venue Subscribers row. Top-up Sessions logs each credited Stripe
  session, so a payment can't be credited twice.

Promote also includes the scores out of 10, gaps and the "unhappy" filter (`PROMOTE.insights` in `src/lib/venue-plans.ts`).

## Where things live

- **Venue data**: Supabase `kohnakdevwfudzgfjmab`, table `submissions`. `src/lib/venues.ts` selects
  named columns only (no email, phone or personal names) and anonymises unrevealed venues on the server.
- **Category picks**: Airtable, Stacked website base, table **Venue Subscribers**. There's one row per
  email, holding the categories picked and the month they were picked for (Period Start). To let
  someone re-pick mid-month, clear their Categories.
- **Reveals**: Airtable table **Venue Reveals**, one row per unlock.

## Env vars (Netlify)

| Var | Value |
|---|---|
| `VENUES_SUPABASE_URL` | `https://kohnakdevwfudzgfjmab.supabase.co` |
| `VENUES_SUPABASE_KEY` | the service-role key for that project (RLS blocks the anon key) |
| `STRIPE_SECRET_KEY` | `sk_live_…` (or `sk_test_…` to try it). Without it the Buy button says top-ups aren't on yet |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from the webhook below |
| `STRIPE_PRICE_TOPUP` | optional fixed Price ID; otherwise £59 is sent inline with each checkout |

In Stripe, go to **Developers → Webhooks → Add endpoint**:
`https://partners.wearestacked.io/api/venues/webhook`, with the event `checkout.session.completed`.
The return redirect credits tokens straight away. The webhook is the backstop for someone who pays
and closes the tab before getting back.
