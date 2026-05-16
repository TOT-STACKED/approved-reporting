-- Approved-reporting portal — internal knowledge base
--
-- A mixed library of links (quotes, proposals, articles, research, anything
-- with a URL). On add, the portal fetches the page server-side and stores the
-- extracted text in `content` so the AI can answer questions from the actual
-- page contents, not just the title/notes.
--
-- Internal only: the portal reads + writes with the service role key, which
-- bypasses RLS. RLS is enabled with NO anon policies, so nothing is reachable
-- with the public anon key.
--
-- Run this once in the portal Supabase SQL editor.

create table if not exists public.knowledge_base (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  url         text not null,
  title       text,                       -- page <title> or user-supplied
  notes       text,                       -- free-text note the team adds
  content     text,                       -- extracted page text (may be empty if fetch failed / login-walled)
  domain      text,                       -- hostname, for grouping/filtering
  fetch_ok    boolean not null default false,
  fetch_error text,                       -- why extraction failed, if it did

  added_by    text                        -- optional: who added it
);

create index if not exists knowledge_base_created_at_idx on public.knowledge_base (created_at desc);
create index if not exists knowledge_base_domain_idx     on public.knowledge_base (domain);

-- RLS on, no policies → only the service role key (used by the portal) can
-- touch this table. Anon key gets nothing.
alter table public.knowledge_base enable row level security;
