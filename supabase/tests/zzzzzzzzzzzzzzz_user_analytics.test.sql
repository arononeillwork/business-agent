-- User analytics (the user_analytics migration): only the Worker records what the app reported, each person's
-- report on their own visit only, for someone active in the business it names; times add up page by page;
-- owners read it all through usage_report(), anyone else nothing, and no business sees another's. People from
-- the tests before it: maria (owner), nopay-admin (admin without pay), julio and aron (employees) in business 1;
-- lola (owner) and pepe in business 2. Nothing made here stays.

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

create function pg_temp.person(p_email text) returns uuid language sql as $$
  select id from public.profiles where email = p_email
$$;

reset role;
create temp table ids (name text primary key, id uuid);
insert into ids values ('julio phone', gen_random_uuid()), ('aron computer', gen_random_uuid()), ('pepe', gen_random_uuid());
grant select on ids to service_role, authenticated;

-- 1. The Worker keeps Julio's visit from his phone, then adds to it: Staff rules opened once and read for
-- two minutes, then a minute more; the Rota a moment. Seconds and views out of range are held to their limits.
select pg_temp.as_worker(1);
do $$
declare v uuid := (select id from ids where name = 'julio phone');
begin
  assert public.record_usage(pg_temp.person('julio@test'), v, 'phone', 'iOS', 'Safari', true, 'San Pedro de Alcántara', 'Andalusia', 'ES',
    '[{"page":"rules","views":1,"seconds":120},{"page":"rota","views":1,"seconds":5}]'), 'kept';
  assert public.record_usage(pg_temp.person('julio@test'), v, 'phone', 'iOS', 'Safari', true, 'Marbella', 'Andalusia', 'ES',
    '[{"page":"rules","views":0,"seconds":60},{"page":"Not a page!","views":1,"seconds":9},{"page":"today","views":0,"seconds":0},{"page":"rota","views":"x","seconds":99999}]'), 'added to';
  assert (select seconds = 120 + 5 + 60 + 3600 and device = 'phone' and os = 'iOS' and browser = 'Safari' and installed
            and city = 'San Pedro de Alcántara' and country = 'ES' and business_id = 1
            from public.usage_visits where id = v), 'one visit, its place the first one, its time its pages''';
  assert (select views = 1 and seconds = 180 from public.usage_pages where visit_id = v and page = 'rules'), 'staff rules: opened once, read 3 minutes';
  assert (select views = 1 and seconds = 3605 from public.usage_pages where visit_id = v and page = 'rota'), 'an hour at most a report';
  assert (select count(*) = 2 from public.usage_pages where visit_id = v), 'nothing for a page that isn''t one, or nothing at all';
end $$;

-- Aron's visit from a computer; a country Cloudflare couldn't tell isn't kept.
do $$ begin
  assert public.record_usage(pg_temp.person('aron@test'), (select id from ids where name = 'aron computer'), 'computer', 'macOS', 'Chrome', false,
    null, null, 'XX', '[{"page":"rules","views":2,"seconds":30}]'), 'kept';
  assert (select country is null from public.usage_visits where id = (select id from ids where name = 'aron computer')), 'no country';
end $$;

-- 2. Someone else's visit isn't added to; nobody outside the business, or switched off, is recorded.
do $$ begin
  assert not public.record_usage(pg_temp.person('maria@test'), (select id from ids where name = 'julio phone'), 'computer', null, null, false,
    null, null, null, '[{"page":"rules","views":1,"seconds":600}]'), 'not on Julio''s visit';
  assert (select seconds = 180 from public.usage_pages where visit_id = (select id from ids where name = 'julio phone') and page = 'rules'), 'his time as it was';
  assert not public.record_usage(pg_temp.person('lola@dos'), gen_random_uuid(), 'phone', null, null, false, null, null, null, '[]'), 'not someone in business 2';
end $$;
select pg_temp.expect_error($q$select public.record_usage(pg_temp.person('aron@test'), gen_random_uuid(), 'fridge')$q$, 'usage_visits_device_check');
reset role;
update public.profiles set active = false where email = 'julio@test';
select pg_temp.as_worker(1);
do $$ begin
  assert not public.record_usage(pg_temp.person('julio@test'), gen_random_uuid(), 'phone'), 'switched off: not recorded';
end $$;
reset role;
update public.profiles set active = true where email = 'julio@test';

-- Business 2's own, for Pepe.
select pg_temp.as_worker(2);
do $$ begin
  assert public.record_usage(pg_temp.person('pepe@dos'), (select id from ids where name = 'pepe'), 'tablet', 'Android', 'Chrome', false,
    'Dublin', 'Leinster', 'IE', '[{"page":"rota","views":1,"seconds":40}]'), 'kept for business 2';
end $$;

-- 3. Nobody signed in writes it, or calls record_usage(), the owner included.
select pg_temp.act_as('maria@test');
select pg_temp.expect_error($q$insert into public.usage_visits (id, profile_id, device) values (gen_random_uuid(), pg_temp.person('aron@test'), 'phone')$q$, 'permission denied');
select pg_temp.expect_error($q$update public.usage_pages set seconds = 0$q$, 'permission denied');
select pg_temp.expect_error($q$delete from public.usage_visits$q$, 'permission denied');
select pg_temp.expect_error($q$select public.record_usage(pg_temp.person('aron@test'), gen_random_uuid(), 'phone')$q$, 'permission denied');

-- 4. The owner reads business 1's: each person's time on each page, devices, places, visits with their pages.
do $$
declare r jsonb := public.usage_report(now() - interval '1 day', now() + interval '1 minute');
begin
  assert (r->>'total_visits')::int = 2, 'two visits';
  assert jsonb_array_length(r->'visits') = 2 and jsonb_array_length(r->'people') = 2, 'Julio''s and Aron''s';
  assert (select (x->>'seconds')::int = 180 and (x->>'views')::int = 1 from jsonb_array_elements(r->'pages') x
           where x->>'page' = 'rules' and x->>'profile_id' = pg_temp.person('julio@test')::text), 'how long Julio read the staff rules';
  assert (select (x->>'visits')::int = 1 and x->>'os' = 'iOS' and (x->>'installed')::boolean from jsonb_array_elements(r->'devices') x
           where x->>'profile_id' = pg_temp.person('julio@test')::text), 'his phone';
  assert (select count(*) = 1 from jsonb_array_elements(r->'places')), 'only places with a country';
  assert (select jsonb_array_length(x->'pages') = 2 from jsonb_array_elements(r->'visits') x where x->>'id' = (select id::text from ids where name = 'julio phone')),
    'a visit''s pages';
  assert (select x->>'full_name' = 'Julio' and x->>'role' = 'employee' from jsonb_array_elements(r->'names') x
           where x->>'profile_id' = pg_temp.person('julio@test')::text), 'whose they are';
  assert jsonb_array_length(r->'names') = 2, 'only the people in it';
  assert not exists (select 1 from jsonb_array_elements(r->'people') x where x->>'profile_id' = pg_temp.person('pepe@dos')::text), 'nothing of business 2';
  assert (public.usage_report(now() + interval '1 hour', now() + interval '2 hours')->>'total_visits')::int = 0, 'none started in a later hour';
end $$;

-- An admin without pay, and an employee, see none of it.
select pg_temp.act_as('nopay-admin@test');
do $$ begin
  assert (public.usage_report(now() - interval '1 day', now() + interval '1 minute')->>'total_visits')::int = 0, 'not an admin without pay';
  assert not exists (select 1 from public.usage_pages), 'nor the table';
end $$;
select pg_temp.act_as('julio@test');
do $$ begin
  assert not exists (select 1 from public.usage_visits), 'not the employee, even his own';
end $$;

-- Business 2's owner sees only Pepe's.
select pg_temp.act_as('lola@dos');
do $$
declare r jsonb := public.usage_report(now() - interval '1 day', now() + interval '1 minute');
begin
  assert (r->>'total_visits')::int = 1 and r->'visits'->0->>'profile_id' = pg_temp.person('pepe@dos')::text, 'only business 2''s';
end $$;

-- 5. A visit going takes its pages with it (the Worker clears visits older than a year).
select pg_temp.as_worker(1);
delete from public.usage_visits where id = (select id from ids where name = 'julio phone');
do $$ begin
  assert not exists (select 1 from public.usage_pages where visit_id = (select id from ids where name = 'julio phone')), 'its pages went too';
end $$;

reset role;
rollback;
