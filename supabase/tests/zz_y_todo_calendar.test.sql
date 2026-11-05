-- To Do List → Calendar: a job is planned for a day, and maybe a time that day; a time needs a day, a
-- start and an end, and ends after it starts. The team plans jobs as it changes them.
-- People from the tests before it: julio (employee).

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

select pg_temp.act_as('julio@test');
insert into public.todos (title) values ('TC paint the bench');
do $$ declare v public.todos; begin
  update public.todos set planned_on = date '2026-10-01' where title = 'TC paint the bench' returning * into v;
  assert v.planned_on = date '2026-10-01' and v.planned_from is null, 'some time that day';
  update public.todos set planned_from = '11:00', planned_to = '12:30' where title = 'TC paint the bench' returning * into v;
  assert v.planned_from = time '11:00' and v.planned_to = time '12:30', 'at a time';
  update public.todos set planned_on = null, planned_from = null, planned_to = null where title = 'TC paint the bench' returning * into v;
  assert v.planned_on is null, 'off the calendar';
end $$;
select pg_temp.expect_error($q$update public.todos set planned_on = '2026-10-01', planned_from = '11:00' where title = 'TC paint the bench'$q$, 'todos_planned');
select pg_temp.expect_error($q$update public.todos set planned_from = '11:00', planned_to = '12:00' where title = 'TC paint the bench'$q$, 'todos_planned');
select pg_temp.expect_error($q$update public.todos set planned_on = '2026-10-01', planned_from = '12:00', planned_to = '11:00' where title = 'TC paint the bench'$q$, 'todos_planned');

reset role;
delete from public.todos where title = 'TC paint the bench';
