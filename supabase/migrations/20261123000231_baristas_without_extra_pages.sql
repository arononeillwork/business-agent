-- Baristas without the extra pages. Five more areas a role sets, each Hidden or Read (shared/roles.ts,
-- ROLE_AREAS): Ideas, QR codes, Reps & rewards, the Social planner and the Leaderboard. The café's
-- barista template hides them, and the To Do List too, from now on; this gives Easy Beans' barista role
-- (business 1, the one made from the template) the same. The rest of what the role gives is left as the
-- owner set it.
--
-- job_role_permissions() is the `role_areas_menu_company` migration's, with the five areas added.

create or replace function public.job_role_permissions() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if jsonb_typeof(new.permissions) is distinct from 'object' then raise exception 'Permissions must be a list of areas'; end if;
  if exists (select 1 from jsonb_each(new.permissions) e
             where e.key not in ('business', 'company', 'todo', 'hours', 'brand', 'dashboards', 'menu', 'stock', 'foodsafety', 'waste',
                                 'expenses', 'calendar', 'rota', 'timeoff', 'timecards', 'ai',
                                 'ideas', 'qrcodes', 'reps', 'social', 'leaderboard')
                or jsonb_typeof(e.value) is distinct from 'string' or e.value #>> '{}' not in ('none', 'own', 'read', 'update')) then
    raise exception 'Each area is none, own, read or update: business, company, todo, hours, brand, dashboards, menu, stock, foodsafety, waste, expenses, calendar, rota, timeoff, timecards, ai, ideas, qrcodes, reps, social or leaderboard';
  end if;
  -- What each area offers: everyone has their own shifts, holidays and hours, Own is the To Do List's,
  -- and the business's details, its company details, hours, brand, dashboards, menu, expenses, AI
  -- assistants, ideas, QR codes, reps, social planner and leaderboard are only shown or not.
  new.permissions := (select coalesce(jsonb_object_agg(e.key,
                        case when e.value #>> '{}' = any(case
                               when e.key = 'todo' then array['none', 'own', 'read', 'update']
                               when e.key in ('business', 'company', 'hours', 'brand', 'dashboards', 'menu', 'expenses', 'ai',
                                              'ideas', 'qrcodes', 'reps', 'social', 'leaderboard') then array['none', 'read']
                               when e.key in ('rota', 'timeoff', 'timecards') then array['read', 'update']
                               else array['none', 'read', 'update'] end)
                             then e.value else '"read"'::jsonb end), '{}')
                        from jsonb_each(new.permissions) e);
  new.template := nullif(btrim(new.template), '');
  return new;
end $$;

-- As in the `baristas_see_the_menu` migration: the role's business is named while it's changed, so
-- job_role_rules() sees its team and keeps its people (a migration runs signed out).
do $$
declare r record;
begin
  for r in
    select j.id, j.business_id from public.job_roles j
     where j.business_id = 1 and j.template = 'cafe.barista'
  loop
    perform set_config('app.business_id', r.business_id::text, true);
    update public.job_roles
       set permissions = permissions || '{"todo": "none", "ideas": "none", "qrcodes": "none", "reps": "none", "social": "none", "leaderboard": "none"}'
     where id = r.id;
  end loop;
  perform set_config('app.business_id', '', true);
end $$;
