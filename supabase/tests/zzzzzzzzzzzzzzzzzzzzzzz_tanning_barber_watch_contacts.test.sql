-- More businesses on HQ's sales board (the tanning_barber_watch_contacts migration): each in the right lane,
-- as the right kind of business, in the right place, once, whatever is run again. HQ and its sales team
-- were made by earlier tests.
select set_config('test.hq', (select id::text from public.business where is_hq), false);
select public.start_tanning_barber_watch_contacts();
select public.start_tanning_barber_watch_contacts();
do $$
declare v_hq int := current_setting('test.hq')::int;
begin
  assert (select string_agg(p.name || '@' || m.name || ':' || p.business_type || ':' || p.kind || ':' || coalesce(p.town, '-') || ':' || coalesce(p.country, '-'),
                            ', ' order by p.name)
            from public.sales_prospects p join public.sales_team m on m.id = p.member_id
           where p.business_id = v_hq and p.instagram in ('the_tanning_suite_marbella', 'uppercutsbarbersmarbella', 'lunawatchstr'))
    = 'Luna Watch@Mark:other:customer:-:-, The Tanning Suite@Mark:other:customer:Marbella:ES, Uppercuts Barbers@Ryan:barber:customer:Marbella:ES',
    'the contacts, once each, in the right lanes';
end $$;
