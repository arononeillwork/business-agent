-- People (the admin area's People, /admin), HQ's:
--   - Eduardo, HQ's lawyer, on the team, reporting to Aron;
--   - Eric Lein, an investor, at the top of the investors;
--   - every investor labelled C TWO.
--
-- Only rows, Business Agent HQ's own. Once: Eduardo and Eric Lein only when nobody on HQ's People has
-- their name; a label only where it isn't already. A brand-new database runs
-- `select public.start_lawyer_and_investors();` after `select public.start_admin_area_people();`.
create or replace function public.start_lawyer_and_investors() returns void
language plpgsql set search_path = ''
as $$
declare v_hq int := (select id from public.business where is_hq);
begin
  if v_hq is null then return; end if;
  perform set_config('app.business_id', v_hq::text, true);

  if not exists (select 1 from public.admin_people where business_id = v_hq and lower(split_part(btrim(name), ' ', 1)) = 'eduardo') then
    insert into public.admin_people (business_id, name, role, kind, position, reports_to)
    values (v_hq, 'Eduardo', 'Lawyer', 'team',
            (select coalesce(max(position), 0) + 1 from public.admin_people where business_id = v_hq),
            (select id from public.admin_people where business_id = v_hq and kind = 'team' and name = 'Aron' order by position limit 1));
  end if;

  -- The investors are shown in order of position: one before the first is at the top.
  if not exists (select 1 from public.admin_people where business_id = v_hq and lower(btrim(name)) = 'eric lein') then
    insert into public.admin_people (business_id, name, role, kind, position)
    values (v_hq, 'Eric Lein', 'Investor', 'investor',
            (select coalesce(min(position), 1) - 1 from public.admin_people where business_id = v_hq and kind = 'investor'));
  end if;

  update public.admin_people set labels = labels || '{C TWO}'::text[]
   where business_id = v_hq and kind = 'investor' and not ('C TWO' = any (labels));
  perform set_config('app.business_id', '', true);
end $$;
revoke execute on function public.start_lawyer_and_investors() from public, anon, authenticated, service_role;

select public.start_lawyer_and_investors();
