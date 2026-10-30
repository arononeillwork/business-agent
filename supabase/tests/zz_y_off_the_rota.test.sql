-- Off the rota: an admin takes someone off it and puts them back; nobody else can, themselves
-- included. Its own people, removed at the end.

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
  ('or-admin@test', '{"full_name": "Admin"}', now()),
  ('or-employee@test', '{"full_name": "Employee"}', now());
update public.profiles set role = 'admin' where email = 'or-admin@test';

do $$ begin
  assert (select on_rota from public.profiles where email = 'or-employee@test'), 'everyone starts on the rota';
end $$;

-- An admin takes someone off and puts them back, themselves included.
select pg_temp.act_as('or-admin@test');
do $$ begin
  update public.profiles set on_rota = false where email = 'or-employee@test';
  assert (select not on_rota from public.profiles where email = 'or-employee@test'), 'an admin takes someone off the rota';
  update public.profiles set on_rota = false where id = auth.uid();
  assert (select not on_rota from public.profiles where id = auth.uid()), 'and themselves';
  update public.profiles set on_rota = true where email = 'or-employee@test';
  assert (select on_rota from public.profiles where email = 'or-employee@test'), 'and puts them back';
end $$;

-- An employee can't, not even for themselves; they still change their own details.
select pg_temp.act_as('or-employee@test');
select pg_temp.expect_error($q$update public.profiles set on_rota = false where id = auth.uid()$q$, 'Only an admin');
do $$ begin
  update public.profiles set phone = '+34 600 000 000' where id = auth.uid();
  assert (select phone = '+34 600 000 000' and on_rota from public.profiles where id = auth.uid()), 'their own details still change';
end $$;

-- The server's own code (no signed-in user) can.
reset role; select set_config('request.jwt.claim.sub', '', false);
update public.profiles set on_rota = false where email = 'or-employee@test';

delete from auth.users where email in ('or-admin@test', 'or-employee@test');
