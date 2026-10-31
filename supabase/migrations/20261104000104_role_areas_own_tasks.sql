-- Role areas and own tasks: three more areas a role sets (the Business page, Opening hours and
-- Dashboards: Hidden or Read) and a fourth level, Own, for the To Do List: someone whose roles give it no
-- more than Own sees, adds and changes only the jobs given to them. Each area keeps to the levels it
-- offers (shared/roles.ts, ROLE_AREAS); one it doesn't offer is saved as Read.

create or replace function public.job_role_permissions() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if jsonb_typeof(new.permissions) is distinct from 'object' then raise exception 'Permissions must be a list of areas'; end if;
  if exists (select 1 from jsonb_each(new.permissions) e
             where e.key not in ('business', 'todo', 'hours', 'dashboards', 'stock', 'foodsafety', 'waste', 'calendar', 'rota', 'timeoff', 'timecards')
                or jsonb_typeof(e.value) is distinct from 'string' or e.value #>> '{}' not in ('none', 'own', 'read', 'update')) then
    raise exception 'Each area is none, own, read or update: business, todo, hours, dashboards, stock, foodsafety, waste, calendar, rota, timeoff or timecards';
  end if;
  -- What each area offers: everyone has their own shifts, holidays and hours, Own is the To Do List's,
  -- and the business's details, its hours and the dashboards are only shown or not.
  new.permissions := (select coalesce(jsonb_object_agg(e.key,
                        case when e.value #>> '{}' = any(case e.key
                               when 'todo' then array['none', 'own', 'read', 'update']
                               when 'business' then array['none', 'read'] when 'hours' then array['none', 'read'] when 'dashboards' then array['none', 'read']
                               when 'rota' then array['read', 'update'] when 'timeoff' then array['read', 'update'] when 'timecards' then array['read', 'update']
                               else array['none', 'read', 'update'] end)
                             then e.value else '"read"'::jsonb end), '{}')
                        from jsonb_each(new.permissions) e);
  new.template := nullif(btrim(new.template), '');
  return new;
end $$;

-- Whether the person asking sees only their own jobs: on the team, not an admin, in a role, and none of
-- their roles gives the To Do List Read or Update (an area a role doesn't name is Read).
create or replace function public.todo_own_only() returns boolean
language sql stable security definer set search_path = ''
as $$
  select not public.is_admin() and public.is_staff()
     and exists (select 1 from public.job_roles r where (select auth.uid()) = any(r.people))
     and not exists (select 1 from public.job_roles r where (select auth.uid()) = any(r.people)
                       and coalesce(r.permissions ->> 'todo', 'read') in ('read', 'update'))
$$;
alter function public.todo_own_only() owner to app_definer;
revoke execute on function public.todo_own_only() from public, anon;
grant execute on function public.todo_own_only() to authenticated;

-- Added to every other policy on the table: for them, only jobs given to them, and what they add or
-- change stays theirs.
create policy todos_own_only on public.todos as restrictive for all to authenticated
  using (not (select public.todo_own_only()) or assignee_id = (select auth.uid()))
  with check (not (select public.todo_own_only()) or assignee_id = (select auth.uid()));
