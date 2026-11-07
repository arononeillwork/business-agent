-- The back-office's funnel (the hq_funnel migration): for HQ's admin, each business's week two (someone
-- clocked in, added a shift or changed something from day 7 to day 14; "not yet" while it's younger than
-- 14 days) and whether and when it cancelled (its Stripe subscription, or an owner asking to close the
-- account; never a complimentary one). Nobody else sees any of it.
-- Runs after the HQ tests: HQ exists, run by hq.owner@test.

begin;

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.headers', '', false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

create function pg_temp.as_editor() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', '', false);
  perform set_config('request.headers', '', false);
end $$;

-- A business that signed up p_age ago, with its billing row (as the SQL editor would add it).
create function pg_temp.business(p_name text, p_age interval) returns int language plpgsql as $$
declare v int;
begin
  insert into public.business (name, timezone, opening_hours, created_at) values (p_name, 'Europe/Madrid', '{}', now() - p_age) returning id into v;
  insert into public.billing (business_id) values (v);
  return v;
end $$;

create function pg_temp.made(p_business int) returns timestamptz language sql as $$ select created_at from public.business where id = p_business $$;
-- Its number, as HQ's admin finds it on the list (signed in, they see only HQ's own business row).
create function pg_temp.id(p_name text) returns int language sql as $$ select id from public.hq_businesses() where name = p_name $$;

select pg_temp.as_editor();

-- 1. Week two -----------------------------------------------------------------------------------
do $$
declare v int; v_who uuid;
begin
  -- Someone clocked in on day 12.
  v := pg_temp.business('Funnel Clock-in', interval '40 days');
  insert into auth.users (email, raw_user_meta_data, invited_at) values ('ana@funnel', format('{"full_name":"Ana","role":"admin","business_id":"%s"}', v)::jsonb, now());
  select id into v_who from public.profiles where email = 'ana@funnel' and business_id = v;
  insert into public.time_entries (business_id, profile_id, clock_in, clock_out, source)
    values (v, v_who, pg_temp.made(v) + interval '12 days', pg_temp.made(v) + interval '12 days 4 hours', 'manual');

  -- A shift added to the rota on day 7, its first moment.
  v := pg_temp.business('Funnel Rota', interval '30 days');
  insert into public.shifts (business_id, starts_at, ends_at, created_at)
    values (v, now() + interval '1 day', now() + interval '1 day 6 hours', pg_temp.made(v) + interval '7 days');

  -- A change someone made (the audit log, with who) on day 10.
  v := pg_temp.business('Funnel Change', interval '20 days');
  insert into public.audit_log (business_id, at, actor, via, table_name, row_id, action)
    values (v, pg_temp.made(v) + interval '10 days', (select id from auth.users where email = 'hq.owner@test'), 'app', 'settings', '1', 'update');

  -- Quiet in week two: busy on day 2 and day 20, a shift at the very end of day 14 (day 15 has begun),
  -- and a change on day 9 that nobody made (a sync, the SQL editor).
  v := pg_temp.business('Funnel Quiet', interval '30 days');
  insert into public.shifts (business_id, starts_at, ends_at, created_at) values
    (v, now(), now() + interval '6 hours', pg_temp.made(v) + interval '2 days'),
    (v, now(), now() + interval '6 hours', pg_temp.made(v) + interval '14 days');
  insert into public.audit_log (business_id, at, actor, via, table_name, row_id, action) values
    (v, pg_temp.made(v) + interval '20 days', (select id from auth.users where email = 'hq.owner@test'), 'app', 'shifts', 'x', 'insert'),
    (v, pg_temp.made(v) + interval '9 days', null, 'app', 'business', '1', 'update');

  -- Ten days old, busy on day 8: its second week isn't over.
  v := pg_temp.business('Funnel New', interval '10 days');
  insert into public.shifts (business_id, starts_at, ends_at, created_at) values (v, now(), now() + interval '6 hours', pg_temp.made(v) + interval '8 days');
end $$;

select pg_temp.act_as('hq.owner@test');
do $$ begin
  assert (select active_week_two from public.hq_funnel() where id = pg_temp.id('Funnel Clock-in')), 'a clock-in on day 12 counts';
  assert (select active_week_two from public.hq_funnel() where id = pg_temp.id('Funnel Rota')), 'a shift added on day 7 counts';
  assert (select active_week_two from public.hq_funnel() where id = pg_temp.id('Funnel Change')), 'a change someone made on day 10 counts';
  assert (select active_week_two = false from public.hq_funnel() where id = pg_temp.id('Funnel Quiet')), 'nothing between day 7 and day 14 that someone did: no';
  assert (select active_week_two is null from public.hq_funnel() where id = pg_temp.id('Funnel New')), 'younger than 14 days: not yet';
end $$;

-- 2. Cancelled -----------------------------------------------------------------------------------
select pg_temp.as_editor();
do $$
declare v int;
begin
  -- Its subscription ended, 50 days ago.
  v := pg_temp.business('Funnel Ended', interval '200 days');
  update public.billing set plan = 'pro', status = 'canceled', stripe_customer_id = 'cus_f1', stripe_subscription_id = 'sub_f1',
    canceled_at = now() - interval '50 days' where business_id = v;
  -- Still paying to the end of the month, but set to end then: cancelled 3 days ago.
  v := pg_temp.business('Funnel Ending', interval '100 days');
  update public.billing set plan = 'starter', status = 'active', stripe_customer_id = 'cus_f2', stripe_subscription_id = 'sub_f2',
    cancel_at_period_end = true, canceled_at = now() - interval '3 days' where business_id = v;
  -- Cancelled before Stripe's date was kept: counts, with no month yet.
  v := pg_temp.business('Funnel Undated', interval '300 days');
  update public.billing set plan = 'starter', status = 'canceled', stripe_customer_id = 'cus_f3', stripe_subscription_id = 'sub_f3' where business_id = v;
  -- An owner asked to close it 5 days ago, after its subscription had ended 20 days ago: the earlier.
  v := pg_temp.business('Funnel Closing', interval '90 days');
  update public.billing set plan = 'pro', status = 'canceled', stripe_customer_id = 'cus_f4', stripe_subscription_id = 'sub_f4',
    canceled_at = now() - interval '20 days' where business_id = v;
  update public.business set closing_requested_at = now() - interval '5 days' where id = v;
  -- Only the closing: on Free.
  v := pg_temp.business('Funnel Leaving', interval '60 days');
  update public.business set closing_requested_at = now() - interval '2 days' where id = v;
  -- Complimentary now (friends & family who once cancelled): not cancelled.
  v := pg_temp.business('Funnel Friend', interval '120 days');
  update public.billing set plan = 'business', status = 'comped', complimentary = 'friends_family', complimentary_note = 'Pepa',
    complimentary_since = now(), stripe_customer_id = 'cus_f5', canceled_at = now() - interval '40 days' where business_id = v;
end $$;

select pg_temp.act_as('hq.owner@test');
do $$
declare r record;
begin
  select * into r from public.hq_funnel() where id = pg_temp.id('Funnel Ended');
  assert r.cancelled and r.cancelled_at between now() - interval '50 days 1 minute' and now() - interval '50 days' + interval '1 minute', 'ended: cancelled, 50 days ago';
  select * into r from public.hq_funnel() where id = pg_temp.id('Funnel Ending');
  assert r.cancelled and r.cancelled_at < now() - interval '2 days', 'set to end: cancelled, when it was';
  select * into r from public.hq_funnel() where id = pg_temp.id('Funnel Undated');
  assert r.cancelled and r.cancelled_at is null, 'ended before dates were kept: cancelled, no date';
  select * into r from public.hq_funnel() where id = pg_temp.id('Funnel Closing');
  assert r.cancelled and r.cancelled_at < now() - interval '19 days', 'the earlier of the two';
  select * into r from public.hq_funnel() where id = pg_temp.id('Funnel Leaving');
  assert r.cancelled and r.cancelled_at > now() - interval '3 days', 'asking to close is cancelling';
  select * into r from public.hq_funnel() where id = pg_temp.id('Funnel Friend');
  assert not r.cancelled and r.cancelled_at is null, 'complimentary now: not cancelled';
  select * into r from public.hq_funnel() where id = pg_temp.id('Funnel Quiet');
  assert not r.cancelled and r.cancelled_at is null, 'on Free, never subscribed: not cancelled';
  assert (select not cancelled from public.hq_funnel() h join public.hq_businesses() b using (id) where b.is_hq), 'nor HQ';
end $$;

-- Every business, once.
do $$
declare v_all int;
begin
  set local role postgres;
  v_all := (select count(*) from public.business);
  reset role;
  assert (select count(*) from public.hq_funnel()) = v_all, 'one row per business';
  assert (select count(distinct id) from public.hq_funnel()) = v_all, 'none twice';
end $$;

-- 3. Nobody else ---------------------------------------------------------------------------------
select pg_temp.act_as('maria@test');
do $$ begin
  assert public.is_admin() and (select count(*) from public.hq_funnel()) = 0, 'an admin of another business sees nothing';
end $$;
select pg_temp.act_as('ana@funnel');
do $$ begin
  assert (select count(*) from public.hq_funnel()) = 0, 'nor does one of these businesses';
end $$;

select pg_temp.as_editor();
do $$ begin
  assert not has_function_privilege('anon', 'public.hq_funnel()', 'execute'), 'not signed out';
  assert has_function_privilege('authenticated', 'public.hq_funnel()', 'execute'), 'signed in (then HQ''s admins only)';
end $$;

-- Nothing made here stays (deleting a business isn't something the app does): later tests find the businesses
-- as they were.
rollback;
