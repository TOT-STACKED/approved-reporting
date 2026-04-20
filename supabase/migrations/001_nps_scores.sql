-- Approved-reporting portal — unified NPS ingestion table
--
-- Collects Net Promoter Score data from every Tech on Toast touchpoint:
--   * techstackreview  (stackedchat.io /stack-builder)  — per-product NPS
--   * toast-support-bot (stackedchat.io)                 — per-vendor chat NPS
--
-- Both apps POST directly into `public.nps_scores` via the portal's anon key
-- (RLS only permits inserts, no reads/updates from anon).
--
-- Run this once in the portal Supabase SQL editor.

create table if not exists public.nps_scores (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),

  -- Provenance
  source            text not null check (source in ('techstackreview', 'toast-support-bot')),
  touchpoint        text,            -- e.g. 'product-selection', 'vendor-chat', 'ticket-submission'

  -- Score
  score             integer not null check (score between 0 and 10),
  comment           text,

  -- What was rated
  vendor            text,            -- product/vendor name (required in practice)
  category          text,            -- e.g. 'EPOS', 'Payments' (techstackreview only)

  -- Who rated (best-effort; may be null for anon submissions)
  respondent_name   text,
  respondent_email  text,
  company           text,
  venue_id          text,            -- toast-support-bot's venue concept

  -- Link back to the source record (submission_id, conversation_id, etc.)
  external_id       text,

  -- Overflow / future fields
  meta              jsonb not null default '{}'::jsonb
);

-- Indexes for dashboard roll-ups
create index if not exists nps_scores_created_at_idx on public.nps_scores (created_at desc);
create index if not exists nps_scores_source_idx    on public.nps_scores (source);
create index if not exists nps_scores_vendor_idx    on public.nps_scores (vendor);
create index if not exists nps_scores_score_idx    on public.nps_scores (score);

-- RLS: anon can insert, nothing else. Dashboard reads use the service role key.
alter table public.nps_scores enable row level security;

drop policy if exists "anon can insert nps scores" on public.nps_scores;
create policy "anon can insert nps scores"
  on public.nps_scores
  for insert
  to anon
  with check (true);
