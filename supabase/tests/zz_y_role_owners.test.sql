-- Who owns each role (the `role_owners` migration): only an owner (an admin with pay access) gives a
-- role to an owner, moves it in their lane or leaves it not owned; a role is only owned by an active
-- owner; a shop manager still changes the role itself, and the team reads who owns it. Someone who
-- leaves leaves their roles not owned. Its own people and role, removed at the end.

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
  ('ro-owner@test', '{"full_name": "Owner"}', now()),
  ('ro-partner@test', '{"full_name": "Second owner"}', now()),
  ('ro-manager@test', '{"full_name": "Manager"}', now()),
  ('ro-employee@test', '{"full_name": "Employee"}', now());
update public.profiles set role = 'admin', can_see_pay = true where email in ('ro-owner@test', 'ro-partner@test');
update public.profiles set role = 'admin' where email = 'ro-manager@test';
insert into public.job_roles (name, summary) values ('RO role', 'Owned in the test'), ('RO other', null);

do $$ begin
  assert (select owned_by is null and owner_sort = 0 from public.job_roles where name = 'RO role'), 'a role starts not owned';
end $$;

-- 1. An owner gives it to an owner, themselves or the other one, and places it in their lane.
select pg_temp.act_as('ro-owner@test');
do $$ begin
  update public.job_roles set owned_by = auth.uid(), owner_sort = 2 where name = 'RO role';
  assert (select owned_by = auth.uid() and owner_sort = 2 from public.job_roles where name = 'RO role'), 'an owner takes a role';
  update public.job_roles set owned_by = (select id from public.profiles where email = 'ro-partner@test'), owner_sort = 0 where name = 'RO role';
  assert (select owned_by = (select id from public.profiles where email = 'ro-partner@test') from public.job_roles where name = 'RO role'),
    'and gives it to the other owner';
end $$;

-- 2. Only to an owner: not a shop manager, nor an employee.
select pg_temp.expect_error($q$update public.job_roles set owned_by = (select id from public.profiles where email = 'ro-manager@test') where name = 'RO role'$q$,
  'Only an owner of the business can own a role');
select pg_temp.expect_error($q$update public.job_roles set owned_by = (select id from public.profiles where email = 'ro-employee@test') where name = 'RO role'$q$,
  'Only an owner of the business can own a role');

-- 3. A shop manager changes the role itself, not who owns it or its place.
select pg_temp.act_as('ro-manager@test');
do $$ begin
  update public.job_roles set summary = 'Changed by the manager' where name = 'RO role';
  assert (select summary = 'Changed by the manager' and owned_by = (select id from public.profiles where email = 'ro-partner@test')
            from public.job_roles where name = 'RO role'), 'the role changes, its owner stays';
end $$;
select pg_temp.expect_error($q$update public.job_roles set owned_by = null where name = 'RO role'$q$, 'Only an owner decides who owns a role');
select pg_temp.expect_error($q$update public.job_roles set owner_sort = 5 where name = 'RO role'$q$, 'Only an owner decides who owns a role');
select pg_temp.expect_error($q$update public.job_roles set owned_by = auth.uid() where name = 'RO other'$q$, 'Only an owner decides who owns a role');
select pg_temp.expect_error($q$insert into public.job_roles (name, owned_by) values ('RO new', (select id from public.profiles where email = 'ro-owner@test'))$q$,
  'Only an owner decides who owns a role');

-- 4. An employee reads who owns it and changes nothing.
select pg_temp.act_as('ro-employee@test');
do $$ begin
  assert (select owned_by = (select id from public.profiles where email = 'ro-partner@test') from public.job_roles where name = 'RO role'), 'the team reads it';
  update public.job_roles set owned_by = null where name = 'RO role';
end $$;
reset role; select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  assert (select owned_by is not null from public.job_roles where name = 'RO role'), 'an employee changes nothing';
end $$;

-- 5. An owner leaves it not owned again; no longer an owner, nobody can be given a role.
select pg_temp.act_as('ro-owner@test');
do $$ begin
  update public.job_roles set owned_by = null, owner_sort = 1 where name = 'RO role';
  assert (select owned_by is null and owner_sort = 1 from public.job_roles where name = 'RO role'), 'not owned again';
  update public.job_roles set owned_by = (select id from public.profiles where email = 'ro-partner@test') where name = 'RO other';
end $$;
reset role; select set_config('request.jwt.claim.sub', '', false);
update public.profiles set active = false where email = 'ro-partner@test';
select pg_temp.act_as('ro-owner@test');
select pg_temp.expect_error($q$update public.job_roles set owned_by = (select id from public.profiles where email = 'ro-partner@test') where name = 'RO role'$q$,
  'Only an owner of the business can own a role');
do $$ begin
  update public.job_roles set owner_sort = 3 where name = 'RO other';
  assert (select owner_sort = 3 from public.job_roles where name = 'RO other'), 'a role they already own still moves in the lane';
end $$;

-- 6. The server's own code (no signed-in user) can; someone who leaves leaves their roles not owned.
reset role; select set_config('request.jwt.claim.sub', '', false);
update public.job_roles set owned_by = (select id from public.profiles where email = 'ro-owner@test') where name = 'RO role';
delete from auth.users where email = 'ro-partner@test';
do $$ begin
  assert (select owned_by is null from public.job_roles where name = 'RO other'), 'their roles are not owned any more';
  assert (select owned_by = (select id from public.profiles where email = 'ro-owner@test') from public.job_roles where name = 'RO role'), 'the others keep theirs';
end $$;

delete from public.job_roles where name in ('RO role', 'RO other');
delete from auth.users where email in ('ro-owner@test', 'ro-manager@test', 'ro-employee@test');
