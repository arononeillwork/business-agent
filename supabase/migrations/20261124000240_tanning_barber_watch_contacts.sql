-- More businesses on HQ's sales board (the admin area's Sales, /admin), each in its salesperson's lane, as
-- the more_sales_contacts migration added others:
--
--   Mark: The Tanning Suite in Marbella (random: a tanning salon), Luna Watch in Spain (random: a watch shop)
--   Ryan: Uppercuts Barbers in Marbella (a barber)
--
-- Only rows, Business Agent HQ's own: nothing the live code reads differently. A contact already on the
-- board, by its Instagram or its name, is left as it is, so running it again changes nothing.
-- A brand-new database runs `select public.start_tanning_barber_watch_contacts();` after
-- `select public.start_admin_area_people();`, which puts Mark and Ryan on the sales team.
create or replace function public.start_tanning_barber_watch_contacts() returns void
language plpgsql set search_path = ''
as $$
declare
  v_hq int := (select id from public.business where is_hq);
  r record;
begin
  if v_hq is null then return; end if;
  perform set_config('app.business_id', v_hq::text, true);
  for r in select * from (values
      ('Mark', 'The Tanning Suite', 'the_tanning_suite_marbella', 'Marbella', 'other', 'ES'),
      ('Ryan', 'Uppercuts Barbers', 'uppercutsbarbersmarbella', 'Marbella', 'barber', 'ES'),
      ('Mark', 'Luna Watch', 'lunawatchstr', null, 'other', 'ES')) c(who, name, instagram, town, business_type, country)
  loop
    if not exists (select 1 from public.sales_prospects
                    where business_id = v_hq and (instagram = r.instagram or public.sales_name_key(name) = public.sales_name_key(r.name))) then
      insert into public.sales_prospects (business_id, member_id, name, instagram, town, kind, business_type, country)
      values (v_hq, (select id from public.sales_team where business_id = v_hq and lower(split_part(btrim(name), ' ', 1)) = lower(r.who)
                      order by position limit 1),
              r.name, r.instagram, r.town, 'customer', r.business_type, r.country);
    end if;
  end loop;
  perform set_config('app.business_id', '', true);
end $$;
revoke execute on function public.start_tanning_barber_watch_contacts() from public, anon, authenticated, service_role;

select public.start_tanning_barber_watch_contacts();
