-- User analytics by location (the user_analytics_locations migration): each visit keeps the connection it
-- started on; owners name connections, and usage_report_by_location() keeps each total apart by location (a
-- connection's name, else its town). Only owners name or read them, and only their own business's. People from
-- the tests before it: maria (owner), nopay-admin (admin without pay), julio (employee) in business 1; lola
-- (owner) and pepe in business 2. Nothing made here stays.

begin;

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.headers', '{}', false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

create function pg_temp.as_worker(p_business int) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', 'service_role', false);
  perform set_config('request.headers', json_build_object('x-business-id', p_business::text)::text, false);
  set role service_role;
end $$;

create function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_err text;
begin
  begin execute p_sql; exception when others then v_err := sqlerrm; end;
  if v_err is null then raise exception 'Expected error like "%" but statement succeeded: %', p_like, p_sql; end if;
  if v_err not ilike '%' || p_like || '%' then raise exception 'Expected error like "%", got "%"', p_like, v_err; end if;
end $$;

reset role;
create temp table ids as select email, id from auth.users;
grant select on ids to authenticated, service_role;
create function pg_temp.person(p_email text) returns uuid language sql as $$ select id from ids where email = p_email $$;

-- The shop's broadband (a…) and Julio's phone on mobile data (b…), both placed in Marbella by Cloudflare. The
-- business's own Google account isn't needed to show it: one person at two places is the same.
select pg_temp.as_worker(1);
do $$ begin
  assert public.record_usage(pg_temp.person('julio@test'), gen_random_uuid(), 'tablet', 'iPadOS', 'Safari', true, 'Marbella', 'Andalusia', 'ES',
    '[{"page":"rules","views":1,"seconds":100}]', 'aaaaaaaaaaaaaaaa'), 'at the shop';
  assert public.record_usage(pg_temp.person('julio@test'), gen_random_uuid(), 'phone', 'iOS', 'Safari', true, 'Marbella', 'Andalusia', 'ES',
    '[{"page":"rota","views":1,"seconds":20}]', 'bbbbbbbbbbbbbbbb'), 'on his phone';
  assert public.record_usage(pg_temp.person('maria@test'), gen_random_uuid(), 'computer', 'macOS', 'Chrome', false, 'Marbella', 'Andalusia', 'ES',
    '[{"page":"rules","views":1,"seconds":30}]', 'aaaaaaaaaaaaaaaa'), 'the owner at the shop';
  -- Not a connection's id: kept without one. And the Worker live before this migration, without p_network at all.
  assert public.record_usage(p_profile => pg_temp.person('maria@test'), p_visit => gen_random_uuid(), p_device => 'phone', p_os => 'iOS',
    p_browser => 'Safari', p_installed => false, p_city => null, p_region => null, p_country => null, p_pages => '[]', p_network => 'not one'), 'kept';
  assert public.record_usage(p_profile => pg_temp.person('maria@test'), p_visit => gen_random_uuid(), p_device => 'phone', p_os => null,
    p_browser => null, p_installed => false, p_city => null, p_region => null, p_country => null, p_pages => '[]'), 'the old call still works';
  assert (select count(*) = 3 from public.usage_visits where network is not null), 'two connections, three visits';
end $$;

-- Nobody named: everything is Marbella (and the two without a place are '').
select pg_temp.act_as('maria@test');
do $$
declare r jsonb := public.usage_report_by_location(now() - interval '1 day', now() + interval '1 minute');
begin
  assert (select (x->>'visits')::int = 2 from jsonb_array_elements(r->'people') x
           where x->>'profile_id' = pg_temp.person('julio@test')::text and x->>'location' = 'Marbella'), 'Julio: two visits in Marbella';
  assert (select (x->>'visits')::int = 2 and (x->>'people')::int = 2 and x->>'name' is null and x->>'city' = 'Marbella'
            from jsonb_array_elements(r->'networks') x where x->>'network' = 'aaaaaaaaaaaaaaaa'), 'the shop''s connection, to name';
  assert jsonb_array_length(r->'networks') = 2, 'two connections';
  assert (r->>'total_visits')::int = 5, 'every visit';
end $$;

-- The owner names the shop's connection: its visits are the shop's, the phone's stay Marbella.
insert into public.usage_locations (network, name) values ('aaaaaaaaaaaaaaaa', 'San Pedro café');
do $$
declare r jsonb := public.usage_report_by_location(now() - interval '1 day', now() + interval '1 minute');
begin
  assert (select (x->>'seconds')::int = 100 from jsonb_array_elements(r->'pages') x
           where x->>'profile_id' = pg_temp.person('julio@test')::text and x->>'location' = 'San Pedro café' and x->>'page' = 'rules'),
    'Julio read the rules at the shop';
  assert (select (x->>'visits')::int = 1 from jsonb_array_elements(r->'people') x
           where x->>'profile_id' = pg_temp.person('julio@test')::text and x->>'location' = 'Marbella'), 'and used his phone in Marbella';
  assert (select count(*) = 2 from jsonb_array_elements(r->'visits') x where x->>'location' = 'San Pedro café'), 'two visits at the shop';
  assert (select x->>'name' = 'San Pedro café' from jsonb_array_elements(r->'networks') x where x->>'network' = 'aaaaaaaaaaaaaaaa'), 'named';
end $$;
update public.usage_locations set name = 'San Pedro shop' where network = 'aaaaaaaaaaaaaaaa';
select pg_temp.expect_error($q$insert into public.usage_locations (network, name) values ('aaaaaaaaaaaaaaaa', 'Again')$q$, 'usage_locations_network');
select pg_temp.expect_error($q$insert into public.usage_locations (network, name) values ('not one', 'Shop')$q$, 'usage_locations_network_check');
select pg_temp.expect_error($q$insert into public.usage_locations (network, name) values ('cccccccccccccccc', '  ')$q$, 'usage_locations_name_check');

-- Only owners name them, or see the names.
select pg_temp.act_as('julio@test');
select pg_temp.expect_error($q$insert into public.usage_locations (network, name) values ('bbbbbbbbbbbbbbbb', 'My phone')$q$, 'row-level security');
do $$ begin
  assert not exists (select 1 from public.usage_locations), 'an employee sees none';
  update public.usage_locations set name = 'Mine';
  delete from public.usage_locations;
end $$;
select pg_temp.act_as('nopay-admin@test');
do $$ begin
  assert not exists (select 1 from public.usage_locations), 'nor an admin without pay';
  assert jsonb_array_length(public.usage_report_by_location(now() - interval '1 day', now() + interval '1 minute')->'networks') = 0, 'nor the report';
end $$;
select pg_temp.act_as('maria@test');
do $$ begin
  assert (select name = 'San Pedro shop' from public.usage_locations where network = 'aaaaaaaaaaaaaaaa'), 'the owner''s name stands';
end $$;

-- Business 2 names the same id its own way, and sees nothing of business 1's.
select pg_temp.act_as('lola@dos');
insert into public.usage_locations (network, name) values ('aaaaaaaaaaaaaaaa', 'Bar Dos');
do $$ begin
  assert (select count(*) = 1 from public.usage_locations), 'only its own';
  assert (public.usage_report_by_location(now() - interval '1 day', now() + interval '1 minute')->>'total_visits')::int = 0, 'none of business 1''s visits';
end $$;

reset role;
rollback;
