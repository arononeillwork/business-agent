-- Last-day offers: a delivery says when its batch has to be sold by; on that day, from the rule's
-- time to closing, what's left goes on offer by itself, once, with its shop price crossed out, on the
-- screens, and admins hear about it. Nothing on a closed day, before the time, for other categories,
-- items on another day or none left. The team can't see or change the rules or start offers.
-- People from the tests before it: maria (admin), julio (employee).

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

create function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_err text;
begin
  begin execute p_sql; exception when others then v_err := sqlerrm; end;
  if v_err is null then raise exception 'Expected error like "%" but statement succeeded: %', p_like, p_sql; end if;
  if v_err not ilike '%' || p_like || '%' then raise exception 'Expected error like "%", got "%"', p_like, v_err; end if;
end $$;

-- Open 09:00–15:00 every day for the test.
reset role;
update public.business set opening_hours = (select jsonb_object_agg(d, '{"open": "09:00", "close": "15:00"}'::jsonb)
                                              from unnest(array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) d)
 where id = public.current_business_id();
-- The time of day "today" in the café's time zone.
create function pg_temp.at(p_time text) returns timestamptz language sql as $$
  select ((now() at time zone public.business_tz())::date + p_time::time) at time zone public.business_tz()
$$;

-- 1. The usual rule is there, switched off; the items.
select pg_temp.act_as('maria@test');
do $$ declare r public.last_day_rules; begin
  select * into r from public.last_day_rules;
  assert r.name = 'Today''s bakes' and not r.active and r.categories = '{Bakery}' and r.discount = 'percent' and r.percent_off = 30
    and r.minutes_before_close = 120 and not r.story, format('a café''s usual rule, switched off: %s', to_jsonb(r));
end $$;
insert into public.stock_items (name, category, sell_price, sell_within_days) values
  ('LDO butter croissants', 'Bakery', 2.80, 1), ('LDO almond cake', 'Bakery', null, 3), ('LDO oat milk', 'Milk & dairy', 2.10, null),
  ('LDO tomorrow''s buns', 'Bakery', 2.00, 2), ('LDO sold-out muffins', 'Bakery', 2.50, 1);
insert into public.screens (name) values ('LDO counter TV');

-- 2. Julio records the deliveries: the use-by is the day they come in plus their days, or the date given.
select pg_temp.act_as('julio@test');
do $$
declare v_today date := (now() at time zone public.business_tz())::date;
        v uuid;
begin
  insert into public.stock_movements (item_id, reason, change, by) select id, 'delivery', 12, auth.uid() from public.stock_items where name = 'LDO butter croissants';
  insert into public.stock_movements (item_id, reason, change, by) select id, 'delivery', 1, auth.uid() from public.stock_items where name = 'LDO almond cake';
  insert into public.stock_movements (item_id, reason, change, use_by, by) select id, 'delivery', 6, v_today, auth.uid() from public.stock_items where name = 'LDO oat milk';
  insert into public.stock_movements (item_id, reason, change, by) select id, 'delivery', 8, auth.uid() from public.stock_items where name = 'LDO tomorrow''s buns';
  insert into public.stock_movements (item_id, reason, change, by) select id, 'delivery', 4, auth.uid() from public.stock_items where name = 'LDO sold-out muffins';
  insert into public.stock_movements (item_id, reason, change, by) select id, 'sold', -4, auth.uid() from public.stock_items where name = 'LDO sold-out muffins';
  assert (select use_by = v_today and on_hand = 12 from public.stock_items where name = 'LDO butter croissants'), 'sell within 1 day: today';
  assert (select use_by = v_today + 2 from public.stock_items where name = 'LDO almond cake'), 'sell within 3 days: the day after tomorrow';
  assert (select use_by = v_today from public.stock_items where name = 'LDO oat milk'), 'the date on the delivery';
  assert (select use_by = v_today + 1 from public.stock_items where name = 'LDO tomorrow''s buns'), 'tomorrow';
  select id into v from public.stock_items where name = 'LDO butter croissants';
  assert (select use_by = v_today from public.stock_movements where item_id = v and reason = 'delivery'), 'kept on the delivery';
  assert (select count(*) = 0 from public.stock_movements where reason = 'sold' and use_by is not null), 'only deliveries have one';
  -- The team sees no rules and can't change them, or start offers.
  assert (select count(*) from public.last_day_rules) = 0, 'the team sees no rules';
end $$;
select pg_temp.expect_error($q$insert into public.last_day_rules (name) values ('Sneaky')$q$, 'row-level security');
select pg_temp.expect_error($q$select public.start_last_day_offers()$q$, 'permission denied');

-- 3. Maria switches the rule on, for the counter TV and its story; a set-price rule for the milk.
select pg_temp.act_as('maria@test');
do $$ declare s uuid := (select id from public.screens where name = 'LDO counter TV'); r public.last_day_rules; begin
  update public.last_day_rules set active = true, story = true, screen_ids = array[s, s, gen_random_uuid()] where name = 'Today''s bakes' returning * into r;
  assert r.screen_ids = array[s], 'its own screens, each once';
  insert into public.last_day_rules (name, categories, discount, price, sort) values ('  Milk  ', '{"Milk & dairy", " Milk & dairy", ""}', 'price', ' 2 for €3 ', 1)
    returning * into r;
  assert r.name = 'Milk' and r.categories = '{"Milk & dairy"}' and r.price = '2 for €3', format('tidied: %s', to_jsonb(r));
end $$;
select pg_temp.expect_error($q$insert into public.last_day_rules (name, discount) values ('No price', 'price')$q$, 'last_day_rules_price');
select pg_temp.expect_error($q$insert into public.last_day_rules (name) values ('Milk')$q$, 'last_day_rules_name_key');
select pg_temp.expect_error($q$insert into public.last_day_rules (name, percent_off) values ('Too much', 95)$q$, 'check constraint');

-- 4. The minute job, as the Worker runs it.
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$
declare v_today date := (now() at time zone public.business_tz())::date;
        o public.offers; m public.offers;
begin
  assert public.start_last_day_offers(pg_temp.at('12:30')) = 0, 'not before two hours before closing';
  assert public.start_last_day_offers(pg_temp.at('13:30')) = 2, 'the croissants and the milk';
  select * into o from public.offers where title = 'LDO butter croissants';
  assert o.price = '€1.96' and o.was_price = '€2.80', format('30%% off the shop price, the usual crossed out: %s / %s', o.price, o.was_price);
  assert o.starts_at = pg_temp.at('13:30') and o.ends_at = pg_temp.at('15:00'), 'from now until closing';
  assert o.auto_for = v_today and o.stock_item_id = (select id from public.stock_items where name = 'LDO butter croissants')
    and o.last_day_rule_id = (select id from public.last_day_rules where name = 'Today''s bakes') and o.active, 'linked to its item, rule and day';
  assert o.screen_ids = array[(select id from public.screens where name = 'LDO counter TV')], 'on the rule''s screens';
  select * into m from public.offers where title = 'LDO oat milk';
  assert m.price = '2 for €3' and m.was_price = '€2.10', 'a set price';
  assert m.screen_ids = coalesce(array(select id from public.screens where active order by created_at, id), '{}'), 'no screens picked: every screen that''s on';
  assert not exists (select 1 from public.offers where title in ('LDO almond cake', 'LDO tomorrow''s buns', 'LDO sold-out muffins')),
    'not the cake (in two days), the buns (tomorrow) or the muffins (none left)';
  assert (select left_at_start = 12 from public.last_day_offers_made where offer_id = o.id), 'how many were left';
  -- On the counter TV while it's on (moved to now, whatever the time the tests run).
  update public.offers set starts_at = now() - interval '1 hour', ends_at = now() + interval '1 hour' where id = o.id;
  assert exists (select 1 from jsonb_array_elements(public.display_feed((select token from public.screens where name = 'LDO counter TV'))->'offers') x
                  where x->>'title' = 'LDO butter croissants' and x->>'was_price' = '€2.80'), 'on the screen';
  -- Admins hear about it, with the link to its story.
  assert exists (select 1 from public.notifications n join public.profiles p on p.id = n.profile_id
                  where p.email = 'maria@test' and n.title = 'On offer till closing: LDO butter croissants'
                    and n.body = '12 left on their last day, €1.96 until 15:00. Square isn’t changed: take the offer price at the till.'
                    and n.link = '/offers?story=' || o.id), 'maria hears about it';
  assert not exists (select 1 from public.notifications n join public.profiles p on p.id = n.profile_id
                      where p.email = 'julio@test' and n.title like 'On offer till closing%'), 'the team doesn''t';

  -- Once only: stopped or deleted, it isn't put back.
  assert public.start_last_day_offers(pg_temp.at('13:31')) = 0, 'once a day';
  delete from public.offers where id = m.id;
  assert public.start_last_day_offers(pg_temp.at('13:32')) = 0, 'a deleted one stays off';
  assert (select offer_id is null from public.last_day_offers_made where stock_item_id = m.stock_item_id), 'its record forgets the offer';
end $$;

-- 5. A late delivery after closing doesn't start one, nor on a closed day.
do $$
declare v_day text := lower(to_char((now() at time zone public.business_tz())::date, 'Dy'));
begin
  update public.stock_items set use_by = (now() at time zone public.business_tz())::date where name = 'LDO tomorrow''s buns';
  assert public.start_last_day_offers(pg_temp.at('15:00')) = 0, 'not at closing';
  update public.business set opening_hours = opening_hours || jsonb_build_object(v_day, null) where id = public.current_business_id();
  assert public.start_last_day_offers(pg_temp.at('14:00')) = 0, 'not on a closed day';
  update public.business set opening_hours = opening_hours || jsonb_build_object(v_day, '{"open": "09:00", "close": "15:00"}'::jsonb) where id = public.current_business_id();
  assert public.start_last_day_offers(pg_temp.at('14:00')) = 1, 'the buns, now on their last day';
end $$;

-- 6. Maria sees the automatic offers and can stop one like any other.
select pg_temp.act_as('maria@test');
do $$ begin
  assert (select count(*) from public.offers where auto_for is not null) = 2, 'the croissants and the buns';
  update public.offers set active = false where title = 'LDO butter croissants';
  assert (select not active from public.offers where title = 'LDO butter croissants'), 'switched off';
  assert (select count(*) from public.last_day_offers_made) = 3, 'maria reads what went on offer';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
