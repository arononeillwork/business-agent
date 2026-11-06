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

-- The `fresh_batches` migration's offer, now on the screens chosen. As before: with a discount, still on
-- the counter and not past its time, the offer runs from the discount until it has to be gone, at its
-- price (made the first time; after that, a change to what was made, its times or its discount moves it,
-- its screens and picture as an admin left them, unless the batch's screens changed). No discount any
-- more, sold out or thrown away: an offer still to come goes, and one that's on ends now.
create or replace function public.fresh_batch_offer() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_sell    numeric;
  v_price   text;
  v_was     text;
  v_fmt     constant text := 'FM999990.00';
  v_mode    text;
  v_ids     uuid[];
  v_screens uuid[];
  v_moved   boolean := tg_op = 'UPDATE' and (old.screen_ids, old.screen_mode) is distinct from (new.screen_ids, new.screen_mode);
begin
  if tg_op = 'UPDATE' and not v_moved
     and (old.name, old.recipe_id, old.made_at, old.shelf_life_hours, old.discount_at, old.discount, old.percent_off, old.price, old.cleared)
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
    -- Where it shows: the batch's choice, else its item's, else every screen that's on. Screens picked that
    -- are gone don't count; none of them left is every screen that's on.
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
    update public.offers o
       set title = left(new.name, 80), price = v_price, was_price = v_was, starts_at = new.discount_at, ends_at = new.good_until,
           screen_ids = case when v_moved then v_screens else o.screen_ids end,
           screen_mode = case when not v_moved then o.screen_mode when v_mode = 'only' then 'only' else 'turns' end
     where o.fresh_batch_id = new.id;
    if not found then
      insert into public.offers (business_id, title, price, was_price, starts_at, ends_at, screen_ids, screen_mode, fresh_batch_id, updated_by)
      values (new.business_id, left(new.name, 80), v_price, v_was, new.discount_at, new.good_until, v_screens,
              case when v_mode = 'only' then 'only' else 'turns' end, new.id, null);
    end if;
  else
    delete from public.offers where fresh_batch_id = new.id and starts_at > now();
    update public.offers set ends_at = now() where fresh_batch_id = new.id and starts_at <= now() and ends_at > now();
  end if;
  return null;
end $$;
alter function public.fresh_batch_offer() owner to app_definer;
revoke execute on function public.fresh_batch_offer() from public, anon, authenticated;
