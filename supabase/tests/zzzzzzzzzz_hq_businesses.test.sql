-- The Business Agent's back-office (the hq_businesses migration): HQ's admin sees every business, with
-- its plan, team and last sign-in; an admin of any other business, and anyone signed out, sees none.
-- Runs after zzzzzzzz_hq_reps: HQ exists, run by hq.owner@test.

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.headers', '', false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

reset role;
update auth.users set last_sign_in_at = '2026-11-05 09:00+00' where email = 'maria@test';

select pg_temp.act_as('hq.owner@test');
do $$
declare v_all int;
begin
  set local role postgres;
  v_all := (select count(*) from public.business);
  reset role;
  assert (select count(*) from public.hq_businesses()) = v_all, 'HQ’s admin sees every business';
  assert (select count(*) from public.hq_businesses() where is_hq) = 1, 'HQ among them';
  assert (select plan = 'business' and people = 5 from public.hq_businesses() where id = 1), 'the first business: its plan and its team of five';
  assert (select plan = 'business' and status = 'comped' from public.hq_businesses() where is_hq), 'HQ: complimentary Business';
  assert (select plan = 'free' and status = 'none' from public.hq_businesses() where id = 2), 'a business on Free';
  assert (select last_sign_in >= '2026-11-05 09:00+00' from public.hq_businesses() where id = 1), 'and when its people last signed in';
end $$;

-- An admin of another business, and anyone signed out: nothing.
select pg_temp.act_as('maria@test');
do $$
begin
  assert public.is_admin(), 'Maria is an admin of her own business';
  assert (select count(*) from public.hq_businesses()) = 0, 'but sees no other business';
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false);
do $$
begin
  assert not has_function_privilege('anon', 'public.hq_businesses()', 'execute'), 'not signed out';
end $$;
