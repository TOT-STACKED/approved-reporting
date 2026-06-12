-- Approved-reporting portal — partner-submitted feedback on leads.
--
-- Partners on a /p/<token> page can flag the real-world status of a lead
-- (e.g. "actually now SQL", "closed lost", "on hold") via a small inline
-- form. The Tech on Toast team sees the feedback on the internal
-- /partners/<slug> page.
--
-- Writes are server-side (POST /api/p/<token>/feedback) with the service-role
-- key after the token has resolved to a partner_slug. RLS on with no anon
-- policy — anon key can't touch this table directly.

create table if not exists public.lead_feedback (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),

  partner_slug        text not null,
  lead_id             text not null,            -- Airtable record id (recXXXX)
  lead_business_name  text,                     -- snapshot so reports survive lead deletes

  reported_status     text not null,            -- dropdown selection
  comment             text,                     -- optional free-text note

  source_token_tail   text                      -- last 8 chars of token, for audit
);

create index if not exists lead_feedback_partner_slug_idx
  on public.lead_feedback (partner_slug, created_at desc);

alter table public.lead_feedback enable row level security;
