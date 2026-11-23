-- More businesses on HQ's sales board (the admin area's Sales, /admin): two barbers and three cafés, each
-- in its salesperson's lane, as the admin_area_people migration added the first ones.
--
--   Aron:  Harrison's Barbershop (a barber), Dailys Brunch (a café)
--   Julio: Alma Specialty Coffee (a café)
--   Ryan:  Six Barbershop in Nueva Andalucía (a barber, by its Google Maps link), Beïty Marbella (a café)
--
-- Only rows, Business Agent HQ's own: nothing the live code reads differently. A contact already on the
-- board, by its Instagram or its name, is left as it is, so running it again changes nothing.
create or replace function public.start_more_sales_contacts() returns void
language plpgsql set search_path = ''
as $$
declare
  v_hq int := (select id from public.business where is_hq);
  r record;
begin
  if v_hq is null then return; end if;
  perform set_config('app.business_id', v_hq::text, true);
  for r in select * from (values
      ('Aron', 'Harrison''s Barbershop', 'harrisonsbarbershop', null, null, 'barber'),
      ('Aron', 'Dailys Brunch', 'dailysbrunch', null, null, 'cafe'),
      ('Julio', 'Alma Specialty Coffee', 'alma.specialtycoffee', null, null, 'cafe'),
      ('Ryan', 'Six Barbershop', null, 'https://maps.app.goo.gl/L8c6xX7WXuwBPomi8', 'Nueva Andalucía', 'barber'),
      ('Ryan', 'Beïty Marbella', 'beity_marbella', null, null, 'cafe')) c(who, name, instagram, website, town, business_type)
  loop
    if not exists (select 1 from public.sales_prospects
                    where business_id = v_hq and (instagram = r.instagram or public.sales_name_key(name) = public.sales_name_key(r.name))) then
      insert into public.sales_prospects (business_id, member_id, name, instagram, website, town, kind, business_type)
      values (v_hq, (select id from public.sales_team where business_id = v_hq and lower(split_part(btrim(name), ' ', 1)) = lower(r.who)
                      order by position limit 1),
              r.name, r.instagram, r.website, r.town, 'customer', r.business_type);
    end if;
  end loop;
  perform set_config('app.business_id', '', true);
end $$;
revoke execute on function public.start_more_sales_contacts() from public, anon, authenticated, service_role;

select public.start_more_sales_contacts();
