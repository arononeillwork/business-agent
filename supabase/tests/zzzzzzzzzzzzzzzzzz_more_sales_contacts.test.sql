-- More businesses on HQ's sales board (the more_sales_contacts migration): each in the right lane, as the
-- right kind of business, once, whatever is run again. HQ and its sales team were made by earlier tests.
select set_config('test.hq', (select id::text from public.business where is_hq), false);
select public.start_more_sales_contacts();
select public.start_more_sales_contacts();
do $$
declare v_hq int := current_setting('test.hq')::int;
begin
  assert (select string_agg(p.name || '@' || m.name || ':' || p.business_type || ':' || p.kind, ', ' order by p.name)
            from public.sales_prospects p join public.sales_team m on m.id = p.member_id
           where p.business_id = v_hq and p.name in ('Alma Specialty Coffee', 'Beïty Marbella', 'Dailys Brunch', 'Harrison''s Barbershop', 'Six Barbershop'))
    = 'Alma Specialty Coffee@Julio Cesar:cafe:customer, Beïty Marbella@Ryan:cafe:customer, Dailys Brunch@Aron:cafe:customer, '
      'Harrison''s Barbershop@Aron:barber:customer, Six Barbershop@Ryan:barber:customer', 'the contacts, once each, in the right lanes';
  assert (select count(*) from public.sales_prospects
           where business_id = v_hq and instagram in ('harrisonsbarbershop', 'alma.specialtycoffee', 'dailysbrunch', 'beity_marbella')) = 4, 'by their Instagram';
  assert (select website = 'https://maps.app.goo.gl/L8c6xX7WXuwBPomi8' and town = 'Nueva Andalucía'
            from public.sales_prospects where business_id = v_hq and name = 'Six Barbershop'), 'Six Barbershop by its Google Maps link, in its town';
end $$;
