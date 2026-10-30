-- Server code that names no business (the service key without a header, Supabase's sign-in service,
-- the SQL editor), with several businesses: the team limit is the plan of the business the person
-- joins, and a change is logged in the row's own business, so an account in a business can be
-- deleted. Runs after zzzz_several_businesses: two businesses, the first on the founder's comped plan
-- with more than 3 people, Bar Dos on Free and full. Its own people, removed at the end.

create function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_err text;
begin
  begin execute p_sql; exception when others then v_err := sqlerrm; end;
  if v_err is null then raise exception 'Expected error like "%" but statement succeeded: %', p_like, p_sql; end if;
  if v_err not ilike '%' || p_like || '%' then raise exception 'Expected error like "%", got "%"', p_like, v_err; end if;
end $$;

-- The service key with no business named.
create function pg_temp.as_server() returns void language plpgsql as $$
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

select pg_temp.as_editor();
-- Signed up on their own: in no business yet.
insert into auth.users (email, raw_user_meta_data) values
  ('br-staff@test', '{"full_name":"Staff"}'), ('br-tablet@test', '{"full_name":"Tablet"}'), ('br-extra@test', '{"full_name":"Extra"}');

-- 1. Joined to a business by server code naming none: that business's plan counts ----------------
select pg_temp.as_server();
do $$ begin
  assert public.current_business_id() is null, 'no business named, and there are several';
  assert (select count(*) from public.profiles where business_id = 1 and active and role in ('admin', 'employee')) > 3,
    'the first business has more people than Free allows';
  update public.profiles set business_id = 1, role = 'employee', active = true where email = 'br-staff@test';
  assert (select business_id = 1 and active from public.profiles where email = 'br-staff@test'), 'joins the first business, on its plan';
  update public.profiles set business_id = 1, role = 'kiosk', active = true where email = 'br-tablet@test';
  assert (select role = 'kiosk' and active from public.profiles where email = 'br-tablet@test'), 'and its café tablet';
  assert public.current_business_id() is null, 'the business it acted for is put back';
end $$;
-- Bar Dos is on Free and full: still refused.
select pg_temp.expect_error($q$update public.profiles set business_id = 2, role = 'employee', active = true where email = 'br-extra@test'$q$,
  'team is full');

-- 2. Each change is logged in the row's business ------------------------------------------------
select pg_temp.as_editor();
do $$ begin
  assert (select count(*) from public.audit_log a join public.profiles p on a.row_id = p.id::text
           where p.email = 'br-staff@test' and a.table_name = 'profiles' and a.business_id = 1) >= 1,
    'joining the first business is in its log';
end $$;

-- 3. An account in a business is deleted with no business named (as the sign-in service does) ---
delete from auth.users where email in ('br-staff@test', 'br-tablet@test', 'br-extra@test');
do $$ begin
  assert not exists (select 1 from public.profiles where email like 'br-%@test'), 'the accounts and their profiles are gone';
  assert (select count(*) from public.audit_log where table_name = 'profiles' and action = 'delete' and business_id = 1
           and old_values ->> 'email' = 'br-staff@test') = 1, 'and the deletion is in the first business''s log';
  assert public.current_business_id() is null, 'still no business named afterwards';
end $$;
