-- Scheduled reports: admins set them up (tidied: addresses once each in lower case, days in order, only
-- this business's people and contacts); a change stamps who and when and clears the last error; the
-- Worker's stamp (no person) changes only when it went. Employees see and change none.
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

-- 1. Maria sets one up: tidied, stamped as hers.
select pg_temp.act_as('maria@test');
do $$
declare v public.report_schedules;
        julio uuid := (select id from public.profiles where email = 'julio@test');
begin
  insert into public.report_schedules (name, kinds, period, team, emails, frequency, weekdays, send_at)
  values ('  Monday takings  ', '{takings,jobs}', 'last_week', array[julio, julio, gen_random_uuid()], '{" Lola@Gestoria.es ","lola@gestoria.es"}',
          'weekly', '{4,1,1}', '08:30')
  returning * into v;
  assert v.name = 'Monday takings', 'trimmed';
  assert v.emails = '{lola@gestoria.es}', format('addresses once, lower case: %s', v.emails);
  assert v.weekdays = '{1,4}', 'days once, in order';
  assert v.team = array[julio], 'only the business''s people';
  assert v.updated_by = auth.uid() and v.last_sent_at is null and v.language = 'en' and v.active, 'stamped as Maria''s';
end $$;
select pg_temp.expect_error($q$insert into public.report_schedules (name, kinds, emails, weekdays) values ('No one', '{jobs}', '{}', '{1}')$q$, 'report_schedules_people');
select pg_temp.expect_error($q$insert into public.report_schedules (name, kinds, emails) values ('Bad', '{jobs}', '{"not an address"}')$q$, 'isn’t an email address');
select pg_temp.expect_error($q$insert into public.report_schedules (name, kinds, emails, frequency, weekdays) values ('No days', '{jobs}', '{a@b.es}', 'weekly', '{}')$q$, 'report_schedules_days');
select pg_temp.expect_error($q$insert into public.report_schedules (name, kinds, emails, frequency, month_day) values ('Day 31', '{jobs}', '{a@b.es}', 'monthly', 31)$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.report_schedules (name, kinds, emails) values ('Unknown', '{gossip}', '{a@b.es}')$q$, 'check constraint');

-- 2. The Worker's stamp (no person) changes only when it went and why it didn't; who changed it stays.
reset role; select set_config('request.jwt.claim.sub', '', false);
do $$ declare v public.report_schedules; was timestamptz := (select updated_at from public.report_schedules where name = 'Monday takings'); begin
  update public.report_schedules set last_sent_at = '2026-10-05 06:00+00', last_error = 'Not sent to x' where name = 'Monday takings' returning * into v;
  assert v.last_sent_at = '2026-10-05 06:00+00' and v.last_error = 'Not sent to x', 'the Worker''s stamp';
  assert v.updated_at = was and v.updated_by = (select id from public.profiles where email = 'maria@test'), 'who changed it stays';
end $$;

-- 3. A person's change: stamped, the error cleared, when it went kept.
select pg_temp.act_as('maria@test');
do $$ declare v public.report_schedules; begin
  update public.report_schedules set send_at = '09:00', last_sent_at = null where name = 'Monday takings' returning * into v;
  assert v.send_at = '09:00' and v.last_error is null and v.last_sent_at = '2026-10-05 06:00+00', 'error cleared, when it went kept';
end $$;

-- 4. Employees see and change none.
select pg_temp.act_as('julio@test');
do $$ begin
  assert (select count(*) from public.report_schedules) = 0, 'an employee sees none';
  update public.report_schedules set active = false;
end $$;
select pg_temp.expect_error($q$insert into public.report_schedules (name, kinds, emails) values ('Mine', '{jobs}', '{a@b.es}')$q$, 'row-level security');
reset role;
do $$ begin assert (select active from public.report_schedules where name = 'Monday takings'), 'still on'; end $$;
delete from public.report_schedules where name = 'Monday takings';
