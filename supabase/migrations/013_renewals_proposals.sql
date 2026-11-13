-- Stacked Renewals: supplier proposals an operator compares against the tools
-- they already pay for. Private to the venue's team, like everything in
-- Renewals: RLS on with no policies, so only the portal's server can read or
-- write. Proposal PDFs go in the existing private renewals-contracts bucket
-- under <org id>/proposals/.

create table if not exists public.renewals_proposals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  org_id uuid not null references public.renewals_orgs(id) on delete cascade,
  name text not null,
  supplier text,
  category text not null default 'other',
  -- renewals_tools ids this proposal would replace. Not a foreign key: a
  -- deleted tool just drops out of the comparison.
  replaces uuid[] not null default '{}',
  sites integer check (sites is null or sites > 0),
  term_months integer check (term_months is null or term_months > 0),
  start_date date,
  -- [{label, kind, amount, period, basis, quantity}], validated by the server.
  lines jsonb not null default '[]'::jsonb,
  notes text,
  file_path text,
  file_name text,
  extracted jsonb
);
create index if not exists renewals_proposals_org on public.renewals_proposals(org_id);

alter table public.renewals_proposals enable row level security;
