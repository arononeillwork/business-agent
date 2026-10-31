-- Easy Beans' rota (business 1): Mark and Maria on 9:00–15:00 every day the café is open (Monday to
-- Saturday) for the four weeks the rota is out (2–28 November 2026), as Maria already is. A day
-- either already has a shift on, or is on approved time off, is left as it is. With nobody of that name
-- there, nothing is added. Mark works it as the owner (the Propietario position), Maria as Barista.
do $$
declare
  v_person record;
  v_day date;
  v_position int;
begin
  for v_person in
    select p.id, p.full_name, (p.full_name ~* '^\s*mark\M') as owner from public.profiles p
     where p.business_id = 1 and p.active and p.role in ('admin', 'employee')
       and (p.full_name ~* '^\s*mark\M' or p.full_name ~* '^\s*maria\M')
  loop
    select id into v_position from public.positions
     where business_id = 1 and name = case when v_person.owner then 'Propietario' else 'Barista' end limit 1;
    if v_position is null then
      select id into v_position from public.positions where business_id = 1 and name = 'Barista' limit 1;
    end if;
    for v_day in select d::date from generate_series(date '2026-11-02', date '2026-11-28', interval '1 day') d
                  where extract(isodow from d) between 1 and 6 loop
      continue when exists (select 1 from public.shifts s
                             where s.profile_id = v_person.id
                               and (s.starts_at at time zone 'Europe/Madrid')::date = v_day);
      continue when exists (select 1 from public.time_off o
                             where o.profile_id = v_person.id and o.status = 'approved'
                               and v_day between o.starts_on and o.ends_on);
      insert into public.shifts (business_id, profile_id, position_id, starts_at, ends_at, break_minutes, status)
      values (1, v_person.id, v_position,
              (v_day + time '09:00') at time zone 'Europe/Madrid',
              (v_day + time '15:00') at time zone 'Europe/Madrid', 0, 'published');
    end loop;
    v_position := null;
  end loop;
end $$;
