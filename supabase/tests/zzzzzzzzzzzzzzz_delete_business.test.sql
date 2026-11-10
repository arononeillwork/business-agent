-- Closing an account (docs/SEVERAL_BUSINESSES.md): once a business has closed, HQ deletes every row of it
-- but the working-hours record (step 1), and four years on its business row, which takes the rest
-- (step 2). The checks meant for someone deleting one row let a business go, and stay as they were for
-- everyone else (the delete_business migration). Last, every business the other tests made can go the
-- same way (and comes back).

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.headers', '', false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

-- HQ in the SQL editor: the database's owner, nobody signed in.
create function pg_temp.as_db_owner() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.headers', '', false);
  perform set_config('request.jwt.claim.role', '', false);
  perform set_config('request.jwt.claim.sub', '', false);
end $$;

create function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_err text;
begin
  begin execute p_sql; exception when others then v_err := sqlerrm; end;
  if v_err is null then raise exception 'Expected error like "%" but statement succeeded: %', p_like, p_sql; end if;
  if v_err not ilike '%' || p_like || '%' then raise exception 'Expected error like "%", got "%"', p_like, v_err; end if;
end $$;

-- The tables holding rows of a business.
create function pg_temp.tables_with(p_business int) returns text[] language plpgsql as $$
declare
  v_table regclass;
  v_found boolean;
  v_tables text[] := '{}';
begin
  for v_table in
    select c.oid::regclass from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
       and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'business_id' and not a.attisdropped)
     order by c.relname
  loop
    execute format('select exists (select 1 from %s where business_id = $1)', v_table) into v_found using p_business;
    if v_found then v_tables := v_tables || v_table::text; end if;
  end loop;
  return v_tables;
end $$;

-- What step 1 keeps: the working-hours record and the rows it points to.
create function pg_temp.hours_record(p_business int) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'time_entries', (select count(*) from public.time_entries where business_id = p_business),
    'breaks', (select count(*) from public.breaks where business_id = p_business),
    'time_entry_changes', (select count(*) from public.time_entry_changes where business_id = p_business),
    'correction_requests', (select count(*) from public.correction_requests where business_id = p_business),
    'profiles', (select count(*) from public.profiles where business_id = p_business),
    'positions', (select count(*) from public.positions where business_id = p_business),
    'break_types', (select count(*) from public.break_types where business_id = p_business));
$$;

-- Step 1: the body of the DO block docs/SEVERAL_BUSINESSES.md gives, kept the same.
create function pg_temp.step_1() returns void language plpgsql as $$
declare
  v_business int := nullif(current_setting('app.deleting_business', true), '')::int;
  -- The working-hours record, kept four years, and the rows it points to.
  v_keep text[] := array['time_entries', 'breaks', 'time_entry_changes', 'correction_requests', 'profiles', 'positions', 'break_types'];
  v_table regclass;
  v_rows bigint;
  v_gone bigint;
  v_stuck text[];
begin
  if v_business is null or v_business::text is distinct from current_setting('app.business_id', true) then
    raise exception 'Name the business in this transaction: app.business_id and app.deleting_business';
  end if;
  if not exists (select 1 from public.business where id = v_business and closing_requested_at <= now() - interval '30 days') then
    raise exception 'Business % hasn’t closed', v_business;
  end if;
  -- Every table with rows of it, round after round until one deletes nothing: a row that another one
  -- still points to goes in a later round, once that one has gone.
  loop
    v_gone := 0;
    v_stuck := '{}';
    for v_table in
      select c.oid::regclass from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname <> all (v_keep)
         and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'business_id' and not a.attisdropped)
       order by c.relname
    loop
      begin
        execute format('delete from %s where business_id = $1', v_table) using v_business;
        get diagnostics v_rows = row_count;
        v_gone := v_gone + v_rows;
      exception when foreign_key_violation then
        v_stuck := v_stuck || v_table::text;
      end;
    end loop;
    exit when v_gone = 0;
  end loop;
  if cardinality(v_stuck) > 0 then
    raise exception 'Nothing deleted: rows of % are still pointed to', array_to_string(v_stuck, ', ');
  end if;
  -- Its people switched off, so nobody signs in to it.
  update public.profiles set active = false where business_id = v_business;
end $$;

-- Step 2, as the docs give it (their temporary table goes at commit; this one at the end).
create function pg_temp.step_2(p_business int) returns void language plpgsql as $$
begin
  create temp table closing_people on commit drop as select id from public.profiles where business_id = p_business;
  delete from public.business where id = p_business;
  delete from auth.users where id in (table closing_people);
  drop table closing_people;
end $$;

-- A business's rows that each check, foreign key and trigger run by a delete has something to do with,
-- besides what create_business() gives it (itself on Competitors, its team, positions and break
-- types): as the database's owner, for the business.
create function pg_temp.fill(p_business int) returns void language plpgsql as $$
declare
  v_admin uuid := (select id from public.profiles where business_id = p_business and role = 'admin' limit 1);
  v_id uuid;
  v_event uuid;
  v_entry uuid;
begin
  perform set_config('app.business_id', p_business::text, true);
  -- A contractor with a job (kept with their jobs; a job's contractor isn't cascaded).
  insert into public.contractors (name) values ('Lucía Marín') returning id into v_id;
  insert into public.outsourced_jobs (service, contractor_id) values ('Social media management', v_id);
  -- A digital menu on a screen.
  insert into public.menu_designs (name, format, size) values ('TV menu', 'digital', 'screen_landscape') returning id into v_id;
  insert into public.screens (name, slides) values ('Counter TV', jsonb_build_array(
    jsonb_build_object('id', 'b', 'kind', 'menu', 'design_id', v_id, 'seconds', null, 'active', true)));
  -- A fridge with a check (checks are kept, and not cascaded).
  insert into public.food_safety_points (name, min_temp, max_temp) values ('Kitchen fridge', 0, 4) returning id into v_id;
  insert into public.food_safety_checks (point_id, reading) values (v_id, 3);
  -- Kitty money that's been spent.
  insert into public.kitty_entries (kind, amount) values ('top_up', 100);
  insert into public.kitty_goals (name, target, spent, bought_on) values ('Coffee machine', 100, 80, current_date);
  -- A post that has gone out, on a day in the calendar (the day going takes the post off it).
  insert into public.calendar_events (starts_on, title, category) values (current_date, 'Feria', 'business') returning id into v_event;
  insert into public.social_posts (caption, targets, status, published_at, event_id)
  values ('Feria week', '{instagram}', 'published', now(), v_event);
  -- A camera with a clip (clips aren't cascaded: the Worker deletes them from storage first).
  insert into public.cameras (name) values ('Counter camera') returning id into v_id;
  insert into public.camera_clips (camera_id, started_at, seconds, bytes, storage, file_id, file_name)
  values (v_id, now(), 30, 4000000, 'google_drive', 'clip-' || p_business, '10.00.00.mp4');
  -- What deleting rows sets off: a batch's offer goes with it; a price goes to Square; Google's hours
  -- are synced when the calendar changes.
  insert into public.fresh_batches (name, quantity, made_at, shelf_life_hours, discount_at, percent_off)
  values ('Banana bread', 12, now() - interval '1 hour', 24, now() + interval '17 hours', 30);
  update public.settings set menu_source = 'square' where business_id = p_business;
  insert into public.recipes (name, sell_price, square_id) values ('Flat white', 3.2, 'sq-fw-' || p_business) returning id into v_id;
  insert into public.recipe_variants (recipe_id, name, price_change) values (v_id, 'Oat milk', 0.4);
  update public.integrations set status = 'connected' where business_id = p_business and provider = 'google_business';
  insert into public.post_ideas (title, wants, created_by) values ('Latte art close-up', 'video', v_admin);
  -- A support ticket to The Business Agent (the support_tickets migration): it goes with the business.
  insert into public.support_tickets (business_id, user_id, kind, message) values (p_business, v_admin, 'question', 'How do I add a second café?');
  -- The working-hours record: a shift worked, its timecard with a break, a change made to it and a
  -- correction asked for.
  insert into public.shifts (profile_id, position_id, starts_at, ends_at)
  values (v_admin, (select min(id) from public.positions where business_id = p_business), now() - interval '9 hours', now() - interval '1 hour')
  returning id into v_id;
  insert into public.time_entries (profile_id, position_id, shift_id, clock_in, clock_out, source)
  values (v_admin, (select min(id) from public.positions where business_id = p_business), v_id, now() - interval '9 hours', now() - interval '1 hour', 'phone')
  returning id into v_entry;
  insert into public.breaks (time_entry_id, break_type_id, started_at, ended_at)
  values (v_entry, (select min(id) from public.break_types where business_id = p_business), now() - interval '5 hours', now() - interval '4 hours 45 minutes');
  insert into public.time_entry_changes (time_entry_id, reason, old_values, new_values) values (v_entry, 'Forgot to clock out', '{}', '{}');
  insert into public.correction_requests (time_entry_id, profile_id, note) values (v_entry, v_admin, 'I left at 17:00');
end $$;

-- What each check refuses someone deleting one row of a business (p_who: 'app', the Worker or the
-- database's 'owner'), as before. From the app a camera isn't deleted at all (the Worker deletes its
-- clips first) and a post that has gone out isn't changed; elsewhere a camera with clips is refused by
-- their foreign key. The Worker doesn't take money out of the kitty.
create function pg_temp.checks_refuse(p_business int, p_who text) returns void language plpgsql as $$
begin
  perform pg_temp.expect_error(format('delete from public.competitors where business_id = %s and is_self', p_business), 'The business itself can’t be removed from Competitors');
  perform pg_temp.expect_error(format('delete from public.contractors where business_id = %s', p_business), 'Lucía Marín has done jobs for the business: archive them instead');
  perform pg_temp.expect_error(format('delete from public.menu_designs where business_id = %s', p_business), 'TV menu is on the screen “Counter TV”. Take it off that screen first.');
  perform pg_temp.expect_error(format('delete from public.food_safety_points where business_id = %s', p_business), 'It has checks recorded, which are kept: switch it off instead');
  perform pg_temp.expect_error(format('delete from public.kitty_entries where business_id = %s', p_business),
    case when p_who = 'worker' then 'permission denied for function kitty_balance' else 'That money has been spent: the kitty has €20.00' end);
  if p_who = 'app' then
    perform pg_temp.expect_error(format('delete from public.cameras where business_id = %s', p_business), 'permission denied for table cameras');
    perform pg_temp.expect_error(format('update public.social_posts set caption = ''edited'' where business_id = %s', p_business), 'This post has already gone out. Make a new post instead.');
  else
    perform pg_temp.expect_error(format('delete from public.cameras where business_id = %s', p_business), 'violates foreign key constraint "camera_clips_camera_id_fkey"');
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------
-- A café that closes, with a bar it brought in; a café that stays open; one deleted all at once.
-- ---------------------------------------------------------------------------------------------------
reset role;
insert into auth.users (email, raw_user_meta_data) values
  ('closing-owner@test', '{"full_name":"Carmen"}'), ('closing-barista@test', '{"full_name":"Pablo"}'),
  ('referred-owner@test', '{"full_name":"Rafa"}'), ('open-owner@test', '{"full_name":"Olga"}'),
  ('at-once-owner@test', '{"full_name":"Gus"}');

select pg_temp.act_as('closing-owner@test');
select public.create_business('Closing Down Café', 'cafe', null, null, 'ES');
select pg_temp.act_as('open-owner@test');
select public.create_business('Still Open Café', 'cafe', null, null, 'ES');
select pg_temp.act_as('at-once-owner@test');
select public.create_business('All At Once Café', 'cafe', null, null, 'ES');

select pg_temp.as_db_owner();
select id as closing, referral_code as closing_code from public.business where name = 'Closing Down Café' \gset
select id as still_open from public.business where name = 'Still Open Café' \gset
select id as at_once from public.business where name = 'All At Once Café' \gset
select set_config('test.closing', :'closing', false), set_config('test.still_open', :'still_open', false), set_config('test.at_once', :'at_once', false);
select pg_temp.act_as('referred-owner@test');
select public.create_business('Referred Bar', 'pub', null, :'closing_code', 'ES');

select pg_temp.as_db_owner();
update public.profiles set business_id = :closing, role = 'employee', active = true
 where id = (select id from auth.users where email = 'closing-barista@test');
select public.grant_complimentary('founder', 'Closing an account test', id), pg_temp.fill(id)
  from public.business where id in (:closing, :still_open, :at_once);

do $$
declare v_id int := current_setting('test.closing')::int;
begin
  assert (select referred_by from public.business where name = 'Referred Bar') = v_id, 'the bar came through the café';
  assert exists (select 1 from public.competitors where business_id = v_id and is_self), 'the café is on its own Competitors';
  assert (select count(*) from public.profiles where business_id = v_id) = 2, 'a team of two';
  assert cardinality(pg_temp.tables_with(v_id)) >= 40, 'rows in many tables: ' || array_to_string(pg_temp.tables_with(v_id), ', ');
  assert exists (select 1 from public.audit_log where business_id = v_id), 'and a log';
end $$;

-- ---------------------------------------------------------------------------------------------------
-- 1. Step 1: only once it has closed, and only naming it twice; then all but the hours record
-- ---------------------------------------------------------------------------------------------------
begin;
select set_config('app.business_id', :'closing', true), set_config('app.deleting_business', :'closing', true);
select pg_temp.expect_error('select pg_temp.step_1()', 'hasn’t closed');
rollback;
update public.business set closing_requested_at = now() - interval '29 days' where id = :closing;
begin;
select set_config('app.business_id', :'closing', true), set_config('app.deleting_business', :'closing', true);
select pg_temp.expect_error('select pg_temp.step_1()', 'hasn’t closed');
rollback;

-- Closed: 30 days after the owner asked.
update public.business set closing_requested_at = now() - interval '31 days' where id = :closing;
begin;
select set_config('app.deleting_business', :'closing', true);
select pg_temp.expect_error('select pg_temp.step_1()', 'Name the business in this transaction');
rollback;
begin;
select set_config('app.business_id', :'still_open', true), set_config('app.deleting_business', :'closing', true);
select pg_temp.expect_error('select pg_temp.step_1()', 'Name the business in this transaction');
rollback;

create temp table closing_hours as select pg_temp.hours_record(:closing) as counts;
-- As the docs give it.
begin;
select set_config('app.business_id', :'closing', true), set_config('app.deleting_business', :'closing', true);
select pg_temp.step_1();
commit;

do $$
declare v_id int := current_setting('test.closing')::int;
begin
  assert pg_temp.tables_with(v_id) = array['break_types', 'breaks', 'correction_requests', 'positions', 'profiles', 'time_entries', 'time_entry_changes'],
    'only the hours record is left: ' || array_to_string(pg_temp.tables_with(v_id), ', ');
  assert pg_temp.hours_record(v_id) = (select counts from closing_hours), 'all of it: ' || pg_temp.hours_record(v_id)::text;
  assert (select shift_id is null and clock_out is not null from public.time_entries where business_id = v_id), 'the timecard, without its shift';
  assert not exists (select 1 from public.profiles where business_id = v_id and active), 'its people are switched off';
  assert not exists (select 1 from public.audit_log where business_id = v_id), 'its log went, and nothing more was logged';
  assert exists (select 1 from public.business where id = v_id), 'the business row stays';
  assert (select referred_by from public.business where name = 'Referred Bar') = v_id, 'the bar still says who brought it';
end $$;

-- Nobody else's rows went.
do $$
declare v_id int := current_setting('test.still_open')::int;
begin
  assert exists (select 1 from public.competitors where business_id = v_id and is_self), 'the open café is still on its Competitors';
  assert (select count(*) from public.outsourced_jobs where business_id = v_id) = 1, 'its contractor''s job';
  assert (select count(*) from public.kitty_entries where business_id = v_id) = 1, 'its kitty';
  assert (select count(*) from public.social_posts where business_id = v_id and event_id is not null) = 1, 'its post, on its day';
  assert (select count(*) from public.camera_clips where business_id = v_id) = 1, 'its clip';
  assert exists (select 1 from public.audit_log where business_id = v_id), 'its log';
  assert exists (select 1 from public.settings where business_id = (select id from public.business where name = 'Referred Bar')), 'the bar''s settings';
end $$;

-- ---------------------------------------------------------------------------------------------------
-- 2. Step 2, four years on: the business row, the rest with it, and its people's accounts
-- ---------------------------------------------------------------------------------------------------
begin;
select pg_temp.step_2(:closing);
commit;

do $$
declare v_id int := current_setting('test.closing')::int;
begin
  assert not exists (select 1 from public.business where id = v_id), 'the café is gone';
  assert cardinality(pg_temp.tables_with(v_id)) = 0, 'and every row of it: ' || array_to_string(pg_temp.tables_with(v_id), ', ');
  assert not exists (select 1 from auth.users where email in ('closing-owner@test', 'closing-barista@test')), 'and its people''s accounts';
  assert (select referred_by from public.business where name = 'Referred Bar') is null, 'the bar was brought in by a business that has gone';
  assert not exists (select 1 from public.referrals where became = v_id), 'nobody''s list names it';
  assert (select count(*) from public.profiles p join public.business b on b.id = p.business_id where b.name = 'Referred Bar') = 1, 'the bar keeps its team';
end $$;

-- In one go, with everything still there (step 2 alone), naming the business as anything else by hand
-- does (the triggers on its rows then see them).
begin;
select set_config('app.business_id', :'at_once', true);
select pg_temp.step_2(:at_once);
commit;
do $$
declare v_id int := current_setting('test.at_once')::int;
begin
  assert not exists (select 1 from public.business where id = v_id), 'that café is gone';
  assert cardinality(pg_temp.tables_with(v_id)) = 0, 'with every row of it: ' || array_to_string(pg_temp.tables_with(v_id), ', ');
  assert not exists (select 1 from auth.users where email = 'at-once-owner@test'), 'and its owner''s account';
end $$;

-- ---------------------------------------------------------------------------------------------------
-- 3. Everyone else: each check refuses one row as before
-- ---------------------------------------------------------------------------------------------------
-- An admin of the café still open.
select pg_temp.act_as('open-owner@test');
select pg_temp.checks_refuse(:still_open, 'app');
-- The Worker, for the business.
select pg_temp.as_db_owner();
select set_config('request.jwt.claim.role', 'service_role', false),
       set_config('request.headers', json_build_object('x-business-id', :'still_open')::text, false);
set role service_role;
select pg_temp.checks_refuse(:still_open, 'worker');
-- The database's owner, naming the business.
select pg_temp.as_db_owner();
begin;
select set_config('app.business_id', :'still_open', true);
select pg_temp.checks_refuse(:still_open, 'owner');
rollback;
-- Naming the business as going doesn't switch them off from the app or the API, which never sign in as
-- the database's owner.
select pg_temp.act_as('open-owner@test');
reset role;
set session authorization authenticated;
begin;
select set_config('app.business_id', :'still_open', true), set_config('app.deleting_business', :'still_open', true);
select pg_temp.checks_refuse(:still_open, 'app');
rollback;
reset session authorization;
-- Nor, for the database's owner, does naming another business.
select pg_temp.as_db_owner();
begin;
select set_config('app.business_id', :'still_open', true), set_config('app.deleting_business', '1', true);
select pg_temp.checks_refuse(:still_open, 'owner');
rollback;
-- And with this one named, a row still pointed to isn't deleted from under what points to it.
begin;
select set_config('app.business_id', :'still_open', true), set_config('app.deleting_business', :'still_open', true);
select pg_temp.expect_error(format('delete from public.contractors where business_id = %s', :still_open), 'violates foreign key constraint "outsourced_jobs_contractor_id_fkey"');
select pg_temp.expect_error(format('delete from public.food_safety_points where business_id = %s', :still_open), 'violates foreign key constraint "food_safety_checks_point_id_fkey"');
select pg_temp.expect_error(format('delete from public.cameras where business_id = %s', :still_open), 'violates foreign key constraint "camera_clips_camera_id_fkey"');
rollback;
do $$
declare v_id int := current_setting('test.still_open')::int;
begin
  assert (select count(*) from public.contractors where business_id = v_id) = 1
     and (select count(*) from public.kitty_entries where business_id = v_id) = 1
     and (select count(*) from public.menu_designs where business_id = v_id) = 1
     and exists (select 1 from public.competitors where business_id = v_id and is_self), 'all still there';
end $$;

-- ---------------------------------------------------------------------------------------------------
-- 4. Every business the tests made can go by the two steps, and by step 2 alone (each put back after)
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  v record;
  v_left text[];
begin
  for v in select id, name from public.business order by id loop
    begin
      update public.business set closing_requested_at = now() - interval '31 days' where id = v.id;
      perform set_config('app.business_id', v.id::text, true);
      perform set_config('app.deleting_business', v.id::text, true);
      perform pg_temp.step_1();
      v_left := pg_temp.tables_with(v.id);
      assert v_left <@ array['break_types', 'breaks', 'correction_requests', 'positions', 'profiles', 'time_entries', 'time_entry_changes'],
        'step 1 left ' || array_to_string(v_left, ', ');
      perform set_config('app.business_id', '', true);
      perform set_config('app.deleting_business', '', true);
      perform pg_temp.step_2(v.id);
      v_left := pg_temp.tables_with(v.id);
      assert cardinality(v_left) = 0 and not exists (select 1 from public.business where id = v.id), 'step 2 left ' || array_to_string(v_left, ', ');
      raise exception 'put back';
    exception when others then
      if sqlerrm <> 'put back' then
        raise exception 'Business % (%) can''t be deleted as docs/SEVERAL_BUSINESSES.md says (Closing an account): %. A trigger that refuses a delete lets one through while public.business_being_deleted(the row''s business_id) (the delete_business migration).',
          v.id, v.name, sqlerrm;
      end if;
    end;
    begin
      perform pg_temp.step_2(v.id);
      v_left := pg_temp.tables_with(v.id);
      assert cardinality(v_left) = 0 and not exists (select 1 from public.business where id = v.id), 'step 2 left ' || array_to_string(v_left, ', ');
      raise exception 'put back';
    exception when others then
      if sqlerrm <> 'put back' then
        raise exception 'Business % (%) can''t be deleted in one go (docs/SEVERAL_BUSINESSES.md, Closing an account): %. A trigger that refuses a delete lets one through while public.business_being_deleted(the row''s business_id) (the delete_business migration).',
          v.id, v.name, sqlerrm;
      end if;
    end;
  end loop;
  assert (select count(*) from public.business) >= 10, 'all put back';
end $$;
