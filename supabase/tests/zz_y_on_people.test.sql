-- On the People page: an admin leaves a login off it (the business's own shared login) and puts it
-- back; nobody else can, themselves included. Its own people, removed at the end.

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
  ('op-admin@test', '{"full_name": "Admin"}', now()),
  ('op-shared@test', '{"full_name": "Owner"}', now()),
  ('op-employee@test', '{"full_name": "Employee"}', now());
update public.profiles set role = 'admin' where email in ('op-admin@test', 'op-shared@test');

do $$ begin
  assert (select on_people from public.profiles where email = 'op-shared@test'), 'everyone starts on the People page';
end $$;

-- An admin leaves the shared login off and puts it back; it still signs in.
select pg_temp.act_as('op-admin@test');
do $$ begin
  update public.profiles set on_people = false where email = 'op-shared@test';
  assert (select not on_people and active from public.profiles where email = 'op-shared@test'), 'off People, still active';
  update public.profiles set on_people = true where email = 'op-shared@test';
  assert (select on_people from public.profiles where email = 'op-shared@test'), 'and back';
end $$;

-- An employee can't, not even for themselves; they still change their own details.
select pg_temp.act_as('op-employee@test');
select pg_temp.expect_error($q$update public.profiles set on_people = false where id = auth.uid()$q$, 'Only an admin');
do $$ begin
  update public.profiles set phone = '+34 600 000 001' where id = auth.uid();
  assert (select phone = '+34 600 000 001' and on_people from public.profiles where id = auth.uid()), 'their own details still change';
end $$;

reset role; select set_config('request.jwt.claim.sub', '', false);
delete from auth.users where email in ('op-admin@test', 'op-shared@test', 'op-employee@test');
