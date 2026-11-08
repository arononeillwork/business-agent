-- A Spanish town's two local holidays a year (the town_holidays migration): the business's town, and an
-- admin adding a year's two days in one go (set_town_holidays). They're local holidays with local- ids,
-- that year's own; they replace that year's, keep a day that stays, take over one added by hand, and are
-- refused when they're not two days of this year or next or one is a public holiday already. Only an
-- admin, only in Spain, only once there's a town, and only for their own business. The reminder's
-- notifications have a kind of their own.

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.headers', '', false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
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

-- The service key (it's what moves someone into a business).
create function pg_temp.as_server() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', 'service_role', false);
  perform set_config('request.headers', '', false);
  set role service_role;
end $$;

-- This year and the next, in Madrid, as the function reads them.
create function pg_temp.y(p_plus int default 0) returns int language sql as $$
  select extract(year from now() at time zone 'Europe/Madrid')::int + p_plus
$$;
create function pg_temp.d(p_plus int, p_md text) returns date language sql as $$
  select (pg_temp.y(p_plus) || '-' || p_md)::date
$$;

reset role;
insert into auth.users (email, raw_user_meta_data) values
  ('triana@test', '{"full_name":"Rocío"}'), ('triana-staff@test', '{"full_name":"Manolo"}'),
  ('galway@test', '{"full_name":"Niamh"}'), ('jerez@test', '{"full_name":"Lola"}');

select pg_temp.act_as('triana@test');
select public.create_business(p_name => 'Bar Triana', p_kind => 'pub', p_timezone => 'Europe/Madrid', p_referral => null, p_country => 'ES');

-- No town yet: nothing to add to.
select pg_temp.expect_error(format('select public.set_town_holidays(%s, array[%L, %L]::date[])', pg_temp.y(), pg_temp.d(0, '04-21'), pg_temp.d(0, '06-04')),
  'Add your town');
do $$
declare v_err text;
begin
  assert (select town is null from public.business), 'no town until one is given';
  begin update public.business set town = ' Sevilla' where true; exception when check_violation then v_err := sqlerrm; end;
  assert v_err like '%business_town_check%', 'saved trimmed: ' || coalesce(v_err, 'no error');
  v_err := null;
  begin update public.business set town = repeat('x', 81) where true; exception when check_violation then v_err := sqlerrm; end;
  assert v_err is not null, 'a town''s name, not an essay';
  update public.business set town = 'Sevilla' where true;
  assert (select town = 'Sevilla' from public.business), 'saved by its admin';
end $$;

-- This year's two.
select public.set_town_holidays(pg_temp.y(), array[pg_temp.d(0, '04-21'), pg_temp.d(0, '06-04')]);
do $$
begin
  assert (select count(*) = 2 from public.calendar_events where category = 'local'), 'two local holidays';
  assert (select bool_and(external_id = 'local-' || starts_on and town = 'Sevilla' and title = 'Fiesta local' and source = 'admin'
                          and confirmed and visibility = 'all')
            from public.calendar_events where category = 'local'), 'the town''s, with ids of their own';
end $$;

-- A national day on the calendar (as the nightly import puts them), and a local holiday added by hand.
insert into public.calendar_events (starts_on, title, category, source, external_id)
values (pg_temp.d(0, '10-12'), 'Fiesta Nacional de España', 'national', 'import', 'es-' || pg_temp.d(0, '10-12')),
       (pg_temp.d(1, '01-06'), 'Epifanía del Señor', 'national', 'import', 'es-' || pg_temp.d(1, '01-06')),
       (pg_temp.d(0, '09-08'), 'Virgen de Valme', 'local', 'admin', null);

-- Changed: the day kept stays as it was; the one dropped goes; the one added by hand becomes the town's.
create temp table kept as select id from public.calendar_events where external_id = 'local-' || pg_temp.d(0, '04-21');
select public.set_town_holidays(pg_temp.y(), array[pg_temp.d(0, '09-08'), pg_temp.d(0, '04-21')]);
do $$
begin
  assert (select count(*) = 2 from public.calendar_events where category = 'local'), 'still two';
  assert (select id from public.calendar_events where external_id = 'local-' || pg_temp.d(0, '04-21')) = (select id from kept), 'the day kept is the same row';
  assert not exists (select 1 from public.calendar_events where starts_on = pg_temp.d(0, '06-04')), 'the day dropped is gone';
  assert (select title = 'Virgen de Valme' and town = 'Sevilla' from public.calendar_events where external_id = 'local-' || pg_temp.d(0, '09-08')),
    'the one added by hand keeps its name, as the town''s';
end $$;

-- Next year's are its own: this year's stay.
select public.set_town_holidays(pg_temp.y(1), array[pg_temp.d(1, '04-13'), pg_temp.d(1, '05-27')]);
do $$
begin
  assert (select count(*) = 2 from public.calendar_events where external_id like 'local-' || pg_temp.y() || '-%'), 'this year''s two';
  assert (select count(*) = 2 from public.calendar_events where external_id like 'local-' || pg_temp.y(1) || '-%'), 'and next year''s';
end $$;

-- Two days of that year, different, neither a public holiday already; this year or next.
select pg_temp.expect_error(format('select public.set_town_holidays(%s, array[%L, %L]::date[])', pg_temp.y(), pg_temp.d(0, '10-12'), pg_temp.d(0, '06-04')),
  'already a holiday: Fiesta Nacional de España');
select pg_temp.expect_error(format('select public.set_town_holidays(%s, array[%L, %L]::date[])', pg_temp.y(1), pg_temp.d(1, '01-06'), pg_temp.d(1, '06-04')),
  'already a holiday: Epifanía del Señor');
select pg_temp.expect_error(format('select public.set_town_holidays(%s, array[%L, %L]::date[])', pg_temp.y(), pg_temp.d(0, '06-04'), pg_temp.d(0, '06-04')),
  'two different days');
select pg_temp.expect_error(format('select public.set_town_holidays(%s, array[%L, %L]::date[])', pg_temp.y(), pg_temp.d(0, '06-04'), pg_temp.d(1, '06-04')),
  'Both days must be in');
select pg_temp.expect_error(format('select public.set_town_holidays(%s, array[%L]::date[])', pg_temp.y(), pg_temp.d(0, '06-04')), 'Pick both days');
select pg_temp.expect_error(format('select public.set_town_holidays(%s, array[%L, null]::date[])', pg_temp.y(), pg_temp.d(0, '06-04')), 'Pick both days');
select pg_temp.expect_error(format('select public.set_town_holidays(%s, array[%L, %L]::date[])', pg_temp.y(2), pg_temp.d(2, '04-21'), pg_temp.d(2, '06-04')),
  'this year''s or next year''s');
select pg_temp.expect_error(format('select public.set_town_holidays(%s, array[%L, %L]::date[])', pg_temp.y(-1), pg_temp.d(-1, '04-21'), pg_temp.d(-1, '06-04')),
  'this year''s or next year''s');
do $$
begin
  assert (select count(*) = 4 from public.calendar_events where category = 'local'), 'nothing changed by the ones refused';
end $$;

-- Someone on the team who isn't an admin can't.
select pg_temp.as_server();
update public.profiles set business_id = (select business_id from public.profiles where email = 'triana@test'), role = 'employee', active = true
 where email = 'triana-staff@test';
select pg_temp.act_as('triana-staff@test');
select pg_temp.expect_error(format('select public.set_town_holidays(%s, array[%L, %L]::date[])', pg_temp.y(), pg_temp.d(0, '04-22'), pg_temp.d(0, '06-05')),
  'Only an admin');

-- Ireland has none.
select pg_temp.act_as('galway@test');
select public.create_business(p_name => 'The Salt House', p_kind => 'pub', p_timezone => 'Europe/Dublin', p_referral => null, p_country => 'IE');
update public.business set town = 'Galway' where true;
select pg_temp.expect_error(format('select public.set_town_holidays(%s, array[%L, %L]::date[])', pg_temp.y(), pg_temp.d(0, '04-21'), pg_temp.d(0, '06-04')),
  'for a business in Spain');

-- Another Spanish business: its own days, and Bar Triana's are neither seen nor changed.
select pg_temp.act_as('jerez@test');
select public.create_business(p_name => 'Taberna Lola', p_kind => 'restaurant', p_timezone => 'Europe/Madrid', p_referral => null, p_country => 'ES');
update public.business set town = 'Jerez de la Frontera' where true;
select public.set_town_holidays(pg_temp.y(), array[pg_temp.d(0, '04-21'), pg_temp.d(0, '10-09')]);
do $$
begin
  assert (select count(*) = 2 and bool_and(town = 'Jerez de la Frontera') from public.calendar_events where category = 'local'), 'its own two only';
end $$;
reset role;
do $$
declare v_triana int := (select business_id from public.profiles where email = 'triana@test');
begin
  assert (select count(*) = 4 from public.calendar_events where business_id = v_triana and category = 'local'), 'Bar Triana''s are as its admin left them';
  assert (select count(*) = 1 from public.calendar_events where business_id = v_triana and external_id = 'local-' || pg_temp.d(0, '04-21')),
    'one each, its own';
  -- The nightly reminder's notification (the Worker writes it): a kind of its own, with its year and town.
  insert into public.notifications (business_id, profile_id, title, body, link, kind, data)
  select v_triana, id, 'Add Sevilla’s local holidays for 2027', 'x', '/business?local-holidays=2027', 'town_holidays', '{"year":2027,"town":"Sevilla"}'
    from public.profiles where email = 'triana@test';
  assert (select count(*) = 1 from public.notifications where kind = 'town_holidays' and data->>'year' = '2027'), 'kept as the Worker wrote it';
end $$;
