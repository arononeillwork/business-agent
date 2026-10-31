-- Bank holiday reminders (on by default, a week ahead, once per holiday, never before 09:00, any one
-- left out by an admin) and the devices people save for push notifications (their own only).
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

-- A time today in the business's time zone.
create function pg_temp.today_at(p_time time) returns timestamptz language sql as $$
  select (((now() at time zone public.business_tz())::date + p_time)::timestamp) at time zone public.business_tz();
$$;

-- The holidays: one in 7 days, one in 3, one in 20 (too far), a nearby town's (not reminded by default),
-- one unconfirmed, and a business event (not a holiday).
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$
declare d date := (now() at time zone public.business_tz())::date;
begin
  assert (select holiday_reminders and holiday_reminder_days = 7 and holiday_reminder_day_before and holiday_reminder_kinds = '{national,regional,local}' from public.settings where id = 1),
    'on by default, a week ahead and the day before, national, regional and local holidays';
  insert into public.calendar_events (starts_on, title, category, town, confirmed) values
    (d + 7, 'Test Inmaculada', 'national', null, true),
    (d + 3, 'Test Feria local', 'local', 'Marbella', true),
    (d + 20, 'Test Navidad', 'national', null, true),
    (d + 2, 'Test Feria de Benahavís', 'area', 'Benahavís', true),
    (d + 1, 'Test Maybe holiday', 'regional', null, false),
    (d + 1, 'Test Tasting night', 'event', null, true);
end $$;

do $$
declare n_admins int := (select count(*) from public.profiles where role = 'admin' and active);
begin
  assert public.bank_holiday_reminders(pg_temp.today_at('08:30')) = 0, 'nothing before 09:00';
  assert public.bank_holiday_reminders(pg_temp.today_at('09:05')) = 2, 'the two holidays within the week';
  assert (select count(*) from public.notifications where kind = 'bank_holiday') = 2 * n_admins, 'to every active admin';
  assert exists (select 1 from public.notifications where title = 'Bank holiday in 7 days: Test Inmaculada' and link = '/calendar'
                  and data ->> 'days' = '7' and pushed_at is null), 'says when, links to the calendar, waits to be pushed';
  assert exists (select 1 from public.notifications where title = 'Bank holiday in 3 days: Test Feria local' and body like '%Local holiday (Marbella)%'),
    'a local holiday says where';
  assert public.bank_holiday_reminders(pg_temp.today_at('09:06')) = 0, 'once per holiday';
  -- Moved to another day: reminded again.
  update public.calendar_events set starts_on = starts_on + 1 where title = 'Test Feria local';
  assert public.bank_holiday_reminders(pg_temp.today_at('10:00')) = 1, 'a holiday that moved is reminded again';
  -- The day before: reminded again, once (a holiday first seen a day ahead gets one, not two).
  insert into public.calendar_events (starts_on, title, category, confirmed)
    values ((now() at time zone public.business_tz())::date + 1, 'Test Día de Andalucía', 'regional', true);
  assert public.bank_holiday_reminders(pg_temp.today_at('10:00')) = 1, 'one first seen a day ahead: one reminder';
  assert public.bank_holiday_reminders(pg_temp.today_at('10:01')) = 0, 'and not a second the day before';
  update public.calendar_events set starts_on = (now() at time zone public.business_tz())::date + 1 where title = 'Test Inmaculada';
  update public.holiday_reminders set sent_for = (now() at time zone public.business_tz())::date + 1
   where event_id = (select id from public.calendar_events where title = 'Test Inmaculada');
  assert public.bank_holiday_reminders(pg_temp.today_at('10:02')) = 1, 'reminded a week ahead, then again the day before';
  assert exists (select 1 from public.notifications where title = 'Bank holiday tomorrow: Test Inmaculada'), 'says tomorrow';
  assert public.bank_holiday_reminders(pg_temp.today_at('10:03')) = 0, 'the day before once';
  update public.settings set holiday_reminder_day_before = false where id = 1;
  update public.calendar_events set starts_on = (now() at time zone public.business_tz())::date + 1 where title = 'Test Feria local';
  update public.holiday_reminders set sent_for = (now() at time zone public.business_tz())::date + 1, day_before_for = null
   where event_id = (select id from public.calendar_events where title = 'Test Feria local');
  assert public.bank_holiday_reminders(pg_temp.today_at('10:04')) = 0, 'no day-before reminder when switched off';
  update public.settings set holiday_reminder_day_before = true where id = 1;
  update public.calendar_events set starts_on = (now() at time zone public.business_tz())::date + 8 where title in ('Test Inmaculada', 'Test Feria local');
  -- Switched off: nothing.
  update public.settings set holiday_reminders = false where id = 1;
  update public.calendar_events set starts_on = starts_on + 1 where title = 'Test Inmaculada';
  assert public.bank_holiday_reminders(pg_temp.today_at('10:00')) = 0, 'off: no reminders';
  update public.settings set holiday_reminders = true, holiday_reminder_days = 14 where id = 1;
end $$;
select pg_temp.expect_error($q$update public.settings set holiday_reminder_kinds = '{national,party}' where id = 1$q$, 'check constraint');
select pg_temp.expect_error($q$select public.each_business('drop_everything')$q$, 'Not a job');
select public.each_business('bank_holiday_reminders');

-- Admins leave a holiday out; employees can't, and see none of it.
select pg_temp.act_as('maria@test');
do $$ begin
  assert public.set_holiday_reminder((select id from public.calendar_events where title = 'Test Navidad'), false) = false, 'left out';
  assert (select not remind from public.holiday_reminders r join public.calendar_events e on e.id = r.event_id where e.title = 'Test Navidad'),
    'admins see what is left out';
end $$;
reset role;
do $$ begin
  update public.settings set holiday_reminder_days = 30 where id = 1;
  perform public.bank_holiday_reminders(pg_temp.today_at('11:00'));
  assert not exists (select 1 from public.notifications where title like '%Test Navidad'), 'a holiday left out is not reminded';
end $$;
select pg_temp.act_as('julio@test');
select pg_temp.expect_error($q$select public.set_holiday_reminder((select id from public.calendar_events limit 1), false)$q$, 'Only an admin');
select pg_temp.expect_error($q$select public.bank_holiday_reminders()$q$, 'permission denied');
do $$ begin
  assert (select count(*) from public.holiday_reminders) = 0, 'employees see no holiday reminders';
end $$;

-- Devices: each person saves and sees their own; a device someone else used becomes the new person's.
select pg_temp.act_as('julio@test');
do $$ begin
  perform public.save_push_subscription('https://push.example.com/device-1', repeat('a', 87), repeat('b', 22), ' iPhone · Safari ');
  perform public.save_push_subscription('https://push.example.com/device-1', repeat('c', 87), repeat('d', 22), 'iPhone · Safari');
  assert (select count(*) from public.push_subscriptions) = 1, 'the same device once';
  assert (select p256dh = repeat('c', 87) and device = 'iPhone · Safari' from public.push_subscriptions), 'its new keys';
  perform public.send_me_test_notification();
  assert (select count(*) from public.notifications where kind = 'test' and profile_id = auth.uid()) = 1, 'a test for yourself';
end $$;
select pg_temp.expect_error($q$insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://push.example.com/x', repeat('a', 87), repeat('b', 22))$q$, 'permission denied');
select pg_temp.expect_error($q$select public.save_push_subscription('http://insecure.example.com', repeat('a', 87), repeat('b', 22), null)$q$, 'check constraint');

select pg_temp.act_as('maria@test');
do $$ declare n int; begin
  assert (select count(*) from public.push_subscriptions) = 0, 'nobody else''s devices';
  delete from public.push_subscriptions; get diagnostics n = row_count;
  assert n = 0, 'nor removes them';
  perform public.save_push_subscription('https://push.example.com/device-1', repeat('e', 87), repeat('f', 22), 'Shared tablet');
  assert (select count(*) from public.push_subscriptions) = 1, 'the shared device is now maria''s';
end $$;
select pg_temp.act_as('julio@test');
do $$ declare n int; begin
  assert (select count(*) from public.push_subscriptions) = 0, 'and no longer julio''s';
  perform public.save_push_subscription('https://push.example.com/device-2', repeat('a', 87), repeat('b', 22), 'Laptop');
  delete from public.push_subscriptions; get diagnostics n = row_count;
  assert n = 1, 'people remove their own';
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
delete from public.notifications where kind in ('bank_holiday', 'test');
delete from public.push_subscriptions;
delete from public.calendar_events where title like 'Test %';
update public.settings set holiday_reminder_days = 7 where id = 1;
