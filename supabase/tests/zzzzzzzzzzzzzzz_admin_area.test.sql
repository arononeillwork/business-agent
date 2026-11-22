-- The admin area (the admin_area migration): HQ's, opened with its PIN through the Worker only. A right
-- PIN gives a session; wrong ones are kept and counted (5 from one connection, 25 from anywhere, in 15
-- minutes); a new PIN locks out everyone else. The sales team's lanes and the businesses on them are
-- HQ's own rows, an Instagram link tidied to the name, each business on the board once.
-- HQ was made by an earlier test (start_hq()), as on a brand-new database.

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

-- 1. HQ's to start: the PIN, Maria Cortes and Julio Cesar, two businesses each ---------------------
select pg_temp.as_editor();
select set_config('test.hq', (select id::text from public.business where is_hq), false);
select public.start_admin_area();
select public.start_admin_area();
do $$
declare v_hq int := current_setting('test.hq')::int;
begin
  assert (select count(*) from public.admin_area where business_id = v_hq) = 1, 'one PIN';
  assert (select count(*) from public.admin_area) = 1, 'and only HQ has one';
  assert (select string_agg(name, ', ' order by position) from public.sales_team where business_id = v_hq) = 'Maria Cortes, Julio Cesar',
    'the sales team, made once';
  assert (select string_agg(p.instagram, ', ' order by p.instagram) from public.sales_prospects p join public.sales_team m on m.id = p.member_id
           where m.name = 'Maria Cortes') = 'santaroaster, the_bootes_cafe', 'Maria''s two';
  assert (select string_agg(p.instagram, ', ' order by p.instagram) from public.sales_prospects p join public.sales_team m on m.id = p.member_id
           where m.name = 'Julio Cesar') = 'kekimarbella, roasted.spain', 'Julio''s two';
  assert (select count(*) from public.sales_prospects where business_id = v_hq and stage = 'to_contact') = 4, 'all still to contact';
end $$;

-- 2. The PIN, through the Worker ---------------------------------------------------------------
select pg_temp.as_worker(current_setting('test.hq')::int);
do $$
declare v jsonb; v_token text;
begin
  v := public.admin_area_unlock('1111111', 'conn-a');
  assert v = '{"error": "wrong"}'::jsonb, 'a wrong PIN: ' || v;
  v := public.admin_area_unlock('12a4', 'conn-a');
  assert v ->> 'error' = 'wrong', 'not digits';
  v := public.admin_area_unlock(null, 'conn-a');
  assert v ->> 'error' = 'wrong', 'nothing';
  assert (select count(*) from public.admin_pin_tries where not ok and ip_hash = 'conn-a') = 3, 'each wrong try is kept (nothing raised)';

  v := public.admin_area_unlock('1234568', 'conn-a');
  v_token := v ->> 'token';
  assert v_token ~ '^[0-9a-f]{64}$', 'the right PIN: a token';
  assert (v ->> 'expires_at')::timestamptz between now() + interval '11 hours 59 minutes' and now() + interval '12 hours 1 minute', 'for 12 hours';
  assert public.admin_area_session(v_token), 'the session is good';
  assert not public.admin_area_session(repeat('0', 64)), 'another token isn''t';
  assert not public.admin_area_session('nonsense') and not public.admin_area_session(null), 'nor nonsense';
  assert not exists (select 1 from public.admin_sessions where token_hash = v_token), 'only its hash is kept';
  perform set_config('test.token', v_token, false);
end $$;

-- 5 wrong from one connection: it waits, even with the right PIN; another connection doesn't.
do $$
declare v jsonb;
begin
  perform public.admin_area_unlock('1111111', 'conn-a');
  perform public.admin_area_unlock('2222222', 'conn-a');
  v := public.admin_area_unlock('1234568', 'conn-a');
  assert v ->> 'error' = 'too_many', '5 wrong from one connection: ' || v;
  v := public.admin_area_unlock('1234568', 'conn-b');
  assert v ? 'token', 'another connection still opens it';
  perform public.admin_area_lock(v ->> 'token');
  assert not public.admin_area_session(v ->> 'token'), 'locked again';
  assert public.admin_area_session(current_setting('test.token')), 'the other session stays';
end $$;

-- 25 wrong from anywhere in 15 minutes: nobody, for now; older ones don't count.
select pg_temp.as_editor();
select set_config('app.business_id', current_setting('test.hq'), false);
insert into public.admin_pin_tries (ip_hash, ok, at) select 'old-' || n, false, now() - interval '20 minutes' from generate_series(1, 40) n;
select pg_temp.as_worker(current_setting('test.hq')::int);
do $$ begin
  assert public.admin_area_unlock('1234568', 'conn-c') ? 'token', 'wrong tries over 15 minutes ago don''t count';
end $$;
select pg_temp.as_editor();
select set_config('app.business_id', current_setting('test.hq'), false);
insert into public.admin_pin_tries (ip_hash, ok) select 'many-' || n, false from generate_series(1, 25) n;
select pg_temp.as_worker(current_setting('test.hq')::int);
do $$ begin
  assert public.admin_area_unlock('1234568', 'conn-d') ->> 'error' = 'too_many', '25 wrong from anywhere: it waits';
end $$;
select pg_temp.as_editor();
select set_config('app.business_id', current_setting('test.hq'), false);
delete from public.admin_pin_tries where ip_hash like 'many-%' or ip_hash like 'conn-%';
select set_config('app.business_id', '', false);

-- 3. A new PIN locks out everyone else ----------------------------------------------------------
select pg_temp.as_worker(current_setting('test.hq')::int);
do $$
declare v jsonb; v_other text; v_mine text := current_setting('test.token');
begin
  v_other := public.admin_area_unlock('1234568', 'conn-e') ->> 'token';
  assert public.admin_area_change_pin(repeat('0', 64), '1234568', '9876', 'conn-e') ->> 'error' = 'locked', 'only from inside';
  assert public.admin_area_change_pin(v_mine, '0000000', '9876', 'conn-e') ->> 'error' = 'wrong', 'the PIN in use, typed again';
  assert public.admin_area_change_pin(v_mine, '1234568', '98', 'conn-e') ->> 'error' = 'bad_pin', '4 to 12 digits';
  assert public.admin_area_change_pin(v_mine, '1234568', '98x6', 'conn-e') ->> 'error' = 'bad_pin', 'digits only';
  assert public.admin_area_change_pin(v_mine, '1234568', '9876', 'conn-e') = '{"ok": true}'::jsonb, 'changed';
  assert public.admin_area_session(v_mine), 'whoever changed it stays in';
  assert not public.admin_area_session(v_other), 'everyone else is locked out';
  assert public.admin_area_unlock('1234568', 'conn-f') ->> 'error' = 'wrong', 'the old PIN doesn''t open it';
  v := public.admin_area_unlock('9876', 'conn-f');
  assert v ? 'token', 'the new one does';
  -- Back as it was for the tests after this.
  assert public.admin_area_change_pin(v ->> 'token', '9876', '1234568', 'conn-f') ->> 'ok' = 'true', 'and back';
end $$;

-- 4. HQ's alone ---------------------------------------------------------------------------------
-- The Worker for another business: no PIN there, nor HQ's sessions. (Its table reads skip row security;
-- businessDb keeps them to the business it names.)
select pg_temp.as_worker(1);
do $$ begin
  assert public.admin_area_unlock('1234568', 'conn-g') ->> 'error' = 'not_set_up', 'another business has no admin area';
  assert not public.admin_area_session(current_setting('test.token')), 'nor HQ''s sessions';
end $$;

-- Signed in (even as an admin) or not, nobody reaches it but the Worker.
select pg_temp.act_as('maria@test');
select pg_temp.expect_error($q$select public.admin_area_unlock('1234568', 'x')$q$, 'permission denied');
select pg_temp.expect_error($q$select public.admin_area_session(current_setting('test.token'))$q$, 'permission denied');
select pg_temp.expect_error($q$select public.admin_area_change_pin(current_setting('test.token'), '1234568', '1111', 'x')$q$, 'permission denied');
select pg_temp.expect_error($q$select count(*) from public.sales_prospects$q$, 'permission denied');
select pg_temp.expect_error($q$select count(*) from public.admin_area$q$, 'permission denied');
select pg_temp.expect_error($q$insert into public.sales_team (name) values ('Colado')$q$, 'permission denied');
reset role;
set role anon;
select pg_temp.expect_error($q$select public.admin_area_unlock('1234568', 'x')$q$, 'permission denied');
select pg_temp.expect_error($q$select count(*) from public.admin_sessions$q$, 'permission denied');

-- 5. The board's rows, as the Worker writes them ------------------------------------------------
select pg_temp.as_worker(current_setting('test.hq')::int);
do $$
declare v_maria uuid := (select id from public.sales_team where name = 'Maria Cortes'); v uuid;
begin
  insert into public.sales_prospects (member_id, name, instagram, phone, email)
  values (v_maria, '  Café Nuevo ', ' https://www.instagram.com/Cafe.Nuevo_/?hl=en ', ' +34 600 111 222 ', ' Hola@CafeNuevo.ES ')
  returning id into v;
  assert (select name = 'Café Nuevo' and instagram = 'cafe.nuevo_' and phone = '+34 600 111 222' and email = 'hola@cafenuevo.es'
            and business_id = current_setting('test.hq')::int from public.sales_prospects where id = v), 'tidied, and HQ''s';
  update public.sales_prospects set stage = 'demo', instagram = '@cafe.nuevo_', notes = ' ' where id = v;
  assert (select stage = 'demo' and instagram = 'cafe.nuevo_' and notes is null and updated_at >= created_at from public.sales_prospects where id = v),
    'moved along';
  perform set_config('test.nuevo', v::text, false);
end $$;
-- Each business once; and what isn't an Instagram name, an email or a website is refused.
select pg_temp.expect_error($q$insert into public.sales_prospects (name, instagram) values ('Again', 'instagram.com/cafe.nuevo_')$q$, 'sales_prospects_instagram_key');
select pg_temp.expect_error($q$insert into public.sales_prospects (name, instagram) values ('X', 'not a handle!')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.sales_prospects (name, email) values ('X', 'nope')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.sales_prospects (name, website) values ('X', 'cafe.es')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.sales_prospects (name, stage) values ('X', 'maybe')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.sales_prospects (name) values ('  ')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.sales_team (name) values ('maria cortes ')$q$, 'sales_team_name_key');

-- Someone leaves the team: their businesses stay, in no one's lane.
do $$
declare v_new uuid;
begin
  insert into public.sales_team (name, position) values ('Lola', 3) returning id into v_new;
  update public.sales_prospects set member_id = v_new where id = current_setting('test.nuevo')::uuid;
  delete from public.sales_team where id = v_new;
  assert (select member_id is null from public.sales_prospects where id = current_setting('test.nuevo')::uuid), 'in no one''s lane';
  delete from public.sales_prospects where id = current_setting('test.nuevo')::uuid;
end $$;

-- Tidy up: no sessions or tries left for the tests after this.
select pg_temp.as_editor();
select set_config('app.business_id', current_setting('test.hq'), false);
delete from public.admin_sessions;
delete from public.admin_pin_tries;
select set_config('app.business_id', '', false);
