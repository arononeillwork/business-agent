-- Closing an account and taking everything out (the close_account migration). An owner asks through the
-- Worker; it closes 30 days later and an owner can keep it until then; HQ's admins hear about both and see
-- it on their list; nobody changes it by editing the business. The export holds the business's own rows
-- only, without secrets. Runs after the HQ tests: HQ exists, run by hq.owner@test.

create function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_err text;
begin
  begin execute p_sql; exception when others then v_err := sqlerrm; end;
  if v_err is null then raise exception 'Expected error like "%" but statement succeeded: %', p_like, p_sql; end if;
  if v_err not ilike '%' || p_like || '%' then raise exception 'Expected error like "%", got "%"', p_like, v_err; end if;
end $$;

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.headers', '', false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

-- The Worker, for one business.
create function pg_temp.as_worker(p_business int) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', 'service_role', false);
  perform set_config('request.headers', json_build_object('x-business-id', p_business::text)::text, false);
  set role service_role;
end $$;

create function pg_temp.as_editor() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', '', false);
  perform set_config('request.headers', '', false);
end $$;

create function pg_temp.person(p_email text) returns uuid language sql as $$ select id from auth.users where email = p_email $$;

select pg_temp.as_editor();
select set_config('test.lola', pg_temp.person('lola@dos')::text, false),
       set_config('test.pepe', pg_temp.person('pepe@dos')::text, false),
       set_config('test.maria', pg_temp.person('maria@test')::text, false),
       set_config('test.hq_owner', pg_temp.person('hq.owner@test')::text, false),
       set_config('test.hq', (select id::text from public.business where is_hq), false);

-- 1. Asking to close ------------------------------------------------------------------------------
-- Not from the app straight to the database: through the Worker, which also stops the subscription.
do $$ begin
  assert not has_function_privilege('authenticated', 'public.request_account_closure(uuid)', 'execute'), 'only the Worker';
  assert not has_function_privilege('authenticated', 'public.keep_account(uuid)', 'execute'), 'only the Worker';
  assert not has_function_privilege('authenticated', 'public.export_part(int, int, int)', 'execute'), 'only the Worker';
  assert not has_function_privilege('authenticated', 'public.notify_hq(text, text, text)', 'execute'), 'nobody from the app';
end $$;

-- Only an owner of the business the Worker acts for: not its employee, not another business's owner.
select pg_temp.as_worker(2);
select pg_temp.expect_error(format('select public.request_account_closure(%L)', current_setting('test.pepe')), 'Only an owner');
select pg_temp.expect_error(format('select public.request_account_closure(%L)', current_setting('test.maria')), 'Only an owner');
select pg_temp.expect_error(format('select public.keep_account(%L)', current_setting('test.pepe')), 'Only an owner');

select set_config('test.closes', public.request_account_closure(current_setting('test.lola')::uuid)::text, false);
do $$ begin
  assert current_setting('test.closes')::timestamptz between now() + interval '30 days' - interval '1 minute' and now() + interval '30 days',
    'it closes in 30 days';
  assert public.request_account_closure(current_setting('test.lola')::uuid) = current_setting('test.closes')::timestamptz, 'asking again changes nothing';
end $$;

select pg_temp.as_editor();
do $$ begin
  assert (select closing_requested_at > now() - interval '1 minute' and closing_requested_by = current_setting('test.lola')::uuid
            from public.business where id = 2), 'when, and who asked';
  assert (select closing_requested_at is null from public.business where id = 1), 'no other business';
  assert (select count(*) from public.notifications where profile_id = current_setting('test.hq_owner')::uuid and title = 'Bar Dos asked to close its account'
            and body like 'Bar Dos (#2), asked by Lola. It closes on %' and link = '/hq/businesses'
            and business_id = current_setting('test.hq')::int) = 1, 'The Business Agent''s admins hear about it, once';
  assert (select count(*) from public.notifications where title like 'Bar Dos asked%' and business_id <> current_setting('test.hq')::int) = 0,
    'and nobody else';
end $$;

-- HQ can't be closed from the app.
select pg_temp.as_worker(current_setting('test.hq')::int);
select pg_temp.expect_error(format('select public.request_account_closure(%L)', current_setting('test.hq_owner')), 'HQ can''t be closed');

-- Editing the business from the app doesn't change it (an owner keeps it through the Worker).
select pg_temp.act_as('lola@dos');
update public.business set closing_requested_at = null, closing_requested_by = null, name = 'Bar Dos';
do $$ begin
  assert (select closing_requested_at is not null from public.business), 'still closing';
end $$;
select pg_temp.act_as('maria@test');
update public.business set closing_requested_at = now(), closing_requested_by = auth.uid();
select pg_temp.as_editor();
do $$ begin
  assert (select closing_requested_at is null from public.business where id = 1), 'nor asks for it';
end $$;

-- 2. HQ's list ------------------------------------------------------------------------------------
select pg_temp.act_as('hq.owner@test');
do $$ begin
  assert (select count(*) from public.hq_closures()) = 1, 'one business closing';
  assert (select closes_at = closing_requested_at + interval '30 days' and requested_by = 'Lola' from public.hq_closures() where id = 2),
    'Bar Dos, asked by Lola, and when it closes';
end $$;
select pg_temp.act_as('lola@dos');
do $$ begin assert (select count(*) from public.hq_closures()) = 0, 'nobody else sees the list'; end $$;

-- 3. Keeping it -----------------------------------------------------------------------------------
select pg_temp.as_worker(2);
select public.keep_account(current_setting('test.lola')::uuid);
select public.keep_account(current_setting('test.lola')::uuid);
select pg_temp.as_editor();
do $$ begin
  assert (select closing_requested_at is null and closing_requested_by is null from public.business where id = 2), 'kept';
  assert (select count(*) from public.notifications where profile_id = current_setting('test.hq_owner')::uuid and title = 'Bar Dos is staying') = 1,
    'HQ hears it''s staying, once';
end $$;

-- Once the 30 days are up it has closed: no keeping it from the app.
select pg_temp.as_worker(2);
select public.request_account_closure(current_setting('test.lola')::uuid);
select pg_temp.as_editor();
update public.business set closing_requested_at = now() - interval '31 days' where id = 2;
select pg_temp.as_worker(2);
select pg_temp.expect_error(format('select public.keep_account(%L)', current_setting('test.lola')), 'The account has closed');
select pg_temp.as_editor();
update public.business set closing_requested_at = null, closing_requested_by = null where id = 2;

-- 4. Everything out -------------------------------------------------------------------------------
-- Everything the business's export holds, table by table (all of it in one call here).
create function pg_temp.exported(p_table text) returns setof jsonb language sql as $$
  select jsonb_array_elements(rows) from public.export_part(1, 0, 10000) where name = p_table
$$;

select pg_temp.as_worker(2);
do $$
declare v jsonb;
begin
  assert (select array_agg(name order by name) from public.export_tables()) @> array['business', 'profiles', 'shifts', 'time_entries', 'audit_log', 'billing'],
    'the business, its team, rota, timecards, history and billing';
  assert not exists (select 1 from public.export_tables() where name in ('integration_secrets', 'music_accounts', 'push_subscriptions', 'square_pins',
                                                                          'provider_cache', 'outbox', 'kiosk_attempts', 'plan_limits', 'pay_per_use')),
    'no stored tokens or app plumbing, and not The Business Agent''s own plans';
  assert (select name from public.export_tables() limit 1) = 'business', 'the business first';
  assert (select columns[1:2] from public.export_tables() where name = 'time_entries') = array['id', 'profile_id'], 'columns in the table''s order';
  assert not exists (select 1 from public.export_tables() t, unnest(t.columns) c where c in ('ciphertext', 'key_hash', 'token_hash', 'token', 'pin_hash', 'ftp_password', 'ip_hash')),
    'no secret columns anywhere';

  v := (select jsonb_agg(r) from pg_temp.exported('business') r);
  assert jsonb_array_length(v) = 1 and v -> 0 ->> 'name' = 'Bar Dos' and v -> 0 ? 'closing_requested_at', 'its own business row';
  assert (select count(*) from pg_temp.exported('profiles')) = 3, 'its three people, nobody else''s';
  assert not exists (select 1 from pg_temp.exported('profiles') r where r ? 'pin_hash' or (r ->> 'business_id')::int <> 2), 'no PIN hashes';
  assert not exists (select 1 from public.export_part(1, 0, 10000) p, jsonb_array_elements(p.rows) r where (r ->> 'business_id')::int <> 2),
    'nothing of another business''s anywhere';
  assert (select count(*) from public.export_part(1, 0, 10000) where name = 'integration_secrets') = 0, 'no stored tokens';
end $$;

-- A part at a time: up to so many rows a call, carrying on from where the last ended.
do $$
declare
  v_profiles int := (select ord::int from public.export_tables() with ordinality as e(name, columns, ord) where name = 'profiles');
  v_all int := (select sum(jsonb_array_length(rows)) from public.export_part(1, 0, 10000));
  v_from int := 1;
  v_offset int := 0;
  v_got int;
  v_seen int := 0;
  v_calls int := 0;
  p record;
begin
  assert (select n = v_profiles and first_row = 0 and jsonb_array_length(rows) = 2 from public.export_part(v_profiles, 0, 2)), 'two people';
  assert (select array_agg(name order by n) from public.export_part(v_profiles, 2, 2)) = array['profiles', (select name from public.export_part(v_profiles + 1, 0, 1))],
    'the third, then the next table';
  -- The Worker's loop, three rows a call: everything, once.
  loop
    v_got := 0;
    v_calls := v_calls + 1;
    for p in select * from public.export_part(v_from, v_offset, 3) loop
      v_got := v_got + jsonb_array_length(p.rows);
      v_from := p.n;
      v_offset := p.first_row + jsonb_array_length(p.rows);
    end loop;
    v_seen := v_seen + v_got;
    exit when v_got < 3;
  end loop;
  assert v_seen = v_all and v_all > 3, format('every row once (%s of %s in %s calls)', v_seen, v_all, v_calls);
end $$;

-- The first business: its screens' links, cameras' passwords and key hashes stay out, the audit log's copies too.
select pg_temp.as_worker(1);
do $$ begin
  assert (select count(*) from pg_temp.exported('screens')) > 0 and not exists (select 1 from pg_temp.exported('screens') r where r ? 'token'), 'screens without their links';
  assert not exists (select 1 from pg_temp.exported('cameras') r where r ? 'ftp_password'), 'cameras without their passwords';
  assert (select not ('key_hash' = any (columns)) and 'name' = any (columns) from public.export_tables() where name = 'api_keys'), 'access keys without their hashes';
  assert (select count(*) from pg_temp.exported('audit_log') r where r ->> 'table_name' = 'screens') > 0, 'the history of the screens';
  assert not exists (select 1 from pg_temp.exported('audit_log') r
                      where r -> 'new_values' ?| array['token', 'ftp_password', 'key_hash'] or r -> 'old_values' ?| array['token', 'ftp_password', 'key_hash']),
    'without the secrets it copied';
end $$;
select pg_temp.as_editor();
do $$ begin
  assert (select count(*) from public.audit_log where business_id = 1 and new_values ?| array['token', 'ftp_password', 'key_hash']) > 0,
    '(the log itself keeps them, for the business''s admins)';
end $$;
