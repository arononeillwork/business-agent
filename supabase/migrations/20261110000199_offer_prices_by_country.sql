-- Offer prices the way the business's country writes them. The last-day offers (the `last_day_offers`
-- migration) and the freshly made batches' offers (the `fresh_offer_screens` migration) wrote their prices
-- with a decimal point, "€1.96", which is Ireland's way; a business in Spain now gets "€1,96", as its
-- screens write every other amount. A set price ("2 for €3") stays as the admin typed it, and so does the
-- "-30%" of an item without a price. The note admins get when a last-day offer starts says the same price.
-- Only replaces functions: the code live while this runs reads the price as text either way, and shows a
-- plain amount the way its screen writes amounts.

-- 1. An amount as an offer shows it: Ireland's "€1.96", Spain's "€1,96" (two decimals, the euro first, as
--    on the screens), in the business given, else the caller's (the minute job's).
create or replace function public.offer_amount(p numeric, p_business int default null) returns text
language sql stable set search_path = ''
as $$
  select '€' || case when (select b.country from public.business b where b.id = coalesce(p_business, public.current_business_id())) = 'IE'
                     then to_char(round(p, 2), 'FM999990.00')
                     else replace(to_char(round(p, 2), 'FM999990.00'), '.', ',') end
$$;
revoke execute on function public.offer_amount(numeric, int) from public, anon;
grant execute on function public.offer_amount(numeric, int) to app_definer, authenticated, service_role;

-- 2. The minute job's last-day offers: the `last_day_offers` migration's, its prices by the country.
create or replace function public.start_last_day_offers(p_now timestamptz default now())
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_tz    text := public.business_tz();
  v_today date := (p_now at time zone v_tz)::date;
  v_hours jsonb;
  v_open  time;
  v_close timestamptz;
  v       record;
  v_offer uuid;
  v_price text;
  v_was   text;
  n       int := 0;
begin
  select opening_hours -> lower(to_char(v_today, 'Dy')) into v_hours from public.business where id = public.current_business_id();
  if v_hours is null or jsonb_typeof(v_hours) <> 'object' or nullif(v_hours ->> 'close', '') is null then return 0; end if;
  v_open := coalesce(nullif(v_hours ->> 'open', '')::time, time '00:00');
  v_close := (v_today + (v_hours ->> 'close')::time) at time zone v_tz;
  -- Closing after midnight is the next day's.
  if (v_hours ->> 'close')::time <= v_open then v_close := v_close + interval '1 day'; end if;
  if p_now >= v_close then return 0; end if;

  for v in
    select i.id, i.name, i.on_hand, i.sell_price, r.id as rule_id, r.discount, r.percent_off, r.price, r.screen_ids, r.screen_mode, r.story
      from public.stock_items i
      cross join lateral (
        select * from public.last_day_rules r
         where r.active
           and ((cardinality(r.item_ids) = 0 and cardinality(r.categories) = 0) or i.id = any (r.item_ids) or i.category = any (r.categories))
         order by r.sort, r.created_at, r.id
         limit 1) r
     where i.active and i.on_hand > 0 and i.use_by = v_today
       and p_now >= v_close - make_interval(mins => r.minutes_before_close)
       and not exists (select 1 from public.last_day_offers_made m where m.stock_item_id = i.id and m.sold_on = v_today)
     order by i.name
  loop
    if v.discount = 'price' then
      v_price := v.price;
      v_was := case when v.sell_price is not null then public.offer_amount(v.sell_price) end;
    elsif v.sell_price is not null then
      v_price := public.offer_amount(v.sell_price * (100 - v.percent_off) / 100.0);
      v_was := public.offer_amount(v.sell_price);
    else
      v_price := '-' || v.percent_off || '%';
      v_was := null;
    end if;
    insert into public.offers (title, price, was_price, starts_at, ends_at, screen_ids, screen_mode, stock_item_id, last_day_rule_id, auto_for, updated_by)
    values (left(v.name, 80), v_price, v_was, p_now, v_close,
            case when cardinality(v.screen_ids) > 0 then v.screen_ids
                 else coalesce(array(select s.id from public.screens s where s.active order by s.created_at, s.id), '{}') end,
            v.screen_mode, v.id, v.rule_id, v_today, null)
    returning id into v_offer;
    insert into public.last_day_offers_made (stock_item_id, sold_on, offer_id, left_at_start) values (v.id, v_today, v_offer, v.on_hand);
    insert into public.notifications (profile_id, title, body, link, data)
    select p.id,
           'On offer till closing: ' || v.name,
           trim_scale(v.on_hand)::text || ' left on their last day, ' || v_price || ' until ' || to_char(v_close at time zone v_tz, 'HH24:MI')
             || '. Square isn’t changed: take the offer price at the till.',
           case when v.story then '/offers?story=' || v_offer else '/offers' end,
           jsonb_build_object('offer', v_offer, 'item', v.id)
      from public.profiles p where p.role = 'admin' and p.active and p.business_id = public.current_business_id();
    n := n + 1;
  end loop;
  return n;
end $$;
alter function public.start_last_day_offers(timestamptz) owner to app_definer;
revoke execute on function public.start_last_day_offers(timestamptz) from public, anon, authenticated;
grant execute on function public.start_last_day_offers(timestamptz) to service_role;

-- 3. A freshly made batch's offers: the `fresh_offer_screens` migration's, its prices by the country. The
--    batch's own business is the one whose way they're written, whoever records it.
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
        v_was := case when v_sell is not null then public.offer_amount(v_sell, new.business_id) end;
      elsif v_sell is not null then
        v_price := public.offer_amount(v_sell * (100 - v_pct) / 100.0, new.business_id);
        v_was := public.offer_amount(v_sell, new.business_id);
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
