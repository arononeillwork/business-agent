-- Owner pay: only an owner (an admin with pay access) turns it on or off; a shop manager can't. It starts
-- on. Its own people, removed at the end.

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
  ('opay-owner@test', '{"full_name": "Owner"}', now()),
  ('opay-manager@test', '{"full_name": "Manager"}', now());
update public.profiles set role = 'admin', can_see_pay = true where email = 'opay-owner@test';
update public.profiles set role = 'admin', can_see_pay = false where email = 'opay-manager@test';

do $$ begin
  assert (select owner_pay from public.settings where business_id = (select business_id from public.profiles where email = 'opay-owner@test')), 'on to start';
end $$;

select pg_temp.act_as('opay-manager@test');
select pg_temp.expect_error($q$update public.settings set owner_pay = false$q$, 'Only an owner');

select pg_temp.act_as('opay-owner@test');
do $$ begin
  update public.settings set owner_pay = false;
  assert (select not owner_pay from public.settings), 'an owner turns it off';
  update public.settings set owner_pay = true;
  assert (select owner_pay from public.settings), 'and on';
end $$;

reset role; select set_config('request.jwt.claim.sub', '', false);
update public.settings set updated_by = null where updated_by in (select id from auth.users where email in ('opay-owner@test', 'opay-manager@test'));
delete from auth.users where email in ('opay-owner@test', 'opay-manager@test');
