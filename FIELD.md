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

## Where things live

- Supabase `kohnakdevwfudzgfjmab`: tables `field_agents` and `field_visits`, plus the
  private bucket `field-photos`. RLS is on with no policies, so only the server can
  touch them. Schema: `supabase/migrations/006_field.sql`.
- Code: `src/lib/field-*.ts`, `src/app/field/*`, `src/app/api/field/*`, `src/components/field/*`.

## One-time setup

1. Run `supabase/migrations/006_field.sql` in the Supabase SQL editor for kohnakdevwfudzgfjmab.
2. Netlify env vars:
   - `FIELD_MANAGERS`: comma-separated manager emails, e.g. `fletch@wearestacked.io`
   - `NEXT_PUBLIC_GOOGLE_MAPS_KEY` (optional, switches the map to Google). In Google Cloud,
     enable the Maps JavaScript API, create a key restricted to HTTP referrers
     `partners.wearestacked.io/*` and `approvedreporting.netlify.app/*`, then redeploy.
   - `VENUES_SUPABASE_URL/KEY`, `SESSION_SECRET` and `RESEND_API_KEY` are already set.
3. Sign in at `/field`, add Caz on Team, then press *Import Intelligence history*.
