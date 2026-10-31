-- Baristas see the Menu page: what's on the menu, with its prices and allergens, to answer customers
-- (admins still change it and design the printed and screen menus). The café's barista template says
-- so from now on (shared/roles.ts); this gives Easy Beans' barista role (business 1, the one made from
-- the template, which the `role_areas_menu_company` migration hid the menu from) the same. The rest of
-- what the role gives is left as the owner set it.
--
-- As in the `role_people_back` migration: the role's business is named while it's changed, so
-- job_role_rules() sees its team and keeps its people (a migration runs signed out).

do $$
declare r record;
begin
  for r in
    select j.id, j.business_id from public.job_roles j
     where j.business_id = 1 and j.template = 'cafe.barista' and j.permissions ->> 'menu' = 'none'
  loop
    perform set_config('app.business_id', r.business_id::text, true);
    update public.job_roles set permissions = permissions || '{"menu": "read"}' where id = r.id;
  end loop;
  perform set_config('app.business_id', '', true);
end $$;
