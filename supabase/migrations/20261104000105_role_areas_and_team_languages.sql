-- Role areas and the team's languages.
-- - Three more areas a role sets, each shown or not (shared/roles.ts, ROLE_AREAS): Brand, Expenses and AI
--   assistants. The café's front-line templates, the barista's among them, leave them out. This is the
--   `role_areas_own_tasks` migration's function with the three areas added.
-- - settings.languages: the languages the team uses, picked by an admin on My account. With two, everyone
--   gets the flags to switch between them, and each person's own choice is kept on their account.

alter table public.settings add column languages text[] not null default '{}' check (languages <@ array['en', 'es']::text[]);

create or replace function public.job_role_permissions() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if jsonb_typeof(new.permissions) is distinct from 'object' then raise exception 'Permissions must be a list of areas'; end if;
  if exists (select 1 from jsonb_each(new.permissions) e
             where e.key not in ('business', 'todo', 'hours', 'brand', 'dashboards', 'stock', 'foodsafety', 'waste', 'expenses', 'calendar',
                                 'rota', 'timeoff', 'timecards', 'ai')
                or jsonb_typeof(e.value) is distinct from 'string' or e.value #>> '{}' not in ('none', 'own', 'read', 'update')) then
    raise exception 'Each area is none, own, read or update: business, todo, hours, brand, dashboards, stock, foodsafety, waste, expenses, calendar, rota, timeoff, timecards or ai';
  end if;
  -- What each area offers: everyone has their own shifts, holidays and hours, Own is the To Do List's,
  -- and the business's details, its hours, its brand, the dashboards, expenses and AI assistants are only shown or not.
  new.permissions := (select coalesce(jsonb_object_agg(e.key,
                        case when e.value #>> '{}' = any(case
                               when e.key = 'todo' then array['none', 'own', 'read', 'update']
                               when e.key in ('business', 'hours', 'brand', 'dashboards', 'expenses', 'ai') then array['none', 'read']
                               when e.key in ('rota', 'timeoff', 'timecards') then array['read', 'update']
                               else array['none', 'read', 'update'] end)
                             then e.value else '"read"'::jsonb end), '{}')
                        from jsonb_each(new.permissions) e);
  new.template := nullif(btrim(new.template), '');
  return new;
end $$;
