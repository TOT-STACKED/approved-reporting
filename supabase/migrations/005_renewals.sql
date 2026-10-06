-- Stacked Renewals: operators track their software, contracts and notice periods.
-- Project: kohnakdevwfudzgfjmab (the Intelligence Review project), so a venue's
-- stack can be seeded straight from its submission.
--
-- RLS is on with no policies: only the portal's server, using the service-role
-- key, can read or write. Operator data never reaches a partner surface.

create table if not exists public.renewals_orgs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  submission_id uuid references public.submissions(id) on delete set null,
  site_count integer
);

create table if not exists public.renewals_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.renewals_orgs(id) on delete cascade,
  email text not null unique check (email = lower(email)),
  name text,
  role text not null default 'member' check (role in ('owner', 'member')),
  alerts boolean not null default true,
  last_sign_in_at timestamptz
);
create index if not exists renewals_members_org on public.renewals_members(org_id);

create table if not exists public.renewals_tools (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  org_id uuid not null references public.renewals_orgs(id) on delete cascade,
  name text not null,
  supplier text,
  category text not null default 'other',
  sites text,
  cost_amount numeric(12,2),
  cost_period text not null default 'month' check (cost_period in ('month', 'year', 'one_off')),
  contract_start date,
  term_months integer check (term_months is null or term_months > 0),
  renewal_date date,
  notice_days integer check (notice_days is null or notice_days >= 0),
  auto_renew boolean not null default true,
  owner text,
  notes text,
  status text not null default 'active' check (status in ('active', 'cancelling', 'cancelled')),
  source text not null default 'manual' check (source in ('intelligence', 'manual', 'upload')),
  contract_path text,
  contract_name text,
  extracted jsonb
);
create index if not exists renewals_tools_org on public.renewals_tools(org_id);

-- One row per alert email, so a threshold is never sent twice for the same renewal.
create table if not exists public.renewals_alerts_sent (
  tool_id uuid not null references public.renewals_tools(id) on delete cascade,
  threshold integer not null,
  renewal_date date not null,
  sent_at timestamptz not null default now(),
  primary key (tool_id, threshold, renewal_date)
);

alter table public.renewals_orgs enable row level security;
alter table public.renewals_members enable row level security;
alter table public.renewals_tools enable row level security;
alter table public.renewals_alerts_sent enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('renewals-contracts', 'renewals-contracts', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;
