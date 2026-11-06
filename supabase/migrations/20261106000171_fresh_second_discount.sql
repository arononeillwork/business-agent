-- Freshly made (Stock): a second, deeper discount, "30% off from Saturday, then 50% off from Monday".
-- A batch's second discount starts after its first and before it has to be gone; each is its own offer
-- on Offers & specials: the first from its start until the second's, the second from then until the
-- end. An item made here carries the same as hours before the end (offer2_hours: "25% off for its last
-- 2 days, then 50% off for its last day"), so a batch recorded of it starts from both.
-- Only adds columns: the code live while this runs saves batches and items without them, which is just
-- the one discount. The batch's and item's rules and the batch's offer are replaced to know them.

alter table public.fresh_batches
  add column discount2_at timestamptz,
  add column discount2    text not null default 'percent' check (discount2 in ('percent', 'price')),
  add column percent_off2 int not null default 50 check (percent_off2 between 5 and 90),
  add column price2       text check (char_length(price2) <= 40),
  add constraint fresh_batches_second check (discount2_at is null or (discount_at is not null and discount2_at > discount_at)),
  add constraint fresh_batches_price2 check (discount2_at is null or discount2 = 'percent' or price2 is not null);

alter table public.fresh_items
  add column offer2_hours int check (offer2_hours >= 1),
  add column discount2    text not null default 'percent' check (discount2 in ('percent', 'price')),
  add column percent_off2 int not null default 50 check (percent_off2 between 5 and 90),
  add column price2       text check (char_length(price2) <= 40),
  add constraint fresh_items_offer2 check (offer2_hours is null or (offer_hours is not null and offer2_hours < offer_hours)),
  add constraint fresh_items_price2 check (offer2_hours is null or discount2 = 'percent' or price2 is not null);

-- Which of its batch's discounts an offer is: 2 the second; the first's (and every offer from before
-- this) has none or 1.
alter table public.offers add column fresh_stage smallint check (fresh_stage in (1, 2));

-- As before (the `fresh_batches` migration), and the second discount's price tidied and checked.
create or replace function public.fresh_batch_rules() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.price := nullif(btrim(new.price), '');
  new.price2 := nullif(btrim(new.price2), '');
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
  if new.discount2_at is not null and (new.discount_at is null or new.discount2_at <= new.discount_at or new.discount2_at >= new.good_until) then
    raise exception 'Start the second discount after the first and before its shelf life ends' using errcode = '22023';
  end if;
  if new.discount2_at is not null and new.discount2 = 'price' and new.price2 is null then
    raise exception 'Say the second offer price, e.g. 2 for €3' using errcode = '22023';
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

-- Its offers on Offers & specials, kept in step, one for each discount (as before, the `fresh_batches`
-- migration: made the first time on every screen that's on; after that a change moves an offer, its
-- screens and picture as an admin left them). The first runs from its start until the second's (or
-- the end), the second from its start until the end. A discount that's gone, or a batch sold out,
-- thrown away or past its time: its offer still to come goes, and one that's on ends now.
create or replace function public.fresh_batch_offer() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_sell  numeric;
  v_stage int;
  v_from  timestamptz;
  v_until timestamptz;
  v_kind  text;
  v_pct   int;
  v_set   text;
  v_price text;
  v_was   text;
  v_fmt   constant text := 'FM999990.00';
begin
  if tg_op = 'UPDATE' and (old.name, old.recipe_id, old.made_at, old.shelf_life_hours, old.discount_at, old.discount, old.percent_off, old.price,
                           old.discount2_at, old.discount2, old.percent_off2, old.price2, old.cleared)
     is not distinct from (new.name, new.recipe_id, new.made_at, new.shelf_life_hours, new.discount_at, new.discount, new.percent_off, new.price,
                           new.discount2_at, new.discount2, new.percent_off2, new.price2, new.cleared) then
    return null;
  end if;
  select r.sell_price into v_sell from public.recipes r where r.id = new.recipe_id;
  for v_stage in 1..2 loop
    if v_stage = 1 then
      v_from := new.discount_at; v_until := coalesce(new.discount2_at, new.good_until);
      v_kind := new.discount; v_pct := new.percent_off; v_set := new.price;
    else
      v_from := new.discount2_at; v_until := new.good_until;
      v_kind := new.discount2; v_pct := new.percent_off2; v_set := new.price2;
    end if;
    if v_from is not null and new.cleared is null and v_until > now() then
      if v_kind = 'price' then
        v_price := v_set;
        v_was := case when v_sell is not null then '€' || to_char(v_sell, v_fmt) end;
      elsif v_sell is not null then
        v_price := '€' || to_char(round(v_sell * (100 - v_pct) / 100.0, 2), v_fmt);
        v_was := '€' || to_char(v_sell, v_fmt);
      else
        v_price := '-' || v_pct || '%';
        v_was := null;
      end if;
      update public.offers
         set title = left(new.name, 80), price = v_price, was_price = v_was, starts_at = v_from, ends_at = v_until
       where fresh_batch_id = new.id and coalesce(fresh_stage, 1) = v_stage;
      if not found then
        insert into public.offers (business_id, title, price, was_price, starts_at, ends_at, screen_ids, screen_mode, fresh_batch_id, fresh_stage, updated_by)
        values (new.business_id, left(new.name, 80), v_price, v_was, v_from, v_until,
                coalesce(array(select s.id from public.screens s where s.business_id = new.business_id and s.active order by s.created_at, s.id), '{}'),
                'turns', new.id, v_stage, null);
      end if;
    else
      delete from public.offers where fresh_batch_id = new.id and coalesce(fresh_stage, 1) = v_stage and starts_at > now();
      update public.offers set ends_at = now()
       where fresh_batch_id = new.id and coalesce(fresh_stage, 1) = v_stage and starts_at <= now() and ends_at > now();
    end if;
  end loop;
  return null;
end $$;
alter function public.fresh_batch_offer() owner to app_definer;
revoke execute on function public.fresh_batch_offer() from public, anon, authenticated;

-- As before (the `fresh_items` migration), and the second offer's price tidied and checked.
create or replace function public.fresh_item_rules() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.price := nullif(btrim(new.price), '');
  new.price2 := nullif(btrim(new.price2), '');
  if not exists (select 1 from public.recipes r where r.id = new.recipe_id and r.business_id = new.business_id) then
    raise exception 'Pick an item from the menu' using errcode = '22023';
  end if;
  if new.offer_hours is not null and new.discount = 'price' and new.price is null then
    raise exception 'Say the offer price, e.g. 2 for €3' using errcode = '22023';
  end if;
  if new.offer2_hours is not null and new.discount2 = 'price' and new.price2 is null then
    raise exception 'Say the second offer price, e.g. 2 for €3' using errcode = '22023';
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
