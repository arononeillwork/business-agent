-- Role areas: the menu and the company's details. Two more areas a role sets, each Hidden or Read: the
-- Menu page, and the Company details on the Business page (its CIF/NIF, currency and where team alerts
-- go), which a role can hide while the page's contact details stay. As the
-- `role_areas_and_team_languages` migration's job_role_permissions(), with those two added; each area
-- keeps to the levels it offers (shared/roles.ts, ROLE_AREAS), one it doesn't offer is saved as Read.

create or replace function public.job_role_permissions() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if jsonb_typeof(new.permissions) is distinct from 'object' then raise exception 'Permissions must be a list of areas'; end if;
  if exists (select 1 from jsonb_each(new.permissions) e
             where e.key not in ('business', 'company', 'todo', 'hours', 'brand', 'dashboards', 'menu', 'stock', 'foodsafety', 'waste',
                                 'expenses', 'calendar', 'rota', 'timeoff', 'timecards', 'ai')
                or jsonb_typeof(e.value) is distinct from 'string' or e.value #>> '{}' not in ('none', 'own', 'read', 'update')) then
    raise exception 'Each area is none, own, read or update: business, company, todo, hours, brand, dashboards, menu, stock, foodsafety, waste, expenses, calendar, rota, timeoff, timecards or ai';
  end if;
  -- What each area offers: everyone has their own shifts, holidays and hours, Own is the To Do List's,
  -- and the business's details, its company details, hours, brand, dashboards, menu, expenses and AI
  -- assistants are only shown or not.
  new.permissions := (select coalesce(jsonb_object_agg(e.key,
                        case when e.value #>> '{}' = any(case
                               when e.key = 'todo' then array['none', 'own', 'read', 'update']
                               when e.key in ('business', 'company', 'hours', 'brand', 'dashboards', 'menu', 'expenses', 'ai') then array['none', 'read']
                               when e.key in ('rota', 'timeoff', 'timecards') then array['read', 'update']
                               else array['none', 'read', 'update'] end)
                             then e.value else '"read"'::jsonb end), '{}')
                        from jsonb_each(new.permissions) e);
  new.template := nullif(btrim(new.template), '');
  return new;
end $$;

-- Easy Beans' baristas (business 1, the role made from the café's barista template): the Business page's
-- contact details, but not its Company details, the Brand, Dashboards, Menu or Expenses. The template
-- says the same for roles added from now on; what else the role gives is left as the owner set it.
update public.job_roles
   set permissions = permissions || '{"business": "read", "company": "none", "brand": "none", "dashboards": "none", "menu": "none", "expenses": "none"}'
 where business_id = 1 and template = 'cafe.barista';
