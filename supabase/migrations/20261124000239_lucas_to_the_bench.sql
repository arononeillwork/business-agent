-- People (the admin area's People, /admin), HQ's: Lucas, the Azure cloud person (the lucas_azure_cloud
-- migration), moves from the team to the substitutes bench. On the bench nobody reports to him and he
-- reports to nobody (admin_people_rules clears it), as for everyone on the bench.
--
-- Only a row, Business Agent HQ's own. Only while he's still on the team: someone who already moved
-- him in the app keeps their change. A brand-new database runs `select public.start_lucas_to_the_bench();`
-- after `select public.start_lucas_azure_cloud();`.
create or replace function public.start_lucas_to_the_bench() returns void
language plpgsql set search_path = ''
as $$
declare v_hq int := (select id from public.business where is_hq);
begin
  if v_hq is null then return; end if;
  perform set_config('app.business_id', v_hq::text, true);
  update public.admin_people set kind = 'bench'
   where business_id = v_hq and name = 'Lucas' and kind = 'team';
  perform set_config('app.business_id', '', true);
end $$;
revoke execute on function public.start_lucas_to_the_bench() from public, anon, authenticated, service_role;

select public.start_lucas_to_the_bench();
