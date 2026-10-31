-- Role people back. The `role_areas_menu_company` migration changed Easy Beans' Barista / Bartender role's
-- areas, and the role lost its people (Maria) on the way: job_role_rules() keeps only people it finds on
-- the team, and a migration runs signed out, so with several businesses in the database
-- current_business_id() names none and the team can't be seen. This puts back who was in a role before
-- that migration emptied it (from the audit log: the update that first gave it the Company details and
-- left it with nobody), with the role's business named so the check sees its team. Only people still
-- on that team, and only while the role is still empty, so nothing an admin did since is undone.

do $$
declare r record;
begin
  for r in
    select distinct on (j.id) j.id, j.business_id,
           array(select p::uuid from jsonb_array_elements_text(a.old_values -> 'people') p
                  where exists (select 1 from public.profiles x
                                 where x.id = p::uuid and x.business_id = j.business_id and x.role in ('admin', 'employee'))) as people
      from public.audit_log a
      join public.job_roles j on j.id::text = a.row_id
     where a.table_name = 'job_roles' and a.action = 'update' and a.actor is null
       and jsonb_array_length(coalesce(a.old_values -> 'people', '[]')) > 0 and a.new_values -> 'people' = '[]'
       and not coalesce(a.old_values -> 'permissions', '{}') ? 'company' and a.new_values -> 'permissions' ->> 'company' = 'none'
       and j.people = '{}'
     order by j.id, a.at desc
  loop
    perform set_config('app.business_id', r.business_id::text, true);
    update public.job_roles set people = r.people where id = r.id and people = '{}';
  end loop;
  perform set_config('app.business_id', '', true);
end $$;
