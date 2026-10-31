-- Agents (the `agent_views` migration): the owners' changes to the agents are kept with the settings.
-- The team reads them; only an owner (an admin with pay access) changes them, not a shop manager (who
-- still changes the other settings) nor an employee; the server's own code can. Its own people,
-- removed at the end, and the settings put back as they were.

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
  ('av-owner@test', '{"full_name": "Owner"}', now()),
  ('av-manager@test', '{"full_name": "Manager"}', now()),
  ('av-employee@test', '{"full_name": "Employee"}', now());
update public.profiles set role = 'admin', can_see_pay = true where email = 'av-owner@test';
update public.profiles set role = 'admin' where email = 'av-manager@test';
create temp table av_before as select hidden_pages from public.settings where id = 1;
grant select on av_before to authenticated;

do $$ begin
  assert (select agent_views is null from public.settings where id = 1), 'the usual agents to start with';
end $$;

-- 1. An owner changes them: turns one off, renames one, adds their own, and goes back to the usual ones.
select pg_temp.act_as('av-owner@test');
do $$ begin
  update public.settings set agent_views = '[{"key": "finance", "off": true}, {"key": "sales", "name": "Ventas"},
    {"key": "own-1", "name": "Coffee buyer", "description": "Beans and milk", "icon": "custom", "pages": ["stock", "suppliers"]}]'
   where id = 1;
  assert (select jsonb_array_length(agent_views) = 3 and agent_views -> 2 ->> 'name' = 'Coffee buyer' from public.settings where id = 1),
    'an owner changes the agents';
  update public.settings set agent_views = null where id = 1;
  assert (select agent_views is null from public.settings where id = 1), 'and puts the usual ones back';
end $$;

-- 2. They're a list, and not an endless one.
select pg_temp.expect_error($q$update public.settings set agent_views = '{"key": "finance"}' where id = 1$q$, 'settings_agent_views_check');
select pg_temp.expect_error($q$update public.settings set agent_views = (select jsonb_agg(jsonb_build_object('key', 'own-' || n)) from generate_series(1, 51) n) where id = 1$q$,
  'settings_agent_views_check');
update public.settings set agent_views = '[{"key": "investor", "off": true}]' where id = 1;

-- 3. A shop manager can't change them, and still changes the other settings.
select pg_temp.act_as('av-manager@test');
do $$ begin
  assert public.is_admin() and not public.can_see_pay(), 'a shop manager is an admin without pay access';
end $$;
select pg_temp.expect_error($q$update public.settings set agent_views = null where id = 1$q$, 'Only an owner');
select pg_temp.expect_error($q$update public.settings set agent_views = '[]', hidden_pages = '{sports}' where id = 1$q$, 'Only an owner');
do $$ begin
  update public.settings set hidden_pages = '{sports}' where id = 1;
  assert (select hidden_pages = '{sports}' and agent_views = '[{"key": "investor", "off": true}]' from public.settings where id = 1),
    'the other settings still change, the agents stay';
  update public.settings set hidden_pages = (select hidden_pages from av_before) where id = 1;
end $$;

-- 4. An employee reads them (with the rest of the settings) and changes nothing.
select pg_temp.act_as('av-employee@test');
do $$ begin
  assert (select agent_views = '[{"key": "investor", "off": true}]' from public.settings where id = 1), 'the team reads them';
  update public.settings set agent_views = null where id = 1;
end $$;
reset role; select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  assert (select agent_views = '[{"key": "investor", "off": true}]' from public.settings where id = 1), 'an employee changes nothing';
end $$;

-- 5. The server's own code (no signed-in user) can.
update public.settings set agent_views = null where id = 1;
do $$ begin
  assert (select agent_views is null and hidden_pages = (select hidden_pages from av_before) from public.settings where id = 1), 'back as it was';
end $$;

drop table av_before;
delete from auth.users where email in ('av-owner@test', 'av-manager@test', 'av-employee@test');
