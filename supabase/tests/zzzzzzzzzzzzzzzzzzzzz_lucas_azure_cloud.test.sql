-- HQ's people (the lucas_azure_cloud migration), once: Lucas, the Azure cloud person, on the team,
-- reporting to Aron, after everyone already there. HQ's people as a new database starts them (an
-- earlier test may leave none), then the change, run twice.
select set_config('test.hq', (select id::text from public.business where is_hq), false);
delete from public.admin_people where business_id = current_setting('test.hq')::int;
select public.start_admin_area_people();
select public.start_lawyer_and_investors();
select public.start_lucas_azure_cloud();
select public.start_lucas_azure_cloud();
do $$
declare v_hq int := current_setting('test.hq')::int;
begin
  assert (select string_agg(p.name || ':' || p.role || '>' || b.name || ':' || p.kind, ', ')
            from public.admin_people p join public.admin_people b on b.id = p.reports_to where p.business_id = v_hq and p.name = 'Lucas')
    = 'Lucas:Azure Cloud>Aron:team', 'Lucas on the team, once, the Azure cloud person, reporting to Aron';
  assert (select position = (select max(position) from public.admin_people where business_id = v_hq)
            from public.admin_people where business_id = v_hq and name = 'Lucas'), 'after everyone already there';
  assert (select string_agg(p.name || '>' || b.name, ', ' order by p.position)
            from public.admin_people p join public.admin_people b on b.id = p.reports_to where p.business_id = v_hq and b.name = 'Aron')
    = 'Alejandro>Aron, Kim>Aron, Zoe>Aron, Eduardo>Aron, Lucas>Aron', 'Aron''s team as it was, then Lucas';
end $$;

-- Someone called Lucas already there (added in the app): nobody new.
do $$
declare v_hq int := current_setting('test.hq')::int;
begin
  delete from public.admin_people where business_id = v_hq and name = 'Lucas';
  perform set_config('app.business_id', v_hq::text, true);
  insert into public.admin_people (business_id, name, role, kind, position) values (v_hq, 'Lucas Smith', 'Engineer', 'bench', 99);
  perform set_config('app.business_id', '', true);
  perform public.start_lucas_azure_cloud();
  assert (select count(*) from public.admin_people where business_id = v_hq and name like 'Lucas%') = 1, 'the Lucas already there, and nobody new';
  delete from public.admin_people where business_id = v_hq and name = 'Lucas Smith';
end $$;
