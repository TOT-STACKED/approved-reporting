-- Stacked Field: import the older Intelligence Reviews from the StackCollect
-- project (business_submissions) as well. One visit per StackCollect row,
-- so re-running the import never doubles one up.

alter table public.field_visits add column if not exists stackcollect_id text unique;
