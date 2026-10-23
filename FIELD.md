# Stacked Field

Phone app for field agents. They walk into a venue, tag it on a map and record
what they see: visible tech, a venue profile, photos, notes and who they spoke
to. Managers get a team map showing where everyone has been.

Internal only for now. Nothing here reaches a partner surface, and contact
fields are lead data that is never sold. When it goes customer-facing, the
plan is to feed visits into the venue marketplace as "Field-verified".

- Agents: `partners.wearestacked.io/field`. On a phone, use Share → Add to Home Screen.
- Managers: the **Team map** tab (`/field/manage`) and **Team** (`/field/team`).

## How it works

- **Sign-in**: an emailed six-digit code, the same as Renewals. The session lasts
  60 days. It's invite-only: managers add people on the Team page. Anyone in
  `FIELD_MANAGERS` gets in as a manager the first time.
- **Tagging a venue**: GPS finds the phone, OpenStreetMap lists hospitality venues
  within 150 m (via the Overpass API, free and keyless), and the agent taps theirs.
  Anything not listed gets a dropped pin. The phone's GPS position and accuracy
  are saved with each visit as proof of the visit.
- **Drafts**: a new visit is kept on the phone (localStorage) as it's filled in, so
  losing signal loses nothing. Photos are shrunk to about 1600 px on the phone and
  uploaded as they're taken.
- **Map**: Google Maps if `NEXT_PUBLIC_GOOGLE_MAPS_KEY` is set at build time,
  otherwise Leaflet/OpenStreetMap. Team map pins are coloured per agent: filled
  for app visits, rings for imported Intelligence history. "Routes" joins each
  agent's visits for a day in the order they happened.
- **Intelligence history**: Team → *Import Intelligence history* brings every
  `submissions` row in as a back-dated visit, credited to the chosen agent (Caz,
  per Chris, 17 Oct 2026). Each review is placed by its postcode, or by its town
  centre if there's no postcode (marked as approximate). It's idempotent
  (`field_visits.submission_id` is unique), so re-running it only adds new reviews.

- **Intelligence Review in the field**: the visit's last step, *Review*, runs the
  full review with the operator. It's pre-filled from the contact and the tech the
  agent saw. On save it's written to `submissions` (same shape and scoring as the form
  and Renewals, via `lib/intelligence-review.ts`), so the Slack ping, the AI report
  emailed to the operator, the portal and the marketplace all pick it up. The visit
  links to it through `submission_id`. Consent is required (the agent ticks it on the
  operator's say-so), because the report is emailed to them.
- **No location yet**: imported reviews that can't be placed come in without a pin
  (migration 007) and are listed on the team map. Edit one and tap the map to place it.

- **Routes** (`/field/routes`): plan a day or a week as an ordered list of stops,
  picked by search, by tapping known venues, or by dropping a pin. *Best order* sorts
  them nearest-next, and *Directions* opens Google Maps walking directions. *Start visit
  here* opens a visit pre-filled for that stop, and saving it ticks the stop off. A visit
  saved within 75 m of a planned stop on today's route is ticked off too. Every route is
  kept, showing planned (orange) vs where the agent actually went (green). Managers can
  plan for anyone. Table `field_routes` (migration 009).
- **Insights** (`/field/insights`): what's being seen (POS, card terminals,
  order-at-table, bookings), gaps (where agents ticked "None here"), postcode areas,
  venue mix and weekly activity per agent. Repeat reviews of one venue count once.
- **Seen tech in the portal**: app visits without a review feed the portal's market
  stats (`getFieldObservedVenues` in `lib/stackcollect.ts`), labelled `field-observed`.
  They count in tool and category counts and in `/api/stacks`, but never in review
  counts. A visit is skipped if it has a review or if a review exists for a business
  with the same name. They're not in the Airtable tech-usage sync or the marketplace.

- **Slack**: every saved visit posts to #stacked-intelligence-reports via the
  "Stacked Field" Slack app's incoming webhook (`FIELD_SLACK_WEBHOOK_URL`, secret).
  It includes the contact's details (Chris, 23 Oct 2026), and 🔥 marks a yes to a demo.
  A full review also gets its usual ping from the main system.
- **Google**: project "Stacked Field" in Google Cloud. `NEXT_PUBLIC_GOOGLE_MAPS_KEY`
  (browser key, locked to partners.wearestacked.io and approvedreporting.netlify.app)
  and `GOOGLE_PLACES_SERVER_KEY` (Places API (New) only, secret). Budget alert is
  £50/month.

## Where things live

- Supabase `kohnakdevwfudzgfjmab`: tables `field_agents` and `field_visits`, plus the
  private bucket `field-photos`. RLS is on with no policies, so only the server can
  touch them. Schema: `supabase/migrations/006_field.sql`.
- Code: `src/lib/field-*.ts`, `src/app/field/*`, `src/app/api/field/*`, `src/components/field/*`.

## One-time setup

1. Run `supabase/migrations/006_field.sql`, then `007_field_unplaced.sql`, `008_field_stackcollect.sql` and `009_field_routes.sql`, in the Supabase SQL editor for kohnakdevwfudzgfjmab.
2. Netlify env vars:
   - `FIELD_MANAGERS`: comma-separated manager emails, e.g. `fletch@wearestacked.io`
   - `NEXT_PUBLIC_GOOGLE_MAPS_KEY` (optional, switches the map to Google). In Google Cloud,
     enable the Maps JavaScript API, create a key restricted to HTTP referrers
     `partners.wearestacked.io/*` and `approvedreporting.netlify.app/*`, then redeploy.
   - `VENUES_SUPABASE_URL/KEY`, `SESSION_SECRET` and `RESEND_API_KEY` are already set.
3. Sign in at `/field`, add Caz on Team, then press *Import Intelligence history*.
