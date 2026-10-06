# Stacked Renewals: renewals.wearestacked.io

Operators track every tool they pay for, what it costs and the last day they can give notice before it
auto-renews. Free for any venue that has done an Intelligence Review. Strictly neutral: suppliers and
partners never see any of it.

## How it works

- **Sign-in**: email code, as with partners. A code goes to anyone already on a Renewals team, or to anyone
  with an Intelligence Review (`submissions.email`). The first sign-in from a review creates the account
  and seeds it with every tool from that review.
- **Contracts**: an operator uploads a PDF. It's stored in the private `renewals-contracts` bucket and
  read by OpenAI (`RENEWALS_EXTRACT_MODEL`, default `gpt-4o`). Every extracted field is shown highlighted
  for the operator to check before saving. Nothing is saved from a contract unseen.
- **Alerts**: `netlify/functions/renewals-alerts.mts` runs daily at 07:00 UTC, calling `/api/renewals/alerts`.
  Emails go out 60, 30, 14, 7 and 1 day before each notice deadline, one email per venue per day.
  Contracts that auto-renew on a known term roll their dates forward on their own. Rolling monthly
  contracts (term = 1 month) get no alerts.
- **Ask Renewals**: a chat panel on the dashboard (`/api/renewals/ask`, `RENEWALS_ASK_MODEL`, default
  `gpt-4o-mini`). It sees only the signed-in venue's own tools, answers questions about spend and deadlines,
  flags gaps and overlaps, and drafts cancellation emails. It never recommends a named supplier.
  Conversations aren't stored.
- **Team**: anyone on an account can add colleagues for free. Only the owner can remove them.

## Where things live

| What | Where |
|---|---|
| Tables | Supabase `kohnakdevwfudzgfjmab`: `renewals_orgs`, `renewals_members`, `renewals_tools`, `renewals_alerts_sent` (migration `supabase/migrations/005_renewals.sql`, already applied) |
| Contract PDFs | Storage bucket `renewals-contracts` (private, PDF only, 10MB) |
| Pages | `src/app/renewals`, components in `src/components/renewals` |
| API | `src/app/api/renewals` |
| Logic | `src/lib/renewals-*.ts` |

RLS is on with no policies, so only the server (service-role key) can read or write. On the
`renewals.` host, `src/proxy.ts` 404s everything except `/renewals` and `/api/renewals/*`, so the operator
domain never leads to a partner surface.

## Go-live checklist

1. **Netlify env vars**: `VENUES_SUPABASE_URL` and `VENUES_SUPABASE_KEY` (shared with the venue marketplace),
   `RESEND_API_KEY`, `OPENAI_API_KEY`, `DIGEST_SECRET` and `SESSION_SECRET`. Most are already set.
   Optional: `RENEWALS_URL` (default `https://renewals.wearestacked.io`), `RENEWALS_FROM`,
   `NEXT_PUBLIC_INTELLIGENCE_REVIEW_URL` (where "Do your review" links to).
2. **Domain**: in Netlify, go to Domain management and add the domain alias `renewals.wearestacked.io`.
   Then at GoDaddy, add a CNAME `renewals` pointing at the Netlify site.
3. **Resend**: the sender domain must be verified for emails to reach operators.

Until the domain is live, it also works at `partners.wearestacked.io/renewals`. Once
`renewals.wearestacked.io` loads, set `RENEWALS_FORWARD=true` in Netlify and redeploy. The old
partner-domain links then forward to the operator domain, so operators never land on a partner address.

## Removing someone

Delete their `renewals_members` row. To remove a whole venue, delete its `renewals_orgs` row; tools,
members and alert history cascade. Its PDFs stay in the bucket under `<org id>/` and need deleting there.
