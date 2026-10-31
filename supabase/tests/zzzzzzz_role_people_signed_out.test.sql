-- A role's people, changed signed out (the `role_people_back` migration): a role keeps only people on
-- its business's team, and signed out with several businesses (as a migration runs) the team can't be
-- seen until the business is named, so a change made then has to name it or the role loses its people.
-- Runs after zzzz_several_businesses: two businesses. Its own role, removed at the end.

reset role;
select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false), set_config('request.headers', '', false);

do $$
declare v_maria uuid := (select id from public.profiles where email = 'maria@test' and business_id = 1);
begin
  assert v_maria is not null and public.current_business_id() is null, 'signed out, two businesses, none named';
  perform set_config('app.business_id', '1', true);
  insert into public.job_roles (business_id, name, people) values (1, 'RPB barista', array[v_maria]);
  assert (select people = array[v_maria] from public.job_roles where name = 'RPB barista'), 'with the business named, she''s in it';

  -- Named, a change keeps her.
  update public.job_roles set permissions = permissions || '{"menu": "none"}' where name = 'RPB barista';
  assert (select people = array[v_maria] from public.job_roles where name = 'RPB barista'), 'named: still in it';

  -- Not named, the team can't be seen and she drops out: what the `role_areas_menu_company` migration did.
  perform set_config('app.business_id', '', true);
  update public.job_roles set permissions = permissions || '{"company": "none"}' where name = 'RPB barista';
  assert (select people = '{}' from public.job_roles where name = 'RPB barista'), 'not named: nobody';

  -- Put back with the business named, as the `role_people_back` migration does.
  perform set_config('app.business_id', '1', true);
  update public.job_roles set people = array[v_maria] where name = 'RPB barista' and people = '{}';
  assert (select people = array[v_maria] from public.job_roles where name = 'RPB barista'), 'named again: back in it';
  perform set_config('app.business_id', '', true);
end $$;

-- Tidy up.
delete from public.job_roles where name = 'RPB barista';
