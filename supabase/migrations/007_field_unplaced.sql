-- Stacked Field: let a visit exist without a map position yet. Intelligence
-- Reviews whose location can't be found (a typo, "Midlands", somewhere abroad)
-- are still imported, marked geo_precision='none', and listed on the team map
-- as "No location yet" until someone drops their pin.

alter table public.field_visits alter column lat drop not null;
alter table public.field_visits alter column lng drop not null;

alter table public.field_visits drop constraint if exists field_visits_geo_precision_check;
alter table public.field_visits add constraint field_visits_geo_precision_check
  check (geo_precision in ('exact', 'postcode', 'town', 'none'));

-- A pin and its precision go together.
alter table public.field_visits add constraint field_visits_pin_check
  check ((lat is null) = (lng is null) and ((lat is null) = (geo_precision = 'none')));
