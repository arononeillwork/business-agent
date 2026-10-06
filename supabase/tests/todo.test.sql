-- To Do List: the team shares the jobs; only admins manage categories. Runs after
-- time_tracking.test.sql and reuses its people: maria (admin), julio (employee).

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

-- 1. Starting categories, and an employee can add, tick off and edit jobs ------------
select pg_temp.act_as('julio@test');
do $$
declare v uuid;
begin
  assert (select count(*) from public.todo_categories) = 10, 'ten starting categories';
  insert into public.todos (title, category_id) values ('  Fix the tap  ', (select id from public.todo_categories where name = 'Shop'))
    returning id into v;
  assert (select title from public.todos where id = v) = 'Fix the tap', 'title trimmed';
  update public.todos set done = true, section = '  ' where id = v;
  assert (select done_at is not null and section is null from public.todos where id = v), 'done stamped, blank section cleared';
  update public.todos set done = false where id = v;
  assert (select done_at is null from public.todos where id = v), 'reopened clears done_at';
end $$;

-- 2. Employees cannot change categories --------------------------------------------
select pg_temp.expect_error($q$insert into public.todo_categories (name) values ('Kitchen')$q$, 'row-level security');
do $$ begin
  update public.todo_categories set name = 'Hacked' where name = 'Shop';
  assert not exists (select 1 from public.todo_categories where name = 'Hacked'), 'employee rename ignored';
  delete from public.todo_categories where name = 'Shop';
  assert exists (select 1 from public.todo_categories where name = 'Shop'), 'employee delete ignored';
end $$;
select pg_temp.expect_error($q$insert into public.todos (title) values ('   ')$q$, 'check constraint');

-- 3. Admins add and remove categories; jobs survive a removal ----------------------
select pg_temp.act_as('maria@test');
insert into public.todo_categories (name, colour) values ('Kitchen', '#4F8A3F');
select pg_temp.expect_error($q$insert into public.todo_categories (name) values (' kitchen ')$q$, 'duplicate key');
select pg_temp.expect_error($q$insert into public.todo_categories (name, colour) values ('Bad', 'red')$q$, 'check constraint');
do $$ begin
  delete from public.todo_categories where name = 'Shop';
  assert (select category_id is null from public.todos where title = 'Fix the tap'), 'job kept without a category';
end $$;

-- 4. People outside the team see nothing (a sign-up nobody invited stays inactive) ----
reset role;
insert into auth.users (email, raw_user_meta_data) values ('outsider@test', '{"full_name":"Outsider"}');
select pg_temp.act_as('outsider@test');
do $$ begin
  assert (select count(*) from public.todos) = 0, 'inactive account sees no jobs';
  assert (select count(*) from public.todo_categories) = 0, 'inactive account sees no categories';
end $$;
select pg_temp.expect_error($q$insert into public.todos (title) values ('Sneaky')$q$, 'row-level security');

reset role;
select set_config('request.jwt.claim.sub', '', false);
