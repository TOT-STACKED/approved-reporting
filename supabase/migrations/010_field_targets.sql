-- Stacked Field: target venues. A manager adds a brand or group (Greene King
-- and its sub-brands, a pub company, a restaurant chain) and the app loads its
-- venues from All The Places (alltheplaces.xyz, CC0): each brand's own
-- store-finder, collected weekly, with addresses and postcodes. They show on
-- the team map and the route planner as targets, ticked off when a visit is
-- logged at one.
--
-- Whether a target has been visited is worked out when it's read (matched to
-- visits by distance and name), so nothing here goes stale.
-- RLS on with no policies, like the rest of Field: server only.

create table if not exists public.field_target_lists (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references public.field_agents(id) on delete set null,
  name text not null,
  -- All The Places spider names, e.g. {"greene_king_pubs_gb","hungry_horse_gb"}
  sources text[] not null default '{}',
  synced_at timestamptz
);

create table if not exists public.field_targets (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.field_target_lists(id) on delete cascade,
  -- "<spider>:<the brand's own id for the venue>", so a refresh updates in place
  source_ref text not null,
  name text not null,
  brand text,
  kind text,
  address text,
  postcode text,
  website text,
  phone text,
  lat double precision not null,
  lng double precision not null,
  unique (list_id, source_ref)
);
create index if not exists field_targets_list on public.field_targets(list_id);

alter table public.field_target_lists enable row level security;
alter table public.field_targets enable row level security;
