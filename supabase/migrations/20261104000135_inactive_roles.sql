-- Roles & responsibilities → Inactive: a role that isn't in use right now is kept, with its duties, people
-- and permissions, under its own tab, and moved back to Active in one press. Every role is active to start
-- with; Easy Beans' Investor and Head Barista (business 1, nobody in either) move to Inactive.
--
-- As in the `baristas_see_the_menu` migration: the role's business is named while it's changed, so
-- job_role_rules() sees its team and keeps its people (a migration runs signed out).

alter table public.job_roles add column active boolean not null default true;

do $$
declare r record;
begin
  for r in
    select j.id, j.business_id from public.job_roles j
     where j.business_id = 1 and lower(j.name) in ('investor', 'head barista') and j.active
  loop
    perform set_config('app.business_id', r.business_id::text, true);
    update public.job_roles set active = false where id = r.id;
  end loop;
  perform set_config('app.business_id', '', true);
end $$;
