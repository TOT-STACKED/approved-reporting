-- Stacked Field: route plans. An agent (or a manager, for any agent) plans a
-- day's or a week's route as an ordered list of stops. Stops are ticked off as
-- visits are saved, and every route is kept as history: planned vs visited.
--
-- Stops live in one jsonb array, in order:
--   { id, venue_name, address, postcode, lat, lng, ref, status, visit_id, visited_at }
--   status: planned | visited | skipped
-- RLS on with no policies, like the rest of Field: server only.

create table if not exists public.field_routes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agent_id uuid not null references public.field_agents(id) on delete restrict,
  created_by uuid references public.field_agents(id) on delete set null,
  name text not null,
  period text not null default 'day' check (period in ('day', 'week')),
  starts_on date not null,
  stops jsonb not null default '[]'::jsonb,
  notes text
);
create index if not exists field_routes_agent on public.field_routes(agent_id, starts_on desc);
create index if not exists field_routes_starts on public.field_routes(starts_on desc);

alter table public.field_routes enable row level security;
