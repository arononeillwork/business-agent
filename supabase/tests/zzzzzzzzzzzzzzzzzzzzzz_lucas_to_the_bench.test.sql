-- HQ's people (the lucas_to_the_bench migration): Lucas, the Azure cloud person, from the team to the
-- substitutes bench, reporting to nobody; run twice, the same. HQ's people as a new database starts them
-- (an earlier test may leave others), then the change.
select set_config('test.hq', (select id::text from public.business where is_hq), false);
delete from public.admin_people where business_id = current_setting('test.hq')::int;
select public.start_admin_area_people();
select public.start_lawyer_and_investors();
select public.start_lucas_azure_cloud();
select public.start_lucas_to_the_bench();
select public.start_lucas_to_the_bench();
do $$
declare v_hq int := current_setting('test.hq')::int;
begin
  assert (select kind = 'bench' and reports_to is null and role = 'Azure Cloud'
            from public.admin_people where business_id = v_hq and name = 'Lucas'), 'Lucas on the bench, the Azure cloud person, reporting to nobody';
  assert (select count(*) from public.admin_people where business_id = v_hq and name = 'Lucas') = 1, 'once';
  assert (select string_agg(p.name, ', ' order by p.position)
            from public.admin_people p join public.admin_people b on b.id = p.reports_to where p.business_id = v_hq and b.name = 'Aron')
    = 'Alejandro, Kim, Zoe, Eduardo', 'Aron''s team without him';
  assert (select string_agg(name, ', ' order by position) from public.admin_people where business_id = v_hq and kind = 'bench')
    = 'Adrian Goulding, Jesus Maria Herruzo Luque, Antonio Trupac, Cathrine Naess, Lucas', 'at the end of the bench';
end $$;

-- Someone who already moved him in the app keeps their change.
do $$
declare v_hq int := current_setting('test.hq')::int;
begin
  perform set_config('app.business_id', v_hq::text, true);
  update public.admin_people set kind = 'investor' where business_id = v_hq and name = 'Lucas';
  perform set_config('app.business_id', '', true);
  perform public.start_lucas_to_the_bench();
  assert (select kind from public.admin_people where business_id = v_hq and name = 'Lucas') = 'investor', 'left where the app put him';
end $$;
