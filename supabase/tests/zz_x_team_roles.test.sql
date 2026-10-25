-- Team roles: a boss is an admin with pay access, a shop manager an admin without. Only a boss makes
-- someone a boss or changes a boss, and a business with no active boss can still get one. Its own
-- people; everyone else is put back as they were at the end.

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

reset role; select set_config('request.jwt.claim.sub', '', false);
insert into auth.users (email, raw_user_meta_data, invited_at) values
  ('tr-boss@test', '{"full_name": "Boss"}', now()),
  ('tr-manager@test', '{"full_name": "Manager"}', now()),
  ('tr-employee@test', '{"full_name": "Employee"}', now());
update public.profiles set role = 'admin', can_see_pay = true where email = 'tr-boss@test';
update public.profiles set role = 'admin' where email = 'tr-manager@test';
-- The other bosses step aside for now, so tr-boss is the only one.
create temp table other_bosses as
  select id from public.profiles where role = 'admin' and can_see_pay and active and email <> 'tr-boss@test';
update public.profiles set active = false where id in (select id from other_bosses);

-- 1. A shop manager runs the team but can't make a boss or touch one ---------------------------------
select pg_temp.act_as('tr-manager@test');
do $$ begin
  assert public.is_admin() and not public.can_see_pay(), 'a shop manager is an admin without pay access';
  update public.profiles set role = 'admin' where email = 'tr-employee@test';
  assert (select role = 'admin' and not can_see_pay from public.profiles where email = 'tr-employee@test'), 'makes an employee a shop manager';
  update public.profiles set role = 'employee' where email = 'tr-employee@test';
  assert (select role = 'employee' from public.profiles where email = 'tr-employee@test'), 'and back';
end $$;
select pg_temp.expect_error($q$update public.profiles set can_see_pay = true where email = 'tr-employee@test'$q$, 'Only a boss');
select pg_temp.expect_error($q$update public.profiles set can_see_pay = true where id = auth.uid()$q$, 'Only a boss');
select pg_temp.expect_error($q$update public.profiles set role = 'employee' where email = 'tr-boss@test'$q$, 'Only a boss');
select pg_temp.expect_error($q$update public.profiles set can_see_pay = false where email = 'tr-boss@test'$q$, 'Only a boss');
select pg_temp.expect_error($q$update public.profiles set active = false where email = 'tr-boss@test'$q$, 'Only a boss');

-- 2. An employee changes no one's role, as before -----------------------------------------------------
select pg_temp.act_as('tr-employee@test');
select pg_temp.expect_error($q$update public.profiles set can_see_pay = true, role = 'admin' where id = auth.uid()$q$, 'Only an admin');

-- 3. The boss makes and unmakes bosses, and can hand over ------------------------------------------
select pg_temp.act_as('tr-boss@test');
do $$ begin
  update public.profiles set can_see_pay = true where email = 'tr-manager@test';
  assert (select can_see_pay from public.profiles where email = 'tr-manager@test'), 'a boss makes a shop manager a boss';
  update public.profiles set role = 'admin', can_see_pay = true where email = 'tr-employee@test';
  update public.profiles set role = 'employee', can_see_pay = false where email = 'tr-employee@test';
  assert (select role = 'employee' and not can_see_pay from public.profiles where email = 'tr-employee@test'), 'and an employee a boss, and back';
  update public.profiles set can_see_pay = false where id = auth.uid();
  assert not public.can_see_pay(), 'the boss stepped down to shop manager';
end $$;

-- 4. The new boss can't be undone by the shop manager they replaced ----------------------------------
select pg_temp.expect_error($q$update public.profiles set can_see_pay = false where email = 'tr-manager@test'$q$, 'Only a boss');
select pg_temp.expect_error($q$update public.profiles set active = false where email = 'tr-manager@test'$q$, 'Only a boss');

-- 5. A business with no active boss can still get one: any admin may make one ------------------------
select pg_temp.act_as('tr-manager@test');
update public.profiles set can_see_pay = false where id = auth.uid();
select pg_temp.act_as('tr-boss@test');
do $$ begin
  assert not exists (select 1 from public.profiles where role = 'admin' and can_see_pay and active), 'nobody is an active boss';
  update public.profiles set can_see_pay = true where id = auth.uid();
  assert public.can_see_pay(), 'so a shop manager could make themselves one';
end $$;

-- 6. Billing is the boss's (the `billing_boss_only` migration); everyone sees the plan in force ------
do $$ begin
  assert (select count(*) from public.billing) = 1, 'a boss reads billing';
end $$;
select pg_temp.act_as('tr-manager@test');
do $$ begin
  assert public.is_admin() and not public.can_see_pay(), 'tr-manager is a shop manager again';
  assert (select count(*) from public.billing) = 0, 'a shop manager doesn''t read billing';
  assert public.plan_status() ->> 'plan' is not null, 'but sees the plan in force';
end $$;

-- Put everyone back.
reset role; select set_config('request.jwt.claim.sub', '', false);
update public.profiles set active = true where id in (select id from other_bosses);
update public.profiles set active = false where email in ('tr-boss@test', 'tr-manager@test', 'tr-employee@test');
