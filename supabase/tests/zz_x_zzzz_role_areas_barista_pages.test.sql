-- Role areas: Ideas, QR codes, Reps & rewards, the Social planner and the Leaderboard (the
-- `baristas_without_extra_pages` migration): a role can hide them, they're only shown or not, and the
-- areas from before still keep to their levels. Its own people and rows, removed at the end.

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
insert into auth.users (email, raw_user_meta_data, invited_at) values ('bp-admin@test', '{"full_name": "Admin"}', now());
update public.profiles set role = 'admin' where email = 'bp-admin@test';

select pg_temp.act_as('bp-admin@test');
insert into public.job_roles (name, permissions) values
  ('BP barista', '{"todo": "none", "ideas": "none", "qrcodes": "none", "reps": "none", "social": "none", "leaderboard": "none"}');
do $$ begin
  assert (select permissions = '{"todo": "none", "ideas": "none", "qrcodes": "none", "reps": "none", "social": "none", "leaderboard": "none"}'::jsonb
            from public.job_roles where name = 'BP barista'), 'each can be hidden';
end $$;
update public.job_roles set permissions = '{"ideas": "update", "qrcodes": "own", "reps": "update", "social": "update", "leaderboard": "own", "todo": "own", "rota": "none"}'
 where name = 'BP barista';
do $$ begin
  assert (select permissions = '{"ideas": "read", "qrcodes": "read", "reps": "read", "social": "read", "leaderboard": "read", "todo": "own", "rota": "read"}'::jsonb
            from public.job_roles where name = 'BP barista'), 'they''re only shown or not; the others keep to their levels';
end $$;
select pg_temp.expect_error($q$update public.job_roles set permissions = '{"kitty": "none"}' where name = 'BP barista'$q$, 'Each area is none, own, read or update');

-- Tidy up.
reset role; select set_config('request.jwt.claim.sub', '', false);
delete from public.job_roles where name = 'BP barista';
delete from auth.users where email = 'bp-admin@test';
