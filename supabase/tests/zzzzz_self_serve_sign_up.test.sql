-- Self-serve sign-up (the self_serve_sign_up migration): someone in no business creates theirs and
-- runs it, with everything a business starts with; a referral link counts for the business that
-- shared it once the new one finishes set-up. Runs after zzzz_several_businesses (two businesses,
-- and Nadie and Colado signed up on their own, in none).

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

-- Test Café's referral link.
select pg_temp.as_editor();
select set_config('test.code', (select referral_code from public.business where id = 1), false);

-- 1. Nadie creates her café from Test Café's link ------------------------------------------
select pg_temp.act_as('nadie@test.es');
do $$
declare v int;
begin
  v := public.create_business('  Café Nadie  ', 'cafe', 'Europe/Madrid', lower(current_setting('test.code')));
  assert v = 3, 'the third business: ' || v;
  assert public.current_business_id() = 3, 'she is in it straight away';
  assert (select role = 'admin' and can_see_pay and active from public.profiles where id = auth.uid()), 'and runs it: admin and boss';
  assert (select name = 'Café Nadie' and business_type = 'Café' and timezone = 'Europe/Madrid' from public.business), 'its details, tidied';
  assert (select count(*) from public.business) = 1, 'she sees her own business only';
  assert (select business_id from public.settings where id = 1) = 3, 'its own settings';
  assert public.current_plan() = 'free', 'on the Free plan';
  assert (select referred_month and referred_by = 'Test Café' from public.billing), 'with its month for being referred';
  assert (select count(*) from public.integrations) = (select count(distinct provider) from public.integrations)
     and (select count(*) from public.integrations) > 10, 'every app to connect, once';
  assert not exists (select 1 from public.integrations where status = 'connected'), 'none connected yet';
  assert (select count(*) from public.sports_competitions) > 0 and not exists (select 1 from public.sports_competitions where followed),
    'the sports catalogue, nothing followed';
  assert (select string_agg(name, ', ' order by sort) from public.positions) = 'Barista, Kitchen', 'a café''s positions';
  assert (select count(*) from public.break_types) = 1, 'a break';
  assert (select count(*) from public.todo_categories) = 10, 'the to-do categories';
  assert (select count(*) from public.competitors where is_self and name = 'Café Nadie') = 1, 'itself on Competitors';
  assert (select count(*) from public.profiles) = 1, 'a team of one';
  assert exists (select 1 from public.audit_log where table_name = 'business') and not exists (select 1 from public.audit_log where business_id <> 3),
    'its own change log';
end $$;
select pg_temp.expect_error($q$select public.create_business('Another one')$q$, 'already in a business');

-- Test Café's admins see who joined through its link; it counts once Café Nadie has finished set-up.
select pg_temp.act_as('maria@test');
do $$ begin
  assert (select became = 3 and set_up_at is null and business_name = 'Café Nadie' from public.referrals where email = 'nadie@test.es'),
    'joined through the link, not set up yet';
  assert not exists (select 1 from public.business where id = 3), 'but sees nothing of the new business';
end $$;
select pg_temp.act_as('nadie@test.es');
update public.business set setup_completed_at = now();
select pg_temp.act_as('maria@test');
do $$ begin
  assert (select set_up_at is not null from public.referrals where email = 'nadie@test.es'), 'set up: Test Café''s month counts';
end $$;

-- 2. What can't be done -------------------------------------------------------------------
select pg_temp.act_as('colado@test.es');
select pg_temp.expect_error($q$select public.create_business('   ')$q$, 'Give your business a name');
select pg_temp.expect_error($q$select public.create_business('Bar', 'casino')$q$, 'Unknown kind');
do $$
declare v int;
begin
  -- No link, an unknown time zone and no kind: still a business, on Madrid time, with a team position.
  v := public.create_business('Colado Shop', null, 'Mars/Olympus', 'NOPE1234');
  assert (select timezone from public.business) = 'Europe/Madrid', 'an unknown time zone falls back to Madrid';
  assert (select referred_by is null from public.business), 'an unknown link refers nobody';
  assert (select string_agg(name, ', ') from public.positions) = 'Team', 'a business of another kind gets one position';
end $$;
select pg_temp.act_as('pepe@dos');
select pg_temp.expect_error($q$select public.create_business('Bar Tres')$q$, 'already in a business');
select pg_temp.as_editor();
set role anon;
select pg_temp.expect_error($q$select public.create_business('Ghost')$q$, 'permission denied');
reset role;

-- 3. A sign-up now joins no business --------------------------------------------------------
insert into auth.users (email, raw_user_meta_data) values ('nuevo@test', '{"full_name":"Nuevo"}');
do $$ begin
  assert (select business_id is null and not active from public.profiles where email = 'nuevo@test'), 'in none until they create one or are added';
end $$;
