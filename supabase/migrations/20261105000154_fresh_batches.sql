-- Freshly made (Stock): what the team makes for the counter (a banana bread, today's sandwiches, a
-- tray of brownies), when it was made, how long it keeps, and when it goes on offer at what discount.
-- A batch with a discount puts itself on Offers & specials, from that time until its shelf life ends,
-- its menu price crossed out, on the screens that are on; sold out or thrown away first, its offer
-- ends then. Nothing is charged or changed in Square: the till takes the offer price as the team
-- rings it up (shared/freshBatches.ts does the same reckoning for the page and the demo).
-- Who: the team records batches (made, sold out, thrown away) and their discount; admins, and whoever
-- recorded one, delete it; finance partners read. The offer is an ordinary one: admins change or stop
-- it on Offers & specials like any other.

create table public.fresh_batches (
  id               uuid primary key default gen_random_uuid(),
  -- What was made, as on the menu (Menu costing) or in the team's own words; a name that's on the menu
  -- is linked to it, for its price.
  name             text not null check (char_length(name) between 1 and 80),
  recipe_id        uuid references public.recipes on delete set null,
  -- How many were made (pieces, slices, portions); none: not counted.
  quantity         numeric(10, 2) check (quantity > 0 and quantity <= 10000),
  made_at          timestamptz not null default now(),
  -- How long it keeps once made, and so when it has to be gone (made_at plus that, worked out here).
  shelf_life_hours int not null check (shelf_life_hours between 1 and 720),
  good_until       timestamptz not null,
  -- When its discount starts (none: no discount), and what it takes off: a % off the menu price, or a
  -- set price as shown ("2 for €3").
  discount_at      timestamptz,
  discount         text not null default 'percent' check (discount in ('percent', 'price')),
  percent_off      int not null default 30 check (percent_off between 5 and 90),
  price            text check (char_length(price) <= 40),
  -- Gone from the counter before its time: sold out, or thrown away; and when.
  cleared          text check (cleared in ('sold', 'binned')),
  cleared_at       timestamptz,
  notes            text check (char_length(notes) <= 300),
  -- Who recorded it.
  made_by          uuid references auth.users on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users on delete set null default auth.uid(),
  constraint fresh_batches_price check (discount_at is null or discount = 'percent' or price is not null)
);
select public.add_business_scope('public.fresh_batches');
create index fresh_batches_made_idx on public.fresh_batches (business_id, made_at desc);
create index fresh_batches_recipe_idx on public.fresh_batches (recipe_id);
create index fresh_batches_made_by_idx on public.fresh_batches (made_by);
create index fresh_batches_updated_by_idx on public.fresh_batches (updated_by);

-- An offer knows the batch it came from, so Offers & specials says so, and the batch finds its offer.
alter table public.offers add column fresh_batch_id uuid references public.fresh_batches on delete set null;
create index offers_fresh_batch_idx on public.offers (fresh_batch_id);

-- Tidy what's typed and check it; link a menu name to its menu item; work out when it has to be gone;
-- stamp who recorded it and when it was cleared.
create or replace function public.fresh_batch_rules() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.price := nullif(btrim(new.price), '');
  new.notes := nullif(btrim(new.notes), '');
  if new.name = '' then
    raise exception 'Say what was made' using errcode = '22023';
  end if;
  -- Only this business's menu items; a name that's on its menu is that item.
  if new.recipe_id is not null and not exists (select 1 from public.recipes r where r.id = new.recipe_id and r.business_id = new.business_id) then
    new.recipe_id := null;
  end if;
  if new.recipe_id is null then
    select r.id into new.recipe_id from public.recipes r
     where r.business_id = new.business_id and r.active and lower(r.name) = lower(new.name) order by r.created_at limit 1;
  end if;
  if tg_op = 'INSERT' and new.made_at > now() + interval '12 hours' then
    raise exception 'It can’t be made more than 12 hours from now' using errcode = '22023';
  end if;
  new.good_until := new.made_at + make_interval(hours => new.shelf_life_hours);
  if new.discount_at is not null and (new.discount_at < new.made_at or new.discount_at >= new.good_until) then
    raise exception 'Start the discount after it’s made and before its shelf life ends' using errcode = '22023';
  end if;
  if new.discount_at is not null and new.discount = 'price' and new.price is null then
    raise exception 'Say the offer price, e.g. 2 for €3' using errcode = '22023';
  end if;
  if new.cleared is null then
    new.cleared_at := null;
  elsif tg_op = 'INSERT' or old.cleared is null then
    new.cleared_at := now();
  else
    new.cleared_at := old.cleared_at;
  end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.made_by := old.made_by;
  else
    new.made_by := coalesce(auth.uid(), new.made_by);
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
alter function public.fresh_batch_rules() owner to app_definer;
revoke execute on function public.fresh_batch_rules() from public, anon, authenticated;
create trigger fresh_batches_rules before insert or update on public.fresh_batches for each row execute function public.fresh_batch_rules();

-- Its offer on Offers & specials, kept in step (as the owner: the team records batches, and offers are
-- admins'). With a discount, still on the counter and not past its time: the offer runs from the
-- discount until it has to be gone, at its price, on every screen that's on (made the first time;
-- after that, a change to what was made, its times or its discount moves the offer, its screens and
-- picture as an admin left them). No discount any more, sold out or thrown away: an offer still to
-- come goes, and one that's on ends now.
create or replace function public.fresh_batch_offer() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_sell  numeric;
  v_price text;
  v_was   text;
  v_fmt   constant text := 'FM999990.00';
begin
  if tg_op = 'UPDATE' and (old.name, old.recipe_id, old.made_at, old.shelf_life_hours, old.discount_at, old.discount, old.percent_off, old.price, old.cleared)
     is not distinct from (new.name, new.recipe_id, new.made_at, new.shelf_life_hours, new.discount_at, new.discount, new.percent_off, new.price, new.cleared) then
    return null;
  end if;
  if new.discount_at is not null and new.cleared is null and new.good_until > now() then
    select r.sell_price into v_sell from public.recipes r where r.id = new.recipe_id;
    if new.discount = 'price' then
      v_price := new.price;
      v_was := case when v_sell is not null then '€' || to_char(v_sell, v_fmt) end;
    elsif v_sell is not null then
      v_price := '€' || to_char(round(v_sell * (100 - new.percent_off) / 100.0, 2), v_fmt);
      v_was := '€' || to_char(v_sell, v_fmt);
    else
      v_price := '-' || new.percent_off || '%';
      v_was := null;
    end if;
    update public.offers
       set title = left(new.name, 80), price = v_price, was_price = v_was, starts_at = new.discount_at, ends_at = new.good_until
     where fresh_batch_id = new.id;
    if not found then
      insert into public.offers (business_id, title, price, was_price, starts_at, ends_at, screen_ids, screen_mode, fresh_batch_id, updated_by)
      values (new.business_id, left(new.name, 80), v_price, v_was, new.discount_at, new.good_until,
              coalesce(array(select s.id from public.screens s where s.business_id = new.business_id and s.active order by s.created_at, s.id), '{}'),
              'turns', new.id, null);
    end if;
  else
    delete from public.offers where fresh_batch_id = new.id and starts_at > now();
    update public.offers set ends_at = now() where fresh_batch_id = new.id and starts_at <= now() and ends_at > now();
  end if;
  return null;
end $$;
alter function public.fresh_batch_offer() owner to app_definer;
revoke execute on function public.fresh_batch_offer() from public, anon, authenticated;
create trigger fresh_batches_offer after insert or update on public.fresh_batches for each row execute function public.fresh_batch_offer();

-- A batch deleted (recorded by mistake): its offer goes too, unless it has already ended.
create or replace function public.fresh_batch_gone() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.offers where fresh_batch_id = old.id and ends_at > now();
  return old;
end $$;
alter function public.fresh_batch_gone() owner to app_definer;
revoke execute on function public.fresh_batch_gone() from public, anon, authenticated;
create trigger fresh_batches_gone before delete on public.fresh_batches for each row execute function public.fresh_batch_gone();
create trigger audit_fresh_batches after insert or update or delete on public.fresh_batches for each row execute function public.audit_row();

alter table public.fresh_batches enable row level security;
revoke all on public.fresh_batches from anon;
create policy fresh_batches_read on public.fresh_batches for select to authenticated
  using ((select public.is_staff()) or (select public.partner_can('finances')));
create policy fresh_batches_add on public.fresh_batches for insert to authenticated
  with check ((select public.is_staff()));
create policy fresh_batches_change on public.fresh_batches for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy fresh_batches_delete on public.fresh_batches for delete to authenticated
  using ((select public.is_admin()) or made_by = (select auth.uid()));
