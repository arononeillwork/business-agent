-- The error log (the app_errors migration): the Worker keeps one row per kind of error through
-- record_app_error(), and HQ's admins are told about a new kind, or one back after a quiet day, once a day
-- each at most and five an hour in all. Only the service role writes it; only HQ's active admins read it, never
-- another business's admin or anyone signed out; nightly, kinds unseen for 90 days go; owners don't export it.
-- Runs after the HQ tests: HQ exists, run by hq.owner@test.

begin;

create function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_err text;
begin
  begin execute p_sql; exception when others then v_err := sqlerrm; end;
  if v_err is null then raise exception 'Expected error like "%" but statement succeeded: %', p_like, p_sql; end if;
  if v_err not ilike '%' || p_like || '%' then raise exception 'Expected error like "%", got "%"', p_like, v_err; end if;
end $$;

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.headers', '', false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

-- The Worker: the service role, naming no business (the error log isn't any one business's).
create function pg_temp.as_worker() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', 'service_role', false);
  perform set_config('request.headers', '', false);
  set role service_role;
end $$;

create function pg_temp.as_editor() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', '', false);
  perform set_config('request.headers', '', false);
end $$;

-- A fingerprint for a test error (32 hex characters, as the Worker makes them).
create function pg_temp.fp(p_name text) returns text language sql immutable as $$ select md5(p_name) $$;
-- The notifications HQ's owner has about errors.
create function pg_temp.told() returns bigint language sql as $$
  select count(*) from public.notifications n join public.profiles p on p.id = n.profile_id
   where p.email = 'hq.owner@test' and (n.title like 'New error: %' or n.title like 'An error is back: %')
$$;
-- Every error alerted more than an hour ago, so the hour's five aren't used up by an earlier part of the test.
create function pg_temp.an_hour_later() returns void language sql as $$
  update public.app_errors set alerted_at = alerted_at - interval '61 minutes' where alerted_at is not null
$$;

select pg_temp.as_editor();
-- Maria, an admin of the first business (the Worker passes on who was signed in).
select set_config('test.maria', (select id::text from auth.users where email = 'maria@test'), false);
do $$ begin
  assert (select relrowsecurity from pg_class where oid = 'public.app_errors'::regclass), 'row security is on';
  assert not exists (select 1 from public.app_errors), 'nothing kept yet';
end $$;

-- 1. The Worker keeps an error, and HQ's admins hear about it once -----------------------------------
select pg_temp.as_worker();
do $$
declare
  v_maria uuid := current_setting('test.maria')::uuid;
  v_told bigint := pg_temp.told();
begin
  assert public.record_app_error(pg_temp.fp('rota'), 'app', 'Cannot read properties of undefined (reading ''starts_at'')',
    'TypeError: Cannot read properties of undefined' || chr(10) || '    at WeekRow (RotaPage.js:1:2)', '/rota', 1, v_maria,
    '{"kind": "render", "build": "index-abc"}'), 'a new kind of error: HQ is told';
  assert pg_temp.told() = v_told + 1, 'one notification for HQ''s owner';
  assert (select body from public.notifications n join public.profiles p on p.id = n.profile_id where p.email = 'hq.owner@test'
           and n.title = 'New error: Cannot read properties of undefined (reading ''starts_at'')')
         = 'In app. The details are on Businesses, under Errors.', 'saying where, and where to look';

  assert not public.record_app_error(pg_temp.fp('rota'), 'app', 'Cannot read properties of undefined (reading ''starts_at'')',
    'TypeError: again' || chr(10) || '    at WeekRow (RotaPage.js:9:9)', '/rota', null, null, '{}'), 'the same kind again: not told twice';
  assert pg_temp.told() = v_told + 1, 'still the one notification';
end $$;

select pg_temp.as_editor();
do $$
declare v public.app_errors;
begin
  select * into v from public.app_errors where fingerprint = pg_temp.fp('rota');
  assert v.times = 2 and v.source = 'app', 'one row, counted twice';
  assert v.last_stack like 'TypeError: again%' and v.business_id is null and v.user_id is null, 'with the last one''s stack, signed out';
  assert v.first_seen <= v.last_seen and v.alerted_at is not null and not v.alert_due, 'when it was first and last seen, and that HQ was told';
end $$;

-- 2. Back after a quiet day: told again; never twice in a day ---------------------------------------
update public.app_errors set last_seen = now() - interval '25 hours', alerted_at = now() - interval '25 hours' where fingerprint = pg_temp.fp('rota');
select pg_temp.as_worker();
do $$
declare v_told bigint := pg_temp.told();
begin
  assert public.record_app_error(pg_temp.fp('rota'), 'app', 'Cannot read properties of undefined (reading ''starts_at'')'), 'back after 24 hours without it: told';
  assert pg_temp.told() = v_told + 1 and exists (select 1 from public.notifications where title = 'An error is back: Cannot read properties of undefined (reading ''starts_at'')'),
    'as one that is back';
end $$;
select pg_temp.as_editor();
-- Quiet a day again, but HQ was told about it within the day (as can happen when one is held back): not yet.
update public.app_errors set last_seen = now() - interval '25 hours', alerted_at = now() - interval '2 hours' where fingerprint = pg_temp.fp('rota');
select pg_temp.as_worker();
do $$
declare v_told bigint := pg_temp.told();
begin
  assert not public.record_app_error(pg_temp.fp('rota'), 'app', 'Cannot read properties of undefined (reading ''starts_at'')'), 'once a day at most';
  assert pg_temp.told() = v_told, 'no notification';
end $$;
select pg_temp.as_editor();
do $$ begin
  assert (select alert_due from public.app_errors where fingerprint = pg_temp.fp('rota')), 'still due, for when the day is up';
end $$;
update public.app_errors set alerted_at = now() - interval '25 hours' where fingerprint = pg_temp.fp('rota');
select pg_temp.as_worker();
do $$ begin
  assert public.record_app_error(pg_temp.fp('rota'), 'app', 'Cannot read properties of undefined (reading ''starts_at'')'), 'told once the day is up';
end $$;

-- 3. Five notifications an hour in all; one held back is told about later -------------------------------
select pg_temp.as_editor();
select pg_temp.an_hour_later();
select pg_temp.as_worker();
do $$
declare
  v_told bigint := pg_temp.told();
  n int;
begin
  for n in 1..6 loop
    perform public.record_app_error(pg_temp.fp('burst ' || n), 'cron: outbox', 'Burst ' || n);
  end loop;
  assert pg_temp.told() = v_told + 5, 'five in the hour: ' || (pg_temp.told() - v_told);
  assert (select alert_due and alerted_at is null from public.app_errors where fingerprint = pg_temp.fp('burst 6')), 'the sixth is held back, still due';
  assert not public.record_app_error(pg_temp.fp('burst 6'), 'cron: outbox', 'Burst 6'), 'and stays so within the hour';
end $$;
select pg_temp.as_editor();
select pg_temp.an_hour_later();
select pg_temp.as_worker();
do $$ begin
  assert public.record_app_error(pg_temp.fp('burst 6'), 'cron: outbox', 'Burst 6'), 'the next hour, its next report tells HQ';
end $$;

-- 4. Whose it was; a business or person gone since is nobody's; nothing that isn't an error ----------------
do $$
declare v_maria uuid := current_setting('test.maria')::uuid;
begin
  perform public.record_app_error(pg_temp.fp('whose'), 'worker POST /api/admin/invite', 'Unexpected token', null, '/api/admin/invite', 1, v_maria,
    '{"method": "POST", "route": "/api/admin/invite"}');
  perform public.record_app_error(pg_temp.fp('gone'), 'app', 'Gone', null, null, 999999, '00000000-0000-0000-0000-000000000001');
end $$;
select pg_temp.expect_error($q$select public.record_app_error('not-a-fingerprint', 'app', 'x')$q$, 'Not an error''s fingerprint');
select pg_temp.expect_error($q$select public.record_app_error(md5('empty'), 'app', '   ')$q$, 'needs where it happened and its message');
select pg_temp.as_editor();
do $$ begin
  assert (select business_id = 1 and user_id = current_setting('test.maria')::uuid and last_detail ->> 'route' = '/api/admin/invite'
            from public.app_errors where fingerprint = pg_temp.fp('whose')), 'the business and person, and the route';
  assert (select business_id is null and user_id is null from public.app_errors where fingerprint = pg_temp.fp('gone')), 'kept, as nobody''s';
end $$;

-- 5. Too many new kinds in an hour: a new one is let go, an old one still counts -----------------------------
insert into public.app_errors (fingerprint, source, message) select md5('flood ' || n), 'app', 'Flood ' || n from generate_series(1, 300) n;
select pg_temp.as_worker();
do $$ begin
  assert not public.record_app_error(pg_temp.fp('one too many'), 'app', 'One too many'), 'not kept';
  perform public.record_app_error(pg_temp.fp('rota'), 'app', 'Cannot read properties of undefined (reading ''starts_at'')');
end $$;
select pg_temp.as_editor();
do $$ begin
  assert not exists (select 1 from public.app_errors where fingerprint = pg_temp.fp('one too many')), 'the new kind was let go';
  assert (select times from public.app_errors where fingerprint = pg_temp.fp('rota')) = 6, 'an old one still counts';
end $$;
delete from public.app_errors where message like 'Flood %';

-- 6. Only HQ's admins read it -----------------------------------------------------------------------------
select pg_temp.act_as('hq.owner@test');
do $$ begin
  assert public.is_hq_admin(), 'HQ''s owner is one of its admins';
  assert (select count(*) from public.app_errors) >= 9, 'HQ''s admin sees every kind of error: ' || (select count(*) from public.app_errors);
  assert exists (select 1 from public.app_errors where business_id = 1), 'whichever business it was';
end $$;
select pg_temp.expect_error($q$insert into public.app_errors (fingerprint, source, message) values (md5('mine'), 'app', 'Mine')$q$, 'permission denied');
select pg_temp.expect_error($q$update public.app_errors set times = 1$q$, 'permission denied');
select pg_temp.expect_error($q$delete from public.app_errors$q$, 'permission denied');
select pg_temp.expect_error($q$select public.record_app_error(md5('mine'), 'app', 'Mine')$q$, 'permission denied');

select pg_temp.act_as('maria@test');
do $$ begin
  assert public.is_admin() and not public.is_hq_admin(), 'an admin of another business';
  assert (select count(*) from public.app_errors) = 0, 'sees none of it, not even its own business''s';
end $$;
select pg_temp.expect_error($q$insert into public.app_errors (fingerprint, source, message) values (md5('spy'), 'app', 'Spy')$q$, 'permission denied');
select pg_temp.expect_error($q$select public.record_app_error(md5('spy'), 'app', 'Spy')$q$, 'permission denied');
select pg_temp.expect_error($q$select public.clear_old_app_errors()$q$, 'permission denied');

reset role;
set role anon;
select pg_temp.expect_error($q$select count(*) from public.app_errors$q$, 'permission denied');
select pg_temp.expect_error($q$select public.record_app_error(md5('anon'), 'app', 'Anon')$q$, 'permission denied');

-- 7. Nightly: kinds unseen for 90 days go; owners don't export it -------------------------------------------
select pg_temp.as_editor();
update public.app_errors set last_seen = now() - interval '91 days', first_seen = now() - interval '100 days' where fingerprint = pg_temp.fp('gone');
update public.app_errors set last_seen = now() - interval '89 days', first_seen = now() - interval '100 days' where fingerprint = pg_temp.fp('whose');
select pg_temp.as_worker();
do $$ begin
  assert public.clear_old_app_errors() = 1, 'one unseen for 90 days';
end $$;
select pg_temp.as_editor();
do $$ begin
  assert not exists (select 1 from public.app_errors where fingerprint = pg_temp.fp('gone')), 'gone';
  assert exists (select 1 from public.app_errors where fingerprint = pg_temp.fp('whose')), 'one seen 89 days ago stays';
  assert not exists (select 1 from public.export_tables() where name = 'app_errors'), 'not in an owner''s export';
  assert (select array_agg(name order by name) from public.export_tables()) @> array['business', 'profiles', 'shifts', 'time_entries', 'audit_log', 'billing'],
    'the export as it was';
  assert not has_function_privilege('authenticated', 'public.record_app_error(text, text, text, text, text, int, uuid, jsonb)', 'execute'), 'not signed in';
  assert has_function_privilege('service_role', 'public.record_app_error(text, text, text, text, text, int, uuid, jsonb)', 'execute'), 'the Worker';
end $$;

-- Nothing made here stays.
rollback;
