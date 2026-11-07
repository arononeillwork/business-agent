-- The Business Agent's back-office acts (the hq_actions migration): HQ's admin makes a business
-- complimentary with a note and ends it; nobody else can, a business with a Stripe subscription running
-- waits until that's cancelled, and HQ itself stays complimentary.
-- Runs after zzzzzzzz_hq_reps: HQ exists, run by hq.owner@test; Bar Dos (2) is on Free.

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

create function pg_temp.as_editor() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', '', false);
  perform set_config('request.headers', '', false);
end $$;

-- 1. Who is HQ's admin -------------------------------------------------------------------------
select pg_temp.act_as('hq.owner@test');
do $$ begin assert public.is_hq_admin(), 'HQ''s owner is'; end $$;
select pg_temp.act_as('maria@test');
do $$ begin assert public.is_admin() and not public.is_hq_admin(), 'an admin of another business isn''t'; end $$;

-- 2. Complimentary, from the app ---------------------------------------------------------------
-- Nobody but HQ's admins: Maria is an owner, of her own business only.
select pg_temp.expect_error($q$select public.hq_set_complimentary(2, 'friends_family', 'Lola, a friend')$q$, 'Only The Business Agent HQ');
select pg_temp.expect_error($q$select public.hq_end_complimentary(1)$q$, 'Only The Business Agent HQ');
select pg_temp.act_as('lola@dos');
select pg_temp.expect_error($q$select public.hq_set_complimentary(2, 'founder', 'Me')$q$, 'Only The Business Agent HQ');

select pg_temp.act_as('hq.owner@test');
select pg_temp.expect_error($q$select public.hq_set_complimentary(2, 'cousin', 'Lola')$q$, 'founder or friends_family');
select pg_temp.expect_error($q$select public.hq_set_complimentary(2, 'friends_family', '  ')$q$, 'Add a note');
select pg_temp.expect_error($q$select public.hq_set_complimentary(2, 'friends_family', repeat('x', 201))$q$, '200 characters');
select pg_temp.expect_error($q$select public.hq_set_complimentary(999, 'friends_family', 'Nobody')$q$, 'No such business');
select public.hq_set_complimentary(2, 'friends_family', '  Lola, Aron''s friend from Tenerife ');

select pg_temp.as_editor();
do $$ begin
  assert (select plan = 'business' and status = 'comped' and complimentary = 'friends_family' and complimentary_note = 'Lola, Aron''s friend from Tenerife'
            and complimentary_since > now() - interval '1 minute' from public.billing where business_id = 2), 'Bar Dos: the top plan, free, with the note';
  perform set_config('app.business_id', '2', true);
  assert public.current_plan() = 'business', 'and its plan in force is Business';
end $$;

-- HQ's list shows it.
select pg_temp.act_as('hq.owner@test');
do $$ begin
  assert (select status = 'comped' and complimentary = 'friends_family' from public.hq_businesses() where id = 2), 'on HQ''s list';
end $$;

-- Changing the kind keeps when it started.
select public.hq_set_complimentary(2, 'founder', 'Founding café in the Canaries');
select pg_temp.as_editor();
do $$ begin
  assert (select complimentary = 'founder' and complimentary_note = 'Founding café in the Canaries' and complimentary_since > now() - interval '1 minute'
            from public.billing where business_id = 2), 'founding now';
end $$;

-- Ending it: back to Free. Not twice, and never HQ itself.
select pg_temp.act_as('hq.owner@test');
select public.hq_end_complimentary(2);
select pg_temp.expect_error($q$select public.hq_end_complimentary(2)$q$, 'isn''t complimentary');
select pg_temp.expect_error(format('select public.hq_end_complimentary(%s)', (select id from public.business where is_hq)), 'HQ stays complimentary');
select pg_temp.as_editor();
do $$ begin
  assert (select plan = 'free' and status = 'none' and complimentary is null and complimentary_note is null and complimentary_since is null
            from public.billing where business_id = 2), 'Bar Dos is on Free again';
  assert (select status = 'comped' from public.billing b join public.business h on h.id = b.business_id where h.is_hq), 'HQ still complimentary';
end $$;

-- A business with a Stripe subscription running (a trial here): cancelled in Stripe first.
update public.billing set plan = 'business', status = 'trialing', stripe_customer_id = 'cus_bea', stripe_subscription_id = 'sub_bea',
  trial_ends_at = now() + interval '20 days', trial_used = true
 where business_id = (select id from public.business where name = 'Bea Hair');
select pg_temp.act_as('hq.owner@test');
select pg_temp.expect_error(format('select public.hq_set_complimentary(%s, %L, %L)', (select id from public.hq_businesses() where name = 'Bea Hair'), 'friends_family', 'Bea'),
  'Stripe subscription running');
select pg_temp.as_editor();
update public.billing set status = 'canceled' where stripe_subscription_id = 'sub_bea';
select pg_temp.act_as('hq.owner@test');
select public.hq_set_complimentary((select id from public.hq_businesses() where name = 'Bea Hair'), 'friends_family', 'Bea, Aron''s hairdresser');
select pg_temp.as_editor();
do $$ begin
  assert (select status = 'comped' and plan = 'business' from public.billing where stripe_subscription_id = 'sub_bea'), 'once it ended, complimentary';
end $$;

-- 3. Rights ------------------------------------------------------------------------------------------
do $$ begin
  assert not has_function_privilege('anon', 'public.hq_set_complimentary(int, text, text)', 'execute'), 'not signed out';
  assert not has_function_privilege('anon', 'public.hq_end_complimentary(int)', 'execute'), 'not signed out';
  assert has_function_privilege('authenticated', 'public.hq_set_complimentary(int, text, text)', 'execute'), 'signed in (then HQ''s admins only)';
end $$;
