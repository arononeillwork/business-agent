-- To Do List → Calendar: a job can be planned for a day, and for a time that day, by dragging it onto
-- the calendar (a day in the month, or a time in the week, then moved and stretched there). A day
-- without a time is "some time that day". Whoever can change a job can plan it (as before: the team,
-- or only their own jobs for a role with Own).
alter table public.todos
  add column planned_on   date,
  add column planned_from time,
  add column planned_to   time,
  add constraint todos_planned check (
    (planned_from is null) = (planned_to is null)
    and (planned_from is null or (planned_on is not null and planned_to > planned_from)));
create index todos_planned_idx on public.todos (business_id, planned_on) where planned_on is not null;
