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

Scores, gaps and the "unhappy" filter are off (`PROMOTE.insights` in `src/lib/venue-plans.ts`).

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

Stripe is no longer used. `STRIPE_*` vars and the Stripe webhook for `/api/venues/webhook` can be
removed.
