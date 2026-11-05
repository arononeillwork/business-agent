-- Freshly made (Stock): the menu items with a set shelf life, the ones made here and sold within hours or
-- days (today's pastries, chia puddings, yoghurt pots, a cheesecake). For each: how long it keeps once
-- it's made and, if it goes on offer before it has to be gone, from how long before the end and at what
-- discount ("25% off for the last 2 days of 5"). A batch recorded of one starts from these, so its offer
-- goes on Offers & specials by itself (the `fresh_batches` migration).
-- Read from Square when the item has a "Shelf life" custom attribute in its item library (the Worker,
-- with the menu: worker/menu.ts, kept in step while it's there), or set here by an admin.
-- Who: admins set them; the team and finance partners read.

create table public.fresh_items (
  id               uuid primary key default gen_random_uuid(),
  -- The menu item (Menu costing; from Square when that's where the menu comes from).
  recipe_id        uuid not null references public.recipes on delete cascade,
  -- How long it keeps once made.
  shelf_life_hours int not null check (shelf_life_hours between 1 and 720),
  -- The shelf life is Square's (the item's "Shelf life" custom attribute there), so Square changes it.
  from_square      boolean not null default false,
  -- Its offer, if it has one: from this long before it has to be gone, and what it takes off (a % off
  -- the menu price, or a set price as shown: "2 for €5").
  offer_hours      int check (offer_hours >= 1),
  discount         text not null default 'percent' check (discount in ('percent', 'price')),
  percent_off      int not null default 30 check (percent_off between 5 and 90),
  price            text check (char_length(price) <= 40),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users on delete set null default auth.uid(),
  constraint fresh_items_offer check (offer_hours is null or offer_hours < shelf_life_hours),
  constraint fresh_items_price check (offer_hours is null or discount = 'percent' or price is not null)
);
select public.add_business_scope('public.fresh_items');
create unique index fresh_items_recipe_key on public.fresh_items (business_id, recipe_id);
create index fresh_items_recipe_idx on public.fresh_items (recipe_id);
create index fresh_items_updated_by_idx on public.fresh_items (updated_by);

-- Tidy the price; only this business's menu items; who changed it and when. As the owner, so the menu
-- item is found whoever asks (the policies below say who may).
create or replace function public.fresh_item_rules() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.price := nullif(btrim(new.price), '');
  if not exists (select 1 from public.recipes r where r.id = new.recipe_id and r.business_id = new.business_id) then
    raise exception 'Pick an item from the menu' using errcode = '22023';
  end if;
  if new.offer_hours is not null and new.discount = 'price' and new.price is null then
    raise exception 'Say the offer price, e.g. 2 for €3' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
alter function public.fresh_item_rules() owner to app_definer;
revoke execute on function public.fresh_item_rules() from public, anon, authenticated;
create trigger fresh_items_rules before insert or update on public.fresh_items for each row execute function public.fresh_item_rules();
create trigger audit_fresh_items after insert or update or delete on public.fresh_items for each row execute function public.audit_row();

alter table public.fresh_items enable row level security;
revoke all on public.fresh_items from anon;
create policy fresh_items_read on public.fresh_items for select to authenticated
  using ((select public.is_staff()) or (select public.partner_can('finances')));
create policy fresh_items_add on public.fresh_items for insert to authenticated
  with check ((select public.is_admin()));
create policy fresh_items_change on public.fresh_items for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy fresh_items_delete on public.fresh_items for delete to authenticated
  using ((select public.is_admin()));
