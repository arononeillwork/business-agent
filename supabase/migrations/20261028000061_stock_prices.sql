-- Wholesale prices over time: every time an item's cost per unit changes, the new price is kept
-- (and the one before it), so the Wholesale page can show what went up, by how much and when.
-- Written by the database only (the trigger); read by whoever can read the items.

create table public.stock_item_prices (
  id             bigserial primary key,
  item_id        uuid not null references public.stock_items on delete cascade,
  cost_per_unit  numeric(10, 2) not null check (cost_per_unit >= 0),
  changed_at     timestamptz not null default now(),
  changed_by     uuid references auth.users on delete set null
);
create index stock_item_prices_item_idx on public.stock_item_prices (item_id, changed_at desc);

-- The prices there are now count as the first ones.
insert into public.stock_item_prices (item_id, cost_per_unit, changed_at)
select id, cost_per_unit, updated_at from public.stock_items where cost_per_unit is not null;

create or replace function public.stock_price_kept() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.cost_per_unit is not null and (tg_op = 'INSERT' or new.cost_per_unit is distinct from old.cost_per_unit) then
    insert into public.stock_item_prices (item_id, cost_per_unit, changed_by) values (new.id, new.cost_per_unit, auth.uid());
  end if;
  return null;
end $$;
revoke execute on function public.stock_price_kept() from public, anon, authenticated;
create trigger stock_items_price_kept after insert or update of cost_per_unit on public.stock_items
  for each row execute function public.stock_price_kept();

alter table public.stock_item_prices enable row level security;
revoke all on public.stock_item_prices from anon;
revoke insert, update, delete on public.stock_item_prices from authenticated;
create policy stock_item_prices_read on public.stock_item_prices for select to authenticated
  using ((select public.is_staff()) or (select public.partner_can('finances')));

-- An index on the foreign key to auth.users, as the foreign_key_indexes migration has for every other
-- table, so deleting an account doesn't read the price history in full.
create index if not exists stock_item_prices_changed_by_idx on public.stock_item_prices (changed_by);
