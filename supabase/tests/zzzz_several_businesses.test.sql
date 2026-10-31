-- Several businesses (the several_businesses migration): each business's people see and change only
-- its own rows, whatever else the policies allow; functions work within the caller's business; the
-- Worker names the business it acts for. Runs last: from here on there are two businesses.

create function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_err text;
begin
  begin execute p_sql; exception when others then v_err := sqlerrm; end;
  if v_err is null then raise exception 'Expected error like "%" but statement succeeded: %', p_like, p_sql; end if;
  if v_err not ilike '%' || p_like || '%' then raise exception 'Expected error like "%", got "%"', p_like, v_err; end if;
end $$;

-- Signed in as someone, the way the API does it (their id and the authenticated role).
create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.headers', '', false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

-- The Worker: the service role, naming a business (or none).
create function pg_temp.as_worker(p_business int) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', 'service_role', false);
  perform set_config('request.headers', coalesce(json_build_object('x-business-id', p_business::text)::text, ''), false);
  set role service_role;
end $$;

create function pg_temp.as_editor() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', '', false);
  perform set_config('request.headers', '', false);
end $$;

select pg_temp.as_editor();

-- 0. Every table is kept to its business, and every function that skips the caller's rights runs
--    within the business ---------------------------------------------------------------------
do $$
declare v text;
begin
  select string_agg(c.relname, ', ') into v from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname not in ('plan_limits', 'pay_per_use')
     and not (c.relrowsecurity and exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname = 'business_scope' and not p.polpermissive));
  assert v is null, 'Tables not kept to their business. After creating a table: select public.add_business_scope(''public.<table>''); — ' || v;

  select string_agg(p.oid::regprocedure::text, ', ') into v from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef and p.proowner <> 'app_definer'::regrole
     and p.proname not in ('current_business_id', 'my_role', 'is_admin', 'is_staff', 'can_see_pay', 'is_partner',
                           'partner_can', 'tip_pool_out', 'handle_new_user', 'each_business', 'create_business', 'business_set_up');
  assert v is null, 'Security definer functions that would see every business. After creating one: alter function ... owner to app_definer; — ' || v;

  -- Unique within a business: a unique index takes in business_id, or a column that's unique by itself
  -- (a uuid, a generated id) or a secret token.
  select string_agg(i.indexrelid::regclass::text, ', ') into v
    from pg_index i join pg_class c on c.oid = i.indrelid
   where c.relnamespace = 'public'::regnamespace and i.indisunique
     and c.relname not in ('plan_limits', 'pay_per_use', 'business', 'profiles')
     and i.indexrelid::regclass::text not in ('api_keys_key_hash_key', 'calendar_feeds_token_hash_key', 'screens_token_key', 'cameras_ftp_user_key', 'rep_links_token_key')
     and not exists (
       select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attnum = any(i.indkey::int2[])
          and (a.attname = 'business_id' or a.atttypid = 'uuid'::regtype or a.attidentity <> ''
               or exists (select 1 from pg_attrdef d where d.adrelid = c.oid and d.adnum = a.attnum
                           and pg_get_expr(d.adbin, d.adrelid) ~ '^(nextval|gen_random_uuid)')));
  assert v is null, 'Unique across every business (add business_id first): ' || v;
end $$;

-- 1. A second business, with its people -----------------------------------------------------
-- (Its rows go in as the SQL editor would: naming the business for the transaction.)
begin;
select set_config('app.business_id', '2', true);
insert into public.business (name, timezone, opening_hours) values ('Bar Dos', 'Atlantic/Canary', '{}');
insert into public.settings default values;
insert into public.business_admin_notes default values;
insert into public.billing default values;
insert into public.positions (name) values ('Barista');
commit;

do $$ begin
  assert (select id from public.business where name = 'Bar Dos') = 2, 'the second business is number 2';
  assert (select count(*) from public.positions where name = 'Barista') = 2, 'a position''s name is unique within a business only';
end $$;

-- Invited to Bar Dos by its first admin, an employee, and two who signed up on their own: one
-- claiming to be an admin of the first business.
insert into auth.users (email, raw_user_meta_data, invited_at) values
  ('lola@dos', '{"full_name":"Lola","role":"admin","business_id":"2"}', now()),
  ('pepe@dos', '{"full_name":"Pepe","role":"employee","business_id":"2"}', now());
insert into auth.users (email, raw_user_meta_data) values
  ('nadie@test.es', '{"full_name":"Nadie"}'),
  ('colado@test.es', '{"full_name":"Colado","role":"admin","business_id":"1"}');

do $$ begin
  assert (select business_id = 2 and role = 'admin' and can_see_pay and active from public.profiles where email = 'lola@dos'),
    'the first person in a business with no admin is its admin';
  assert (select business_id = 2 and role = 'employee' and active from public.profiles where email = 'pepe@dos'), 'invited into Bar Dos';
  assert (select business_id is null and role = 'employee' and not active from public.profiles where email = 'nadie@test.es'),
    'with several businesses, someone nobody invited is in none';
  assert (select business_id is null and role = 'employee' and not active from public.profiles where email = 'colado@test.es'),
    'the business in a sign-up''s own details counts for nothing';
end $$;

-- Free plan: 3 people. Bar Dos counts its own (the first business has more than that already).
insert into auth.users (email, raw_user_meta_data, invited_at) values ('tres@dos', '{"role":"employee","business_id":"2"}', now());
select pg_temp.expect_error($q$insert into auth.users (email, raw_user_meta_data, invited_at) values ('cuatro@dos', '{"role":"employee","business_id":"2"}', now())$q$,
  'team is full');

begin;
select set_config('app.business_id', '2', true);
insert into public.shifts (profile_id, position_id, starts_at, ends_at)
select p.id, (select id from public.positions where name = 'Barista' and business_id = 2), now() + interval '1 day', now() + interval '1 day 4 hours'
  from public.profiles p where p.email = 'pepe@dos';
commit;

-- 2. Each business's people see only their own --------------------------------------------
select pg_temp.act_as('lola@dos');
do $$ begin
  assert (select count(*) from public.business) = 1 and (select name from public.business) = 'Bar Dos', 'Lola sees her business only';
  assert (select business_id from public.settings where id = 1) = 2, '"where id = 1" on a settings table is her business''s';
  assert (select count(*) from public.profiles) = 3, 'Lola sees her team only: ' || (select string_agg(email, ', ') from public.profiles);
  assert (select count(*) from public.shifts) = 1, 'and their rota only';
  assert (select count(*) from public.positions) = 1, 'and their positions only';
  assert not exists (select 1 from public.audit_log where business_id <> 2), 'and their own change log';
  assert public.current_business_id() = 2, 'her business';
  assert public.business_tz() = 'Atlantic/Canary', 'functions use her business''s time zone';
  assert public.current_plan() = 'free', 'and her business''s plan';
end $$;
-- Nothing written into another business, and nobody moves themselves into one.
select pg_temp.expect_error($q$insert into public.positions (name, business_id) values ('Spy', 1)$q$, 'row-level security');
select pg_temp.expect_error($q$update public.profiles set business_id = 1 where id = auth.uid()$q$, 'permission denied');
do $$
declare n int;
begin
  update public.shifts set note = 'mine now' where business_id = 1;
  get diagnostics n = row_count;
  assert n = 0, 'another business''s rota can''t be changed';
end $$;
-- The last admin of Bar Dos can't step down, whoever else is an admin elsewhere.
select pg_temp.expect_error($q$update public.profiles set role = 'employee' where email = 'lola@dos'$q$, 'At least one admin must remain');
-- A header naming another business counts only from the Worker.
select set_config('request.headers', '{"x-business-id": "1"}', false);
do $$ begin assert public.current_business_id() = 2, 'a person''s header doesn''t change their business'; end $$;

select pg_temp.act_as('aron@test');
do $$ begin
  assert (select name from public.business) = 'Test Café' and (select count(*) from public.business) = 1, 'Aron sees his business only';
  assert not exists (select 1 from public.profiles where email like '%@dos'), 'and none of Bar Dos''s people';
  assert not exists (select 1 from public.shifts where business_id = 2), 'or its rota';
  assert public.business_tz() = 'Europe/Madrid', 'his business''s time zone';
end $$;

-- Someone in no business has their own profile, and nothing else.
select pg_temp.act_as('nadie@test.es');
do $$ begin
  assert public.current_business_id() is null, 'in no business';
  assert (select count(*) from public.profiles) = 1, 'only their own profile';
  assert (select count(*) from public.business) = 0 and (select count(*) from public.settings) = 0
     and (select count(*) from public.positions) = 0, 'no business''s details';
end $$;

-- 3. The Worker acts for the business it names ----------------------------------------------
select pg_temp.as_worker(2);
do $$
declare v bigint;
begin
  assert public.current_business_id() = 2, 'the business in the header';
  assert public.business_tz() = 'Atlantic/Canary', 'functions it calls work within that business';
  insert into public.outbox (kind, payload, dedupe_key) values ('email', '{}', 'same-key') returning id into v;
  assert (select business_id from public.outbox where id = v) = 2, 'what the Worker writes is that business''s';
end $$;
select pg_temp.as_worker(1);
do $$
declare v bigint;
begin
  assert public.business_tz() = 'Europe/Madrid', 'and the other business''s, when it names that one';
  insert into public.outbox (kind, payload, dedupe_key) values ('email', '{}', 'same-key')
    on conflict (business_id, dedupe_key) do nothing returning id into v;
  assert v is not null and (select business_id from public.outbox where id = v) = 1, 'the same job for another business isn''t a duplicate';
end $$;
-- With several businesses, the Worker has to say which.
select pg_temp.as_worker(null);
do $$ begin assert public.current_business_id() is null, 'no header, several businesses: none'; end $$;
select pg_temp.expect_error($q$select public.grant_complimentary('friends_family')$q$, 'Say which business');

-- 4. The minute and nightly jobs run for each business --------------------------------------
select pg_temp.as_editor();
begin;
select set_config('app.business_id', '2', true);
insert into public.time_entries (profile_id, clock_in, source)
select id, now() - interval '2 days', 'phone' from public.profiles where email = 'pepe@dos';
select set_config('app.business_id', '1', true);
insert into public.time_entries (profile_id, clock_in, source)
select id, now() - interval '2 days', 'phone' from public.profiles where email = 'maria@test'
  and not exists (select 1 from public.time_entries t where t.profile_id = profiles.id and t.clock_out is null);
commit;
select pg_temp.as_worker(null);
do $$ begin
  assert public.each_business('auto_close_entries') = 0, 'no business''s job failed';
end $$;
select pg_temp.as_editor();
do $$ begin
  assert not exists (select 1 from public.time_entries where clock_out is null and clock_in < now() - interval '1 day'),
    'forgotten clock-outs closed in both businesses';
end $$;
select pg_temp.expect_error($q$select public.each_business('drop_everything')$q$, 'Not a job');
