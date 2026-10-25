-- To Do List as a kanban board: each job is to do, being done or done. `done` stays (the list's tick,
-- the AI tools and older screens use it) and the two keep each other in step.

alter table public.todos add column status text not null default 'todo' check (status in ('todo', 'doing', 'done'));
update public.todos set status = 'done' where done;

create or replace function public.todo_touch() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  new.section := nullif(btrim(new.section), '');
  -- Status and done in step: whichever was changed decides (the status, when both were).
  if tg_op = 'INSERT' then
    if new.done or new.status = 'done' then new.done := true; new.status := 'done'; end if;
  elsif new.status is distinct from old.status then
    new.done := new.status = 'done';
  elsif new.done is distinct from old.done then
    new.status := case when new.done then 'done' when old.status = 'done' then 'todo' else old.status end;
  end if;
  if new.done and (tg_op = 'INSERT' or not old.done) then new.done_at := now(); end if;
  if not new.done then new.done_at := null; end if;
  new.updated_at := now();
  return new;
end $$;

-- The old "ToDo" board (made in the dashboard before the To Do List; migration 75 locked it) brought
-- into the To Do List: its area becomes the matching category, completed jobs are done, important
-- ones and open blockers ("block") are starred, "later" ones go under a Later sub-heading, and the
-- person it names is matched to the team by first name. In its old order, after the jobs already
-- there. A job already on the list (same title) is skipped, so running it again adds nothing.
-- Returns how many jobs were added. Run once on the live database; a fresh one has no old board.
create or replace function public.import_old_todo_board() returns int
language plpgsql security definer set search_path = ''
as $$
declare n int;
begin
  if to_regclass('public."ToDo"') is null then return 0; end if;
  with area(area, category) as (values
    ('legal', 'legal & money'), ('staff', 'people'), ('shop', 'shop'), ('buying', 'buying'), ('menu', 'food & drink'),
    ('tech', 'tech & till'), ('design', 'design'), ('content', 'social & content'), ('marketing', 'marketing'), ('ideas', 'future ideas')),
  old as (
    select o.*, row_number() over (order by case o.priority when 'block' then 0 when 'next' then 1 else 2 end, o.position, o.id) as n
      from public."ToDo" o
     where btrim(coalesce(o.title, '')) <> ''
       and not exists (select 1 from public.todos t where lower(btrim(t.title)) = lower(btrim(o.title)))
  ),
  start as (select coalesce(max(position), 0) as at from public.todos)
  insert into public.todos (title, category_id, section, assignee_id, done, status, starred, pinned, position, created_by, created_at)
  select left(btrim(o.title), 500),
         (select c.id from public.todo_categories c join area a on lower(btrim(c.name)) = a.category where a.area = lower(o.area) limit 1),
         coalesce(nullif(btrim(o.section), ''), case when o.priority = 'later' then 'Later' end),
         (select p.id from public.profiles p
           where p.active and p.role in ('admin', 'employee') and lower(split_part(btrim(p.full_name), ' ', 1)) = lower(btrim(o.assignee))
           order by p.created_at limit 1),
         coalesce(o.completed, false),
         case when coalesce(o.completed, false) then 'done' else 'todo' end,
         coalesce(o.important, false) or (o.priority = 'block' and not coalesce(o.completed, false)),
         coalesce(o.pinned, false),
         (select at from start) + o.n,
         null,
         coalesce(o.created_at, now())
    from old o;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.import_old_todo_board() from public, anon, authenticated;
