-- Square's customer directory comes into Customers by itself (the Worker, after connecting Square
-- and every 15 minutes). Those people have source 'square' and keep Square's id, so each one is
-- added once and later changes find them again.

alter table public.customers drop constraint customers_source_check;
alter table public.customers add constraint customers_source_check
  check (source in ('walk_in', 'instagram', 'facebook', 'tiktok', 'website', 'google', 'referral', 'event', 'square', 'other'));

alter table public.customers add column square_id text unique check (char_length(square_id) <= 191);
