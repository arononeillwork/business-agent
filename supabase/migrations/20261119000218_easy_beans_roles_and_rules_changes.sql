-- Easy Beans' roles and staff rules, as the owners changed them (src/data/easyBeansHandbook.ts says the
-- same for the demo and a new database):
-- - the Square system is the Laptop Guy's now, no longer the Business Manager's;
-- - marketing and brand direction is no longer part of the Business Manager's role;
-- - the Accountant does Credit & debit;
-- - the Data protection section of the staff rules goes.
--
-- Easy Beans only (business 1), by the roles' names and the duties' exact words, so a role or duty an
-- admin has renamed or changed since is left as it is, and running it again changes nothing. As in the
-- `baristas_see_the_menu` migration, the business is named while its roles change, so job_role_rules()
-- sees its team and keeps the people in them (a migration runs signed out).

do $$
declare
  square constant text := 'Square system — setup and admin: staff schedule, pay, payment system items upkeep, discounts, customer experience, loyalty, sales analytics and reporting';
  credit constant text := 'Credit & debit: money the café still has to pay (loans, finance) and money still to come in';
  gone constant text[] := array[square, 'Marketing and brand direction'];
begin
  perform set_config('app.business_id', '1', true);

  update public.job_roles j
     set duties = (select coalesce(jsonb_agg(x.d order by x.i), '[]'::jsonb)
                     from jsonb_array_elements(j.duties) with ordinality x(d, i)
                    where not (x.d ->> 'text' = any (gone)))
   where j.business_id = 1 and j.name = 'Business Manager'
     and exists (select 1 from jsonb_array_elements(j.duties) d where d ->> 'text' = any (gone));

  -- Last of each role's core responsibilities (the page groups the duties by when they're done).
  update public.job_roles j
     set duties = j.duties || jsonb_build_array(jsonb_build_object('when', 'core', 'text', square))
   where j.business_id = 1 and j.name = 'Laptop Guy'
     and not exists (select 1 from jsonb_array_elements(j.duties) d where d ->> 'text' = square);

  update public.job_roles j
     set duties = j.duties || jsonb_build_array(jsonb_build_object('when', 'core', 'text', credit))
   where j.business_id = 1 and j.name = 'Accountant'
     and not exists (select 1 from jsonb_array_elements(j.duties) d where d ->> 'text' = credit);

  delete from public.staff_rules where business_id = 1 and title = 'Data protection';

  perform set_config('app.business_id', '', true);
end $$;
