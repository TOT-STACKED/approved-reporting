-- Approved Reporting: team notes on partners, shown on the internal
-- dashboard only (never on a partner's own page). A note can be flagged as
-- an action; open flagged notes appear in "This week's to-dos" until someone
-- marks them done. Keyed on the canonical partner slug (canonicalPartnerSlug).
-- RLS on with no policies: only the portal server can touch it.

create table if not exists public.portal_partner_notes (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  body text not null check (char_length(body) between 1 and 2000),
  author text,
  is_action boolean not null default false,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by text
);
create index if not exists portal_partner_notes_slug on public.portal_partner_notes(slug, created_at desc);

alter table public.portal_partner_notes enable row level security;
