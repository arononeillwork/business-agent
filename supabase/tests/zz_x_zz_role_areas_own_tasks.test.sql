-- Role areas and own tasks (the `role_areas_own_tasks` migration): each area keeps to the levels it
-- offers, and a role whose To Do List is Own (or Hidden) shows its people only the jobs given to them,
-- unless another of their roles gives Read. Its own people and rows, removed at the end.

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
  ('ot-admin@test', '{"full_name": "Admin"}', now()),
  ('ot-barista@test', '{"full_name": "Barista"}', now()),
  ('ot-other@test', '{"full_name": "Other"}', now());
update public.profiles set role = 'admin' where email = 'ot-admin@test';

-- 1. Each area keeps to its levels ------------------------------------------------------------------
select pg_temp.act_as('ot-admin@test');
insert into public.job_roles (name, people, permissions) values
  ('OT barista', array[(select id from public.profiles where email = 'ot-barista@test')],
   '{"business": "none", "dashboards": "none", "hours": "update", "stock": "own", "todo": "own", "rota": "none"}');
do $$ begin
  assert (select permissions = '{"business": "none", "dashboards": "none", "hours": "read", "stock": "read", "todo": "own", "rota": "read"}'::jsonb
            from public.job_roles where name = 'OT barista'), 'levels an area doesn''t offer are saved as Read';
end $$;
select pg_temp.expect_error($q$update public.job_roles set permissions = '{"payroll": "read"}' where name = 'OT barista'$q$, 'Each area is none, own, read or update');

-- The admin adds three jobs: the barista's, nobody's and someone else's.
insert into public.todos (title, assignee_id) values
  ('OT hers', (select id from public.profiles where email = 'ot-barista@test')),
  ('OT anyone', null),
  ('OT other''s', (select id from public.profiles where email = 'ot-other@test'));

-- 2. Own: only the jobs given to her; what she adds or changes stays hers ----------------------------
select pg_temp.act_as('ot-barista@test');
do $$ begin
  assert public.todo_own_only(), 'the barista sees only her own jobs';
  assert (select array_agg(title order by title) from public.todos where title like 'OT %') = array['OT hers'], 'just hers';
  insert into public.todos (title, assignee_id) values ('OT mine too', auth.uid());
  update public.todos set done = true where title = 'OT hers';
  assert (select count(*) from public.todos where title like 'OT %') = 2, 'adds and ticks off her own';
  update public.todos set done = true where title = 'OT anyone';
end $$;
select pg_temp.expect_error($q$insert into public.todos (title, assignee_id) values ('OT for anyone', null)$q$, 'row-level security');
select pg_temp.expect_error($q$update public.todos set assignee_id = (select id from public.profiles where email = 'ot-other@test') where title = 'OT hers'$q$,
  'row-level security');
select pg_temp.act_as('ot-other@test');
do $$ begin
  assert not public.todo_own_only(), 'someone in no role sees everyone''s';
  assert (select count(*) from public.todos where title like 'OT %') = 4, 'all four';
  assert (select not done from public.todos where title = 'OT anyone'), 'the barista couldn''t touch a job that isn''t hers';
end $$;

-- 3. Another role with Read gives the whole list back -------------------------------------------------
select pg_temp.act_as('ot-admin@test');
insert into public.job_roles (name, people) values ('OT runner', array[(select id from public.profiles where email = 'ot-barista@test')]);
select pg_temp.act_as('ot-barista@test');
do $$ begin
  assert not public.todo_own_only(), 'a role that says nothing about the list is Read';
  assert (select count(*) from public.todos where title like 'OT %') = 4, 'all four again';
end $$;

-- Tidy up.
reset role; select set_config('request.jwt.claim.sub', '', false);
delete from public.todos where title like 'OT %';
delete from public.job_roles where name in ('OT barista', 'OT runner');
delete from auth.users where email in ('ot-admin@test', 'ot-barista@test', 'ot-other@test');
