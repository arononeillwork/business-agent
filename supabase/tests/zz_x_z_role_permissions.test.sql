-- Role permissions (the `role_permissions` migration): a role gives its people Hidden, Read or Update
-- in each area. Update lets an employee do there what an admin does (never deciding their own time off
-- or timecards); Read and Hidden leave them as before; leaving the role takes it away. Its own people
-- and rows, removed at the end.

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
  ('rp-admin@test', '{"full_name": "Admin"}', now()),
  ('rp-lead@test', '{"full_name": "Lead"}', now()),
  ('rp-barista@test', '{"full_name": "Barista"}', now());
update public.profiles set role = 'admin' where email = 'rp-admin@test';

-- 1. Saved tidy: areas and levels checked, the team's own areas never hidden ---------------------
select pg_temp.act_as('rp-admin@test');
insert into public.job_roles (name, template, people, permissions) values
  ('RP lead', ' cafe.shift-lead ', array[(select id from public.profiles where email = 'rp-lead@test')],
   '{"rota": "update", "timeoff": "update", "timecards": "update", "calendar": "update", "stock": "update", "foodsafety": "update", "waste": "update", "todo": "update"}'),
  ('RP barista', 'cafe.barista', array[(select id from public.profiles where email = 'rp-barista@test')],
   '{"rota": "none", "stock": "none", "timecards": "read"}');
do $$ begin
  assert (select template = 'cafe.shift-lead' from public.job_roles where name = 'RP lead'), 'template trimmed';
  assert (select permissions = '{"rota": "read", "stock": "none", "timecards": "read"}'::jsonb from public.job_roles where name = 'RP barista'),
    'the rota can''t be hidden; stock can';
  assert (select permissions = '{}'::jsonb from public.job_roles where name = 'Barista'), 'roles from before have no permissions (Read)';
end $$;
select pg_temp.expect_error($q$update public.job_roles set permissions = '{"payroll": "update"}' where name = 'RP barista'$q$, 'Each area is none, read or update');
select pg_temp.expect_error($q$update public.job_roles set permissions = '{"rota": "admin"}' where name = 'RP barista'$q$, 'Each area is none, read or update');
select pg_temp.expect_error($q$update public.job_roles set permissions = '{"rota": true}' where name = 'RP barista'$q$, 'Each area is none, read or update');
select pg_temp.expect_error($q$update public.job_roles set permissions = '["rota"]' where name = 'RP barista'$q$, 'Permissions must be a list of areas');

-- The barista asks for time off; the admin adds a draft shift and an admins-only event.
select pg_temp.act_as('rp-barista@test');
select public.request_time_off(current_date + 20, current_date + 21);
select pg_temp.act_as('rp-admin@test');
insert into public.shifts (profile_id, position_id, starts_at, ends_at, status)
select id, 1, now() + interval '3 days', now() + interval '3 days 8 hours', 'draft' from public.profiles where email = 'rp-barista@test';
insert into public.calendar_events (starts_on, title, category, visibility) values (current_date + 30, 'RP admins only', 'business', 'admins');

-- 2. Update: the lead does what an admin does in each area ---------------------------------------
select pg_temp.act_as('rp-lead@test');
do $$
declare v_barista uuid := (select id from public.profiles where email = 'rp-barista@test');
begin
  assert public.can_update('rota') and public.can_update('todo'), 'the lead can update';
  assert not public.is_admin(), 'without being an admin';
  assert exists (select 1 from public.shifts where profile_id = v_barista and status = 'draft'), 'sees draft shifts';
  insert into public.shifts (profile_id, position_id, starts_at, ends_at)
    values (v_barista, 1, now() + interval '4 days', now() + interval '4 days 8 hours');
  update public.shifts set status = 'published' where profile_id = v_barista;
  assert (select count(*) from public.shifts where profile_id = v_barista and status = 'published') = 2, 'adds and publishes shifts';
  perform public.send_rota(date_trunc('week', current_date)::date);
  assert exists (select 1 from public.time_off where profile_id = v_barista and status = 'pending'), 'sees others'' pending time off';
  perform public.decide_time_off((select id from public.time_off where profile_id = v_barista and status = 'pending'), true);
  assert exists (select 1 from public.time_off where profile_id = v_barista and status = 'approved' and decided_by = auth.uid()), 'decides it';
  assert exists (select 1 from public.calendar_events where title = 'RP admins only'), 'sees admins-only events';
  insert into public.calendar_events (starts_on, title, category) values (current_date + 31, 'RP tasting', 'business');
  update public.calendar_events set title = 'RP tasting night' where title = 'RP tasting';
  insert into public.stock_items (name, unit, cost_per_unit) values ('RP oat milk', 'l', 1.2);
  update public.stock_items set par_level = 12 where name = 'RP oat milk';
  insert into public.food_safety_points (name, min_temp, max_temp, frequency) values ('RP fridge', 0, 4, 'twice_daily');
  insert into public.todo_categories (name) values ('RP bar');
  perform public.add_time_entry(v_barista, now() - interval '5 hours', now() - interval '1 hour', 'Forgot to clock in');
  assert exists (select 1 from public.time_entries where profile_id = v_barista), 'adds and sees the team''s timecards';
  perform public.edit_time_entry((select id from public.time_entries where profile_id = v_barista limit 1), null, now() - interval '30 minutes', 'Stayed late');
end $$;
-- Never their own.
select public.request_time_off(current_date + 40, current_date + 40);
select pg_temp.expect_error($q$select public.decide_time_off((select id from public.time_off where profile_id = auth.uid() and status = 'pending'), true)$q$,
  'decide your own time off');
select pg_temp.expect_error($q$select public.add_time_entry(auth.uid(), now() - interval '5 hours', now() - interval '1 hour', 'Forgot')$q$, 'your own timecard');

-- 3. Read and Hidden: the barista can do no more than before ---------------------------------------
select pg_temp.act_as('rp-barista@test');
do $$ begin
  assert not public.can_update('rota') and not public.can_update('stock'), 'the barista can''t update';
  assert not exists (select 1 from public.calendar_events where title = 'RP admins only'), 'nor see admins-only events';
  assert exists (select 1 from public.stock_items where name = 'RP oat milk'), 'Hidden still reads what the team always could';
end $$;
select pg_temp.expect_error($q$insert into public.shifts (profile_id, position_id, starts_at, ends_at) values (auth.uid(), 1, now() + interval '5 days', now() + interval '5 days 8 hours')$q$,
  'row-level security');
select pg_temp.expect_error($q$insert into public.todo_categories (name) values ('RP mine')$q$, 'row-level security');
select pg_temp.expect_error($q$select public.send_rota(current_date)$q$, 'Only an admin can send the rota');
select pg_temp.expect_error($q$select public.approve_week(date_trunc('week', current_date)::date)$q$, 'Only an admin can approve timecards');
select pg_temp.expect_error($q$select public.decide_time_off((select id from public.time_off limit 1), true)$q$, 'Only an admin can decide time off');

-- 4. Out of the role, the lead is back to Read ---------------------------------------------------
select pg_temp.act_as('rp-admin@test');
update public.job_roles set people = '{}' where name = 'RP lead';
select pg_temp.act_as('rp-lead@test');
do $$ begin
  assert not public.can_update('rota'), 'out of the role';
  assert not exists (select 1 from public.calendar_events where title = 'RP admins only'), 'admins-only events hidden again';
end $$;
update public.stock_items set par_level = 1 where name = 'RP oat milk';
do $$ begin
  assert (select par_level = 12 from public.stock_items where name = 'RP oat milk'), 'stock unchanged';
end $$;

-- Tidy up.
reset role; select set_config('request.jwt.claim.sub', '', false);
delete from public.job_roles where name in ('RP lead', 'RP barista');
delete from public.calendar_events where title like 'RP %';
delete from public.stock_items where name = 'RP oat milk';
delete from public.food_safety_points where name = 'RP fridge';
delete from public.todo_categories where name = 'RP bar';
delete from public.time_entry_changes where time_entry_id in (select id from public.time_entries where profile_id in (select id from public.profiles where email like 'rp-%@test'));
delete from public.time_entries where profile_id in (select id from public.profiles where email like 'rp-%@test');
delete from public.time_off where profile_id in (select id from public.profiles where email like 'rp-%@test');
delete from public.shifts where profile_id in (select id from public.profiles where email like 'rp-%@test');
delete from auth.users where email in ('rp-admin@test', 'rp-lead@test', 'rp-barista@test');
