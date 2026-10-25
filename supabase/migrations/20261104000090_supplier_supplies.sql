-- Suppliers: what each one supplies (drinks, food, coffee, fruit & veg, groceries), for the filters
-- on the Suppliers page. An admin ticks them on the supplier; until they do, the page works them out
-- from the supplier's type, name and items (shared/stock.ts suppliesOf). Admins change suppliers as
-- before (suppliers_admin, the stock migration).
alter table public.suppliers add column supplies text[] not null default '{}'
  check (supplies <@ array['drinks', 'food', 'coffee', 'fruit_veg', 'groceries']::text[]);
