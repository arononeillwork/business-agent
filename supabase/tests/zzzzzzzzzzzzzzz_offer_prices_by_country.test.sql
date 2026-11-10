-- Offer prices the way the business's country writes them (the offer_prices_by_country migration): a
-- last-day offer and a freshly made batch's offer say "€1.96" in Ireland and "€1,96" in Spain, with the
-- usual price crossed out the same way; the note admins get says the same price; a set price stays as it
-- was typed. Each business's own way, side by side.

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.headers', '', false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

-- The Worker's minute job for one business: the service key, naming it.
create function pg_temp.as_server(p_business int) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', 'service_role', false);
  perform set_config('request.headers', json_build_object('x-business-id', p_business::text)::text, false);
  set role service_role;
end $$;

-- A time of day today in a business's time zone.
create function pg_temp.at(p_tz text, p_time text) returns timestamptz language sql as $$
  select ((now() at time zone p_tz)::date + p_time::time) at time zone p_tz
$$;

reset role;
insert into auth.users (email, raw_user_meta_data) values
  ('kinsale@test', '{"full_name":"Aoife"}'), ('ronda@test', '{"full_name":"Carmen"}');

-- Two cafés, one in each country, the same croissants, banana bread and rules: open 09:00–15:00 every day.
create function pg_temp.set_up(p_email text, p_name text, p_country text) returns int language plpgsql as $$
declare v_id int;
begin
  perform pg_temp.act_as(p_email);
  v_id := public.create_business(p_name, 'cafe', null, null, p_country);
  update public.business set opening_hours = (select jsonb_object_agg(d, '{"open": "09:00", "close": "15:00"}'::jsonb)
                                                from unnest(array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) d)
   where id = v_id;
  insert into public.stock_items (name, category, sell_price, sell_within_days) values
    ('OP butter croissants', 'Bakery', 2.80, 1), ('OP oat milk', 'Milk & dairy', 2.10, 1);
  insert into public.stock_movements (item_id, reason, change, by) select id, 'delivery', 12, auth.uid() from public.stock_items where name like 'OP %';
  insert into public.last_day_rules (name, categories, discount, percent_off, price, sort) values
    ('Bakes', '{Bakery}', 'percent', 30, null, 0), ('Milk', '{"Milk & dairy"}', 'price', 30, '2 for €3', 1);
  insert into public.recipes (name, category, sell_price) values ('OP banana bread', 'Bakery', 3.50);
  insert into public.fresh_batches (name, quantity, made_at, shelf_life_hours, discount_at, percent_off)
  values ('OP banana bread', 6, now() - interval '1 hour', 24, now() + interval '17 hours', 30);
  return v_id;
end $$;

select pg_temp.set_up('kinsale@test', 'The Kinsale Bakehouse', 'IE');
select pg_temp.set_up('ronda@test', 'Café Ronda', 'ES');

-- The minute job, for each business in turn (each found before acting as the server).
reset role;
select id as ie from public.business where name = 'The Kinsale Bakehouse' \gset
select id as es from public.business where name = 'Café Ronda' \gset
select pg_temp.as_server(:ie);
select public.start_last_day_offers(pg_temp.at('Europe/Dublin', '13:30'));
select pg_temp.as_server(:es);
select public.start_last_day_offers(pg_temp.at('Europe/Madrid', '13:30'));

reset role;
do $$
declare
  v_ie int := (select id from public.business where name = 'The Kinsale Bakehouse');
  v_es int := (select id from public.business where name = 'Café Ronda');
  o public.offers;
begin
  -- Ireland: a decimal point.
  select * into o from public.offers where business_id = v_ie and title = 'OP butter croissants';
  assert o.price = '€1.96' and o.was_price = '€2.80', format('Ireland''s last-day offer: %s / %s', o.price, o.was_price);
  select * into o from public.offers where business_id = v_ie and title = 'OP oat milk';
  assert o.price = '2 for €3' and o.was_price = '€2.10', format('a set price as typed, the usual in Ireland''s way: %s / %s', o.price, o.was_price);
  select * into o from public.offers where business_id = v_ie and title = 'OP banana bread';
  assert o.price = '€2.45' and o.was_price = '€3.50', format('Ireland''s freshly made offer: %s / %s', o.price, o.was_price);
  assert exists (select 1 from public.notifications n join public.profiles p on p.id = n.profile_id
                  where p.email = 'kinsale@test' and n.business_id = v_ie
                    and n.body = '12 left on their last day, €1.96 until 15:00. Square isn’t changed: take the offer price at the till.'),
    'the Irish admin''s note says the same price';

  -- Spain: a decimal comma, as its screens write every other amount.
  select * into o from public.offers where business_id = v_es and title = 'OP butter croissants';
  assert o.price = '€1,96' and o.was_price = '€2,80', format('Spain''s last-day offer: %s / %s', o.price, o.was_price);
  select * into o from public.offers where business_id = v_es and title = 'OP oat milk';
  assert o.price = '2 for €3' and o.was_price = '€2,10', format('a set price as typed, the usual in Spain''s way: %s / %s', o.price, o.was_price);
  select * into o from public.offers where business_id = v_es and title = 'OP banana bread';
  assert o.price = '€2,45' and o.was_price = '€3,50', format('Spain''s freshly made offer: %s / %s', o.price, o.was_price);
  assert exists (select 1 from public.notifications n join public.profiles p on p.id = n.profile_id
                  where p.email = 'ronda@test' and n.business_id = v_es
                    and n.body = '12 left on their last day, €1,96 until 15:00. Square isn’t changed: take the offer price at the till.'),
    'the Spanish admin''s note says the same price';

  -- The amount on its own, by the business named, whoever asks; round to the cent.
  assert public.offer_amount(3.2, v_ie) = '€3.20' and public.offer_amount(3.2, v_es) = '€3,20', 'by the business named';
  assert public.offer_amount(1234.567, v_ie) = '€1,234.57' and public.offer_amount(0.5, v_es) = '€0,50', 'two decimals';
end $$;

-- A change to a batch's discount writes its price again, still the business's own way.
select pg_temp.act_as('kinsale@test');
update public.fresh_batches set percent_off = 50 where name = 'OP banana bread';
reset role;
do $$
begin
  assert (select price = '€1.75' and was_price = '€3.50' from public.offers o join public.business b on b.id = o.business_id
           where b.name = 'The Kinsale Bakehouse' and o.title = 'OP banana bread'), 'Ireland''s, changed';
  assert (select price = '€2,45' from public.offers o join public.business b on b.id = o.business_id
           where b.name = 'Café Ronda' and o.title = 'OP banana bread'), 'Spain''s, as it was';
end $$;
reset role;
