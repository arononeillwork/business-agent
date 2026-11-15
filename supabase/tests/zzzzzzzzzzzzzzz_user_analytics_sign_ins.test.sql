-- User analytics' sign-ins (the user_analytics_sign_ins migration): each person's last sign-in and how, from
-- auth, for an owner of their own business only. People from the tests before it: maria (owner), nopay-admin
-- (admin without pay), julio (employee) in business 1; lola (owner) and pepe in business 2. Nothing made here stays.

begin;

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.headers', '{}', false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

-- Everyone's id, looked up once (a signed-in person can't read auth.users).
reset role;
create temp table ids as select email, id from auth.users;
grant select on ids to authenticated;
create function pg_temp.person(p_email text) returns uuid language sql as $$
  select id from ids where email = p_email
$$;

-- Julio signed up with his email and last signed in with Google; Maria with her email; Pepe in business 2;
-- nopay-admin never signed in.
reset role;
update auth.users set last_sign_in_at = null where email = 'nopay-admin@test';
update auth.users set last_sign_in_at = now() - interval '2 hours', raw_app_meta_data = '{"provider":"email"}' where email = 'julio@test';
insert into auth.identities (user_id, provider, last_sign_in_at) values
  (pg_temp.person('julio@test'), 'email', now() - interval '20 days'),
  (pg_temp.person('julio@test'), 'google', now() - interval '2 hours');
update auth.users set last_sign_in_at = now() - interval '1 day', raw_app_meta_data = '{"provider":"email"}' where email = 'maria@test';
update auth.users set last_sign_in_at = now() - interval '3 days' where email = 'pepe@dos';

-- The owner sees her business's sign-ins, each with how it was made.
select pg_temp.act_as('maria@test');
do $$ begin
  assert (select provider = 'google' and last_sign_in_at > now() - interval '3 hours' from public.usage_sign_ins() where profile_id = pg_temp.person('julio@test')),
    'Julio last signed in with Google';
  assert (select provider = 'email' from public.usage_sign_ins() where profile_id = pg_temp.person('maria@test')), 'no identity: how she joined';
  assert (select full_name = 'Julio' and role = 'employee' and colour is not null from public.usage_sign_ins() where profile_id = pg_temp.person('julio@test')),
    'with whose it is';
  assert not exists (select 1 from public.usage_sign_ins() where profile_id = pg_temp.person('nopay-admin@test')), 'nobody who never signed in';
  assert not exists (select 1 from public.usage_sign_ins() where profile_id = pg_temp.person('pepe@dos')), 'nobody from business 2';
end $$;

-- Nobody but an owner gets any.
select pg_temp.act_as('nopay-admin@test');
do $$ begin assert not exists (select 1 from public.usage_sign_ins()), 'not an admin without pay'; end $$;
select pg_temp.act_as('julio@test');
do $$ begin assert not exists (select 1 from public.usage_sign_ins()), 'not an employee'; end $$;

-- Business 2's owner sees only business 2's.
select pg_temp.act_as('lola@dos');
do $$ begin
  assert (select count(*) = 1 from public.usage_sign_ins() where profile_id = pg_temp.person('pepe@dos')), 'Pepe';
  assert not exists (select 1 from public.usage_sign_ins() where profile_id = pg_temp.person('julio@test')), 'not business 1''s';
end $$;

reset role;
rollback;
