-- Repeating the rota: a week copied onto the weeks after it (replacing what hasn't started, leaving out
-- time off), a continuous rota saved and filled on by the nightly job (keeping the times of day across the
-- clocks going forward, and leaving alone whoever is on already or off the rota), stopped, and who may do
-- each. In March 2031, clear of other tests' shifts. Its own people and shifts, removed at the end.

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

-- A time of day on a day, in the business's own time zone (Madrid).
create function pg_temp.at(p_day date, p_time time) returns timestamptz language sql as $$
  select (p_day + p_time) at time zone public.business_tz()
$$;
-- The week copied: Monday 10 March 2031. Clocks go forward on Sunday 30 March (w + 20).
create function pg_temp.w() returns date language sql as $$ select date '2031-03-10' $$;
create function pg_temp.person(p_email text) returns uuid language sql as $$
  select id from public.profiles where email = p_email
$$;

reset role; select set_config('request.jwt.claim.sub', '', false);
insert into auth.users (email, raw_user_meta_data, invited_at) values
  ('rr-admin@test', '{"full_name": "Rosa"}', now()),
  ('rr-ana@test', '{"full_name": "Ana"}', now()),
  ('rr-ben@test', '{"full_name": "Ben"}', now());
update public.profiles set role = 'admin' where email = 'rr-admin@test';

-- The week: Ana Monday morning and Sunday night (into Monday), Ben Thursday, an open shift on Saturday
-- evening. The week after has Ben on Wednesday and Ana's Monday already; Ben is off on the Thursday after that.
insert into public.shifts (profile_id, starts_at, ends_at, break_minutes, note) values
  (pg_temp.person('rr-ana@test'), pg_temp.at(pg_temp.w(), '08:30'), pg_temp.at(pg_temp.w(), '14:00'), 15, 'Opening'),
  (pg_temp.person('rr-ben@test'), pg_temp.at(pg_temp.w() + 3, '09:00'), pg_temp.at(pg_temp.w() + 3, '14:00'), 0, null),
  (null, pg_temp.at(pg_temp.w() + 5, '17:00'), pg_temp.at(pg_temp.w() + 5, '20:00'), 0, null),
  (pg_temp.person('rr-ana@test'), pg_temp.at(pg_temp.w() + 6, '22:00'), pg_temp.at(pg_temp.w() + 7, '02:00'), 0, null),
  (pg_temp.person('rr-ben@test'), pg_temp.at(pg_temp.w() + 9, '10:00'), pg_temp.at(pg_temp.w() + 9, '12:00'), 0, null),
  (pg_temp.person('rr-ana@test'), pg_temp.at(pg_temp.w() + 7, '08:30'), pg_temp.at(pg_temp.w() + 7, '14:00'), 15, 'Opening');
insert into public.time_off (profile_id, starts_on, ends_on, status)
  values (pg_temp.person('rr-ben@test'), pg_temp.w() + 17, pg_temp.w() + 17, 'approved');
-- The café is closed on the Saturday after that (a closure on its Calendar); a public holiday on a Monday
-- later on doesn't close it, as it doesn't close on public holidays.
insert into public.calendar_events (starts_on, title, category) values
  (pg_temp.w() + 19, 'Closed for the day', 'business'),
  (pg_temp.w() + 28, 'RR test holiday', 'national');

-- 1. An employee can't repeat the rota, stop it, or see what repeats.
select pg_temp.act_as('rr-ana@test');
select pg_temp.expect_error($q$select public.repeat_rota_week(pg_temp.w())$q$, 'Only an admin');
select pg_temp.expect_error($q$select public.repeat_rota_week(pg_temp.w(), null, true)$q$, 'Only an admin');
select pg_temp.expect_error($q$select public.stop_repeating_rota()$q$, 'Only an admin');
select pg_temp.expect_error($q$select public.extend_repeating_rota()$q$, 'permission denied');

-- 2. An admin: not an empty week, and 1 to 12 weeks.
select pg_temp.act_as('rr-admin@test');
select pg_temp.expect_error($q$select public.repeat_rota_week(pg_temp.w() - 7)$q$, 'no shifts that week');
select pg_temp.expect_error($q$select public.repeat_rota_week(pg_temp.w(), 0)$q$, '1 to 12 weeks');
select pg_temp.expect_error($q$select public.repeat_rota_week(pg_temp.w(), 13)$q$, '1 to 12 weeks');

-- 3. The next 2 weeks (from any day of the week): what was there goes, the week's four shifts go onto
--    each at the same times, the night shift ending the next day, all but Ben's Thursday off and the
--    Saturday the café is closed.
do $$
declare
  w date := pg_temp.w();
  r jsonb := public.repeat_rota_week(pg_temp.w() + 2, 2);
begin
  assert r = jsonb_build_object('added', 6, 'removed', 2, 'away', 1, 'closed', 1, 'until', w + 20), format('two weeks: %s', r);
  assert not exists (select 1 from public.shifts where starts_at >= pg_temp.at(w + 19, '00:00') and starts_at < pg_temp.at(w + 20, '00:00')),
    'nobody on the day the café is closed';
  assert (select count(*) from public.shifts where starts_at >= pg_temp.at(w + 7, '00:00') and starts_at < pg_temp.at(w + 14, '00:00')) = 4,
    'the week after has the four, and nothing else';
  assert exists (select 1 from public.shifts where profile_id = pg_temp.person('rr-ana@test') and starts_at = pg_temp.at(w + 7, '08:30')
                   and ends_at = pg_temp.at(w + 7, '14:00') and break_minutes = 15 and note = 'Opening'), 'Ana''s Monday, with its break and note';
  assert exists (select 1 from public.shifts where profile_id = pg_temp.person('rr-ana@test') and starts_at = pg_temp.at(w + 13, '22:00')
                   and ends_at = pg_temp.at(w + 14, '02:00')), 'the night shift ends the next day';
  assert exists (select 1 from public.shifts where profile_id is null and starts_at = pg_temp.at(w + 12, '17:00')), 'the open shift';
  assert not exists (select 1 from public.shifts where profile_id = pg_temp.person('rr-ben@test') and starts_at = pg_temp.at(w + 9, '10:00')),
    'Ben''s Wednesday was replaced';
  assert not exists (select 1 from public.shifts where profile_id = pg_temp.person('rr-ben@test')
                       and starts_at >= pg_temp.at(w + 17, '00:00') and starts_at < pg_temp.at(w + 18, '00:00')), 'not on Ben''s day off';
  assert (select count(*) from public.shifts where starts_at >= pg_temp.at(w, '00:00') and starts_at < pg_temp.at(w + 7, '00:00')) = 4,
    'the week copied is as it was';
  assert not exists (select 1 from public.rota_repeat), 'nothing repeats on its own';
end $$;

-- 4. Kept going: the week is saved as it was and the rota filled to the end of the week after it (it's
--    years away; nearer, to the end of the fourth week after this one).
do $$
declare
  w date := pg_temp.w();
  r jsonb := public.repeat_rota_week(pg_temp.w(), null, true);
begin
  assert r = jsonb_build_object('added', 4, 'removed', 4, 'away', 0, 'closed', 0, 'until', w + 13), format('continuous: %s', r);
  assert (select count(*) from public.rota_repeat where source_week = w and filled_until = w + 13 and updated_by = auth.uid()) = 1, 'saved';
  assert (select count(*) from public.rota_repeat_shifts) = 4, 'the week''s four shifts';
  assert exists (select 1 from public.rota_repeat_shifts where weekday = 7 and starts = '22:00' and ends = '02:00'
                   and profile_id = pg_temp.person('rr-ana@test')), 'as days of the week and times of day';
end $$;
select pg_temp.act_as('rr-ana@test');
do $$ begin
  assert (select count(*) from public.rota_repeat) = 0 and (select count(*) from public.rota_repeat_shifts) = 0, 'an employee sees none of it';
end $$;

-- 5. The nightly job, a few days on: filled to the end of the fourth week after that one. The first new
--    week already has its shifts (from 3), so it gains none (not even on the day it's closed); the next
--    three gain four each, the public holiday too, Monday still at 08:30 after the clocks go forward. Run
--    again, nothing more.
reset role; select set_config('request.jwt.claim.sub', '', false);
do $$
declare w date := pg_temp.w();
begin
  assert public.extend_repeating_rota(pg_temp.at(w + 10, '03:00')) = 12, 'three new weeks of four';
  assert (select filled_until from public.rota_repeat) = w + 41, 'filled to the end of the fourth week after';
  assert (select count(*) from public.shifts where starts_at >= pg_temp.at(w + 14, '00:00') and starts_at < pg_temp.at(w + 21, '00:00')) = 2,
    'the week filled by hand isn''t filled twice';
  assert exists (select 1 from public.shifts where profile_id = pg_temp.person('rr-ana@test') and starts_at = pg_temp.at(w + 28, '08:30')),
    'a public holiday doesn''t close a café that opens on them';
  assert exists (select 1 from public.shifts where profile_id = pg_temp.person('rr-ana@test') and starts_at = pg_temp.at(w + 21, '08:30')
                   and extract(hour from starts_at at time zone 'UTC') = 6), '08:30 in summer time';
  assert extract(hour from pg_temp.at(w, '08:30') at time zone 'UTC') = 7, 'and 08:30 in winter';
  assert public.extend_repeating_rota(pg_temp.at(w + 10, '03:05')) = 0, 'once';
end $$;

-- 6. Someone off the rota isn't put on it.
update public.profiles set on_rota = false where email = 'rr-ana@test';
do $$
declare w date := pg_temp.w();
begin
  assert public.extend_repeating_rota(pg_temp.at(w + 17, '03:00')) = 2, 'Ben''s Thursday and the open shift; not Ana';
end $$;
update public.profiles set on_rota = true where email = 'rr-ana@test';

-- 7. Stopped: nothing repeats any more; the weeks it filled keep their shifts.
select pg_temp.act_as('rr-admin@test');
do $$
declare w date := pg_temp.w();
begin
  perform public.stop_repeating_rota();
  assert not exists (select 1 from public.rota_repeat) and not exists (select 1 from public.rota_repeat_shifts), 'stopped';
  assert (select count(*) from public.shifts where starts_at >= pg_temp.at(w + 35, '00:00') and starts_at < pg_temp.at(w + 42, '00:00')) = 4,
    'the weeks it filled stay';
end $$;
reset role; select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  assert public.extend_repeating_rota(pg_temp.at(pg_temp.w() + 30, '03:00')) = 0, 'nothing to fill';
end $$;

delete from public.shifts where starts_at >= pg_temp.at(pg_temp.w() - 7, '00:00') and starts_at < pg_temp.at(pg_temp.w() + 60, '00:00');
delete from public.calendar_events where title in ('Closed for the day', 'RR test holiday');
delete from auth.users where email in ('rr-admin@test', 'rr-ana@test', 'rr-ben@test');
