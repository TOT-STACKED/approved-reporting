-- Approved Reporting: partners the team has hidden from the internal
-- dashboard. Partners come on and off the programme, so hiding is not
-- deleting: a row here keeps the partner out of the Partner Health boxes and
-- the Performance table for everyone until someone brings them back, which
-- deletes the row. Keyed on the canonical partner slug (see
-- canonicalPartnerSlug in src/lib/airtable.ts).
-- RLS on with no policies, like Field: only the portal server can touch it.

create table if not exists public.portal_hidden_partners (
  slug text primary key,
  name text,
  hidden_at timestamptz not null default now()
);

alter table public.portal_hidden_partners enable row level security;
