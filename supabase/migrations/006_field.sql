-- Stacked Field: agents walk into venues, tag them on a map and record what
-- they see — the visible tech stack, a venue profile, photos, notes and who
-- they spoke to. Project: kohnakdevwfudzgfjmab, alongside `submissions`, so
-- field visits can later be merged into the venue marketplace.
--
-- RLS is on with no policies: only the portal's server, using the service-role
-- key, can read or write. Internal only for now — nothing here reaches a
-- partner surface. Contact fields are lead data and are never to be sold.

create table if not exists public.field_agents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null unique check (email = lower(email)),
  name text,
  role text not null default 'agent' check (role in ('agent', 'manager')),
  active boolean not null default true,
  last_sign_in_at timestamptz
);

create table if not exists public.field_visits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  visited_at timestamptz not null default now(),
  agent_id uuid not null references public.field_agents(id) on delete restrict,

  -- 'field' is a visit logged in the app; 'intelligence' is an Intelligence
  -- Review brought in as a back-dated visit (one per submission).
  source text not null default 'field' check (source in ('field', 'intelligence')),
  submission_id uuid unique references public.submissions(id) on delete set null,

  -- The venue, as tagged on the map.
  venue_name text not null,
  address text,
  postcode text,
  osm_ref text,                 -- e.g. "node/123456" when picked from the map
  lat double precision not null,
  lng double precision not null,
  -- How exact the pin is: tagged on site, a postcode centre, or a town centre.
  geo_precision text not null default 'exact' check (geo_precision in ('exact', 'postcode', 'town')),

  -- Where the agent's phone was when they saved, as proof of visit.
  gps_lat double precision,
  gps_lng double precision,
  gps_accuracy_m integer,

  -- Venue profile.
  venue_type text,
  covers text,
  ownership text check (ownership is null or ownership in ('independent', 'group', 'franchise', 'unknown')),
  group_name text,
  busyness text check (busyness is null or busyness in ('quiet', 'steady', 'busy', 'packed')),

  -- Visible tech: { category: { tools: [...], other: "", none: bool } }, the
  -- same shape as submissions.stack so the two can be merged.
  stack jsonb not null default '{}'::jsonb,
  notes text,

  -- Lead data. Internal only.
  contact_name text,
  contact_role text,
  contact_email text,
  contact_phone text,
  demo_interest text check (demo_interest is null or demo_interest in ('yes', 'maybe', 'no')),

  photos text[] not null default '{}'
);
create index if not exists field_visits_agent on public.field_visits(agent_id, visited_at desc);
create index if not exists field_visits_visited on public.field_visits(visited_at desc);
create index if not exists field_visits_osm on public.field_visits(osm_ref);

alter table public.field_agents enable row level security;
alter table public.field_visits enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('field-photos', 'field-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
