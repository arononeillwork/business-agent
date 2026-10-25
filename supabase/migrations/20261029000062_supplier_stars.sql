-- Suppliers: a star on the ones the café relies on, so the Suppliers page can show just those
-- (beside Active, the ones bought from now, and Catalogue, every supplier on file). Admins star
-- them, as they make every other change to a supplier (suppliers_admin, migration 52).
alter table public.suppliers add column starred boolean not null default false;
