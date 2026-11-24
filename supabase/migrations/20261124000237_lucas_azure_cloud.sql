-- People (the admin area's People, /admin), HQ's: Lucas, HQ's Azure cloud person, on the team,
-- reporting to Aron, after everyone already there.
--
-- Only a row, Business Agent HQ's own. Once: Lucas only when nobody on HQ's People has his first name.
-- A brand-new database runs `select public.start_lucas_azure_cloud();` after
-- `select public.start_admin_area_people();` and `select public.start_lawyer_and_investors();`.
create or replace function public.start_lucas_azure_cloud() returns void
language plpgsql set search_path = ''
as $$
declare v_hq int := (select id from public.business where is_hq);
begin
  if v_hq is null then return; end if;
  perform set_config('app.business_id', v_hq::text, true);

  if not exists (select 1 from public.admin_people where business_id = v_hq and lower(split_part(btrim(name), ' ', 1)) = 'lucas') then
    insert into public.admin_people (business_id, name, role, kind, position, reports_to)
    values (v_hq, 'Lucas', 'Azure Cloud', 'team',
            (select coalesce(max(position), 0) + 1 from public.admin_people where business_id = v_hq),
            (select id from public.admin_people where business_id = v_hq and kind = 'team' and name = 'Aron' order by position limit 1));
  end if;
  perform set_config('app.business_id', '', true);
end $$;
revoke execute on function public.start_lucas_azure_cloud() from public, anon, authenticated, service_role;

select public.start_lucas_azure_cloud();
