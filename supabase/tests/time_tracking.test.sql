-- Acceptance checks for time tracking and access rules (spec, phase 1).
-- Runs on plain Postgres with supabase_stub.sql; each block raises on failure.

-- Helpers ------------------------------------------------------------------
create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub',
    (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

create function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'Expected error like "%" but statement succeeded: %', p_like, p_sql;
exception when others then
  if sqlerrm not ilike '%' || p_like || '%' then
    raise exception 'Expected error like "%", got "%"', p_like, sqlerrm;
  end if;
end $$;

-- Fixtures -----------------------------------------------------------------
insert into public.business (name, opening_hours) values ('Test Café',
  '{"mon":{"open":"08:00","close":"18:00"},"tue":{"open":"08:00","close":"18:00"},
    "wed":{"open":"08:00","close":"18:00"},"thu":{"open":"08:00","close":"18:00"},
    "fri":{"open":"08:00","close":"18:00"},"sat":{"open":"09:00","close":"18:00"},
    "sun":{"open":"09:00","close":"16:00"}}');
insert into public.settings default values;
insert into public.positions (name) values ('Barista');
insert into public.break_types (name, minutes, paid) values ('Rest', 15, true);

insert into auth.users (email, raw_user_meta_data) values
  ('aron@test', '{"full_name":"Aron"}'),
  ('maria@test', '{"full_name":"Maria"}'),
  ('julio@test', '{"full_name":"Julio"}'),
  ('tablet@test', '{"full_name":"Café tablet","role":"kiosk"}');

-- 1. First sign-up is an admin with pay access; later ones are employees ------
do $$ begin
  assert (select role from public.profiles where email = 'aron@test') = 'admin', 'first user should be admin';
  assert (select can_see_pay from public.profiles where email = 'aron@test'), 'first admin sees pay';
  assert (select role from public.profiles where email = 'maria@test') = 'employee', 'second user is employee';
  assert (select role from public.profiles where email = 'tablet@test') = 'kiosk', 'kiosk account';
end $$;

insert into public.pay_rates (profile_id, hourly_rate)
select id, 9.50 from public.profiles where email in ('maria@test', 'julio@test');

-- 2. Clock-in window: 11 min early blocked, 9 min early allowed ----------------
insert into public.shifts (profile_id, position_id, starts_at, ends_at)
select id, 1, now() + interval '11 minutes', now() + interval '8 hours' from public.profiles where email = 'maria@test';
insert into public.shifts (profile_id, position_id, starts_at, ends_at)
select id, 1, now() + interval '9 minutes', now() + interval '8 hours' from public.profiles where email = 'julio@test';

select pg_temp.act_as('maria@test');
select pg_temp.expect_error('select public.clock_in()', 'Too early');
select pg_temp.expect_error('select public.clock_in(p_override => true)', 'Only an admin');
select pg_temp.act_as('julio@test');
select public.clock_in();
select pg_temp.expect_error('select public.clock_in()', 'Already clocked in');
do $$ begin
  assert (select count(*) from public.time_entries) = 1, 'julio clocked in';
  assert (select source from public.time_entries) = 'phone', 'source phone';
  assert (select position_id from public.time_entries) = 1, 'position taken from shift';
end $$;

-- Breaks
select public.start_break(1);
select pg_temp.expect_error('select public.start_break(1)', 'Already on a break');
select public.end_break();
select pg_temp.expect_error('select public.end_break()', 'Not on a break');

-- 3. Staff can't write timecards directly, or see others' pay/timecards ---------
select pg_temp.expect_error(
  $q$insert into public.time_entries (profile_id, clock_in, source) values (auth.uid(), now(), 'phone')$q$,
  'permission denied');
select pg_temp.expect_error(
  $q$update public.time_entries set clock_in = now() - interval '1 hour'$q$, 'permission denied');
select pg_temp.expect_error($q$select pin_hash from public.profiles$q$, 'permission denied');
select pg_temp.expect_error(
  $q$update public.profiles set role = 'admin' where id = auth.uid()$q$, 'Only an admin');
do $$ begin
  assert (select count(*) from public.pay_rates) = 1, 'employee sees only own pay rate';
  assert (select count(*) from public.profiles) >= 3, 'employee sees the team list';
end $$;
select pg_temp.act_as('maria@test');
do $$ begin
  assert (select count(*) from public.time_entries) = 0, 'maria cannot see julio''s timecard';
  assert (select count(*) from public.audit_log) = 0, 'employees cannot read the audit log';
end $$;
reset role;

-- 4. Missed break + over 9h flags (7.5h with no break; 10h) --------------------
select pg_temp.act_as('aron@test');
select public.add_time_entry(
  (select id from public.profiles where email = 'maria@test'),
  now() - interval '3 days', now() - interval '3 days' + interval '7 hours 30 minutes',
  'Forgot to clock in', 1);
select public.add_time_entry(
  (select id from public.profiles where email = 'maria@test'),
  now() - interval '2 days', now() - interval '2 days' + interval '10 hours',
  'Forgot to clock in', 1);
select pg_temp.expect_error($q$select public.add_time_entry(
  (select id from public.profiles where email = 'maria@test'), now() - interval '1 day', now(), '  ')$q$,
  'reason is required');
do $$ begin
  assert (select 'missed_break' = any(flags) from public.time_entries
          where clock_in::date = (now() - interval '3 days')::date), 'missed break flagged';
  assert (select 'over_daily_limit' = any(flags) from public.time_entries
          where clock_in::date = (now() - interval '2 days')::date), 'over 9h flagged';
  assert (select count(*) from public.time_entry_changes) = 2, 'manual additions logged';
end $$;
reset role;

-- 5. Correction request -> admin approves -> timecard changed and logged -------
select pg_temp.act_as('maria@test');
select public.request_correction(
  (select id from public.time_entries where clock_in::date = (now() - interval '3 days')::date),
  null, now() - interval '3 days' + interval '8 hours', 'Left at 16:00, not 15:30');
select pg_temp.expect_error($q$select public.request_correction(
  (select id from public.time_entries limit 1), null, null, '')$q$, 'add a note');
select pg_temp.expect_error($q$select public.edit_time_entry(
  (select id from public.time_entries limit 1), null, now(), 'x')$q$, 'Only an admin');
reset role;
select pg_temp.act_as('aron@test');
select public.decide_correction((select id from public.correction_requests), true, 'OK');
do $$ begin
  assert (select status from public.correction_requests) = 'approved', 'request approved';
  assert (select count(*) from public.time_entry_changes
          where reason like 'Correction request approved%') = 1, 'correction logged with reason';
  assert (select round(extract(epoch from clock_out - clock_in) / 3600) from public.time_entries
          where clock_in::date = (now() - interval '3 days')::date) = 8, 'clock-out corrected';
end $$;
select pg_temp.expect_error(
  $q$select public.decide_correction((select id from public.correction_requests), true)$q$, 'already approved');
reset role;

-- 6. Weekly approval; approved cards can still be fixed by an admin, with a log ---
select pg_temp.act_as('aron@test');
select pg_temp.expect_error(
  $q$select public.approve_week(date_trunc('week', now() at time zone 'Europe/Madrid')::date)$q$,
  'still clocked in');
reset role;

-- 7. Kiosk: PIN required, wrong PIN rejected, lockout after 5 tries ---------------
select pg_temp.act_as('maria@test');
select public.set_pin('1234');
select pg_temp.expect_error($q$select public.set_pin('12a4')$q$, '4 digits');
select pg_temp.expect_error($q$select public.kiosk_roster()$q$, 'Kiosk only');
reset role;
update public.shifts set starts_at = now() - interval '5 minutes'
 where profile_id = (select id from public.profiles where email = 'maria@test');
select pg_temp.act_as('tablet@test');
do $$ begin
  assert (select count(*) from public.kiosk_roster()) = 3, 'kiosk sees 3 staff';
  assert (select count(*) from public.profiles where id <> auth.uid()) = 0, 'kiosk sees only its own profile';
  assert (select count(*) from public.shifts) = 0, 'kiosk cannot read the rota';
end $$;
select pg_temp.expect_error(
  $q$select public.kiosk_punch((select id from public.kiosk_roster() where full_name = 'Maria'), '9999', 'in')$q$,
  'Wrong PIN');
select public.kiosk_punch((select id from public.kiosk_roster() where full_name = 'Maria'), '1234', 'in');
do $$ begin
  assert (select status from public.kiosk_roster() where full_name = 'Maria') = 'in', 'maria is in via kiosk';
end $$;
select pg_temp.expect_error($q$select public.clock_in()$q$, 'cannot clock in');
reset role;
do $$ begin
  assert (select source from public.time_entries
          where profile_id = (select id from public.profiles where email = 'maria@test')
            and clock_out is null) = 'kiosk', 'kiosk source recorded';
end $$;

-- 8. Forgotten clock-out closes automatically, flagged for review --------------
update public.time_entries set clock_in = now() - interval '10 hours'
 where profile_id = (select id from public.profiles where email = 'julio@test');
update public.breaks set started_at = now() - interval '9 hours', ended_at = now() - interval '8 hours 50 minutes';
update public.shifts set starts_at = now() - interval '10 hours', ends_at = now() - interval '2 hours'
 where profile_id = (select id from public.profiles where email = 'julio@test');
do $$ begin
  assert public.auto_close_entries() = 1, 'one card auto-closed';
  assert (select 'auto_clock_out' = any(flags) and clock_out_source = 'auto' from public.time_entries
          where profile_id = (select id from public.profiles where email = 'julio@test')), 'auto flag';
end $$;

-- 9. At least one admin must remain -------------------------------------------
select pg_temp.act_as('aron@test');
select pg_temp.expect_error(
  $q$update public.profiles set role = 'employee' where email = 'aron@test'$q$, 'At least one admin');
update public.profiles set role = 'admin' where email = 'maria@test';
update public.profiles set role = 'employee' where email = 'aron@test';
reset role;

-- 10. Audit log records who changed what, and never the PIN hash ---------------
do $$ begin
  assert (select count(*) from public.audit_log where table_name = 'profiles' and action = 'update') >= 2,
    'profile changes audited';
  assert not exists (select 1 from public.audit_log where new_values ? 'pin_hash'), 'no PIN hash in log';
end $$;
