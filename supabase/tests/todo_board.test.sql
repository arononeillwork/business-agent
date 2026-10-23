-- To Do List board (migration 67): each job is to do, doing or done, kept in step with the tick; and
-- the old "ToDo" board brought in once. Runs after todo.test.sql (which removed Shop): maria (admin), julio (employee).

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

-- 1. Status and the tick stay in step, whichever is changed ---------------------------------------
select pg_temp.act_as('julio@test');
do $$
declare v uuid;
begin
  insert into public.todos (title) values ('Sand the terrace tables') returning id into v;
  assert (select status = 'todo' and not done from public.todos where id = v), 'a new job is to do';
  update public.todos set status = 'doing' where id = v;
  assert (select status = 'doing' and not done and done_at is null from public.todos where id = v), 'doing is not done';
  update public.todos set status = 'done' where id = v;
  assert (select done and done_at is not null from public.todos where id = v), 'moved to Done: ticked and stamped';
  update public.todos set done = false where id = v;
  assert (select status from public.todos where id = v) = 'todo', 'unticked: back to to do';
  update public.todos set status = 'doing' where id = v;
  update public.todos set done = true where id = v;
  assert (select status from public.todos where id = v) = 'done', 'ticked while doing: done';
  insert into public.todos (title, done) values ('Already done', true) returning id into v;
  assert (select status from public.todos where id = v) = 'done', 'added done: status done';
  insert into public.todos (title, status) values ('Started', 'doing') returning id into v;
  assert (select status = 'doing' and not done from public.todos where id = v), 'added doing';
  begin
    update public.todos set status = 'stuck' where id = v;
    assert false, 'an unknown status must be refused';
  exception when check_violation then null;
  end;
end $$;

-- 2. Nobody signed in can run the import ---------------------------------------------------------
do $$ begin
  begin
    perform public.import_old_todo_board();
    assert false, 'the import is not for signed-in people';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 3. The old board brought in: categories, done, stars, Later, people, order; once only -------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin assert public.import_old_todo_board() = 0, 'no old board: nothing to do'; end $$;
create table public."ToDo" (
  id bigint generated always as identity primary key, title text, completed boolean, important boolean, pinned boolean,
  area text, priority text, section text, assignee text, "position" double precision, created_at timestamptz default now(), updated_at timestamptz default now()
);
insert into public."ToDo" (title, completed, important, pinned, area, priority, section, assignee, "position") values
  ('Make the women’s bathroom usable', false, false, false, 'buying', 'block', null, null, 3),
  ('Build every item into Square', true, false, false, 'tech', 'block', 'Square', null, 1),
  ('Fancy multi-page printed menu', false, false, false, 'design', 'later', null, null, 2),
  ('Upload photos to the Drive folder', false, true, false, 'content', 'next', null, 'julio', 4),
  ('Sand the terrace tables', false, false, false, 'shop', 'next', null, null, 5),   -- already on the list
  ('Something from nowhere', false, false, false, 'unknown', 'next', null, 'Nobody', 6),
  ('   ', false, false, false, 'shop', 'next', null, null, 7);                       -- blank: skipped
do $$
declare before_max double precision := (select max(position) from public.todos);
begin
  assert public.import_old_todo_board() = 5, 'five new jobs (one already there, one blank)';
  assert (select status = 'todo' and starred and category_id = (select id from public.todo_categories where name = 'Buying')
          from public.todos where title = 'Make the women’s bathroom usable'), 'an open blocker: to do, starred, in Buying';
  assert (select done and status = 'done' and not starred and section = 'Square' and category_id = (select id from public.todo_categories where name = 'Tech & till')
          from public.todos where title = 'Build every item into Square'), 'a done blocker: done, not starred, its sub-heading kept';
  assert (select section = 'Later' and not starred from public.todos where title = 'Fancy multi-page printed menu'), 'later: under Later';
  assert (select starred and assignee_id = (select id from public.profiles where email = 'julio@test')
            and category_id = (select id from public.todo_categories where name = 'Social & content')
          from public.todos where title = 'Upload photos to the Drive folder'), 'important: starred; julio matched by first name';
  assert (select category_id is null and assignee_id is null from public.todos where title = 'Something from nowhere'), 'unknown area and person: left empty';
  assert (select count(*) from public.todos where title = 'Sand the terrace tables') = 1, 'a job already on the list is not doubled';
  assert (select min(position) from public.todos where title in ('Make the women’s bathroom usable', 'Build every item into Square',
          'Fancy multi-page printed menu', 'Upload photos to the Drive folder', 'Something from nowhere')) > before_max, 'after the jobs already there';
  assert (select position from public.todos where title = 'Build every item into Square')
       < (select position from public.todos where title = 'Make the women’s bathroom usable'), 'blockers in their old order';
  assert (select position from public.todos where title = 'Make the women’s bathroom usable')
       < (select position from public.todos where title = 'Upload photos to the Drive folder'), 'blockers before next';
  assert (select position from public.todos where title = 'Upload photos to the Drive folder')
       < (select position from public.todos where title = 'Fancy multi-page printed menu'), 'next before later';
  assert public.import_old_todo_board() = 0, 'running it again adds nothing';
end $$;
drop table public."ToDo";
