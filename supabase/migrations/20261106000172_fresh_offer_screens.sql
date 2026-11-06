-- Freshly made: which screens a batch's offer shows on. Each item made here says where its offer goes:
-- every screen that's on (as before), the screens picked, or no screen (it's still on Offers & specials,
-- just not on a TV); in turn with the screen's other slides, or on its own until it ends. A batch takes
-- its item's, unless it's changed on the batch. The batch's offer is made with them, and a change to them
-- on the batch moves its offer there; an admin can still change the offer itself on Offers & specials.
-- Who: as the rest of each row (admins set the items; the team records batches).

-- screen_ids empty: every screen that's on at the time (as last day offers). screen_mode none: no screen.
alter table public.fresh_items
  add column screen_ids  uuid[] not null default '{}' check (cardinality(screen_ids) <= 50),
  add column screen_mode text not null default 'turns' check (screen_mode in ('turns', 'only', 'none'));

-- Both empty: as its item (or every screen that's on, for a batch of something not set up).
alter table public.fresh_batches
  add column screen_ids  uuid[] check (cardinality(screen_ids) <= 50),
  add column screen_mode text check (screen_mode in ('turns', 'only', 'none')),
  add constraint fresh_batches_screens check ((screen_ids is null) = (screen_mode is null));

-- The batch's offers, as the `fresh_second_discount` migration made them (one for each discount, kept in
-- step; a change moves an offer, its screens and picture as an admin left them), now on the screens chosen:
-- the batch's choice, else its item's, else every screen that's on. A change to the batch's screens moves
-- its offers there.
create or replace function public.fresh_batch_offer() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_sell    numeric;
  v_stage   int;
  v_from    timestamptz;
  v_until   timestamptz;
  v_kind    text;
  v_pct     int;
  v_set     text;
  v_price   text;
  v_was     text;
  v_fmt     constant text := 'FM999990.00';
  v_mode    text;
  v_ids     uuid[];
  v_screens uuid[];
  v_moved   boolean := tg_op = 'UPDATE' and (old.screen_ids, old.screen_mode) is distinct from (new.screen_ids, new.screen_mode);
begin
  if tg_op = 'UPDATE' and not v_moved
     and (old.name, old.recipe_id, old.made_at, old.shelf_life_hours, old.discount_at, old.discount, old.percent_off, old.price,
          old.discount2_at, old.discount2, old.percent_off2, old.price2, old.cleared)
     is not distinct from (new.name, new.recipe_id, new.made_at, new.shelf_life_hours, new.discount_at, new.discount, new.percent_off, new.price,
                           new.discount2_at, new.discount2, new.percent_off2, new.price2, new.cleared) then
    return null;
  end if;
  select r.sell_price into v_sell from public.recipes r where r.id = new.recipe_id;
  -- Where its offers show. Screens picked that are gone don't count; none of them left is every screen that's on.
  if new.screen_mode is not null then
    v_mode := new.screen_mode;
    v_ids := coalesce(new.screen_ids, '{}');
  else
    select i.screen_mode, i.screen_ids into v_mode, v_ids
      from public.fresh_items i where i.business_id = new.business_id and i.recipe_id = new.recipe_id;
    v_mode := coalesce(v_mode, 'turns');
    v_ids := coalesce(v_ids, '{}');
  end if;
  v_ids := coalesce(array(select s from unnest(v_ids) s
                           where exists (select 1 from public.screens c where c.id = s and c.business_id = new.business_id)), '{}');
  v_screens := case
    when v_mode = 'none' then '{}'::uuid[]
    when cardinality(v_ids) > 0 then v_ids
    else coalesce(array(select s.id from public.screens s where s.business_id = new.business_id and s.active order by s.created_at, s.id), '{}')
  end;
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
      update public.offers o
         set title = left(new.name, 80), price = v_price, was_price = v_was, starts_at = v_from, ends_at = v_until,
             screen_ids = case when v_moved then v_screens else o.screen_ids end,
             screen_mode = case when not v_moved then o.screen_mode when v_mode = 'only' then 'only' else 'turns' end
       where o.fresh_batch_id = new.id and coalesce(o.fresh_stage, 1) = v_stage;
      if not found then
        insert into public.offers (business_id, title, price, was_price, starts_at, ends_at, screen_ids, screen_mode, fresh_batch_id, fresh_stage, updated_by)
        values (new.business_id, left(new.name, 80), v_price, v_was, v_from, v_until, v_screens,
                case when v_mode = 'only' then 'only' else 'turns' end, new.id, v_stage, null);
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
