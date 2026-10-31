-- Easy Beans' rota (business 1): Mark and Maria work 9:00 to 15:00, the café's opening hours, on each
-- day it's open over the next eight weeks, from the day after this runs (nothing in the past, so no
-- timecards are filled in from it). A day either of them already has one shift on, that shift becomes
-- 9:00 to 15:00; a day with no shift gets one, published, as the position their role is worked as; a
-- day with more than one is left as it is, and so is a day on approved time off. "Copy last week" on
-- the Rota carries it on from there.
--
-- The rota shows just Aron, Mark and Maria: the shared "Owner" login is off it already (the
-- `people_page_and_pets` migration), and the live tests' @business-agent.test accounts are left out
-- by the app itself (shared/people.ts).

do $$
declare
  v_tz text;
  v_hours jsonb;
  v_from date;
  v_open jsonb;
  v_shifts int;
  p record;
  d date;
begin
  select timezone, opening_hours into v_tz, v_hours from public.business where id = 1;
  if v_tz is null then return; end if;
  -- Named, so the rules on shifts (business_tz(), the time-off check) see Easy Beans.
  perform set_config('app.business_id', '1', true);
  v_from := (now() at time zone v_tz)::date + 1;

  for p in
    select pr.id,
           (select j.position_id from public.job_roles j
             where j.business_id = 1 and pr.id = any(j.people) and j.position_id is not null
             order by j.sort, j.name limit 1) as position_id
      from public.profiles pr
     where pr.business_id = 1 and pr.role in ('admin', 'employee') and pr.active
       and pr.full_name ~* '^\s*(mark|mar[ií]a)\M'
       and coalesce(pr.email, '') !~* '@business-agent\.test$'
  loop
    for d in select g::date from generate_series(v_from, v_from + 55, interval '1 day') g loop
      v_open := v_hours -> lower(to_char(d, 'dy'));
      continue when v_open is null or jsonb_typeof(v_open) <> 'object' or coalesce(v_open ->> 'open', '') = '';
      continue when exists (select 1 from public.time_off t
                             where t.profile_id = p.id and t.status = 'approved' and d between t.starts_on and t.ends_on);
      select count(*) into v_shifts from public.shifts s where s.profile_id = p.id and (s.starts_at at time zone v_tz)::date = d;
      if v_shifts = 0 then
        insert into public.shifts (business_id, profile_id, position_id, starts_at, ends_at, status)
        values (1, p.id, p.position_id, (d + time '09:00') at time zone v_tz, (d + time '15:00') at time zone v_tz, 'published');
      elsif v_shifts = 1 then
        update public.shifts set starts_at = (d + time '09:00') at time zone v_tz, ends_at = (d + time '15:00') at time zone v_tz
         where profile_id = p.id and (starts_at at time zone v_tz)::date = d;
      end if;
    end loop;
  end loop;

  perform set_config('app.business_id', '', true);
end $$;
