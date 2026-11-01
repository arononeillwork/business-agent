-- Easy Beans' café TV on Screens (business 1): the slideshow the TV plays, made of the two pages it's
-- used for, both from the café's own website: the menu board (easybeanscoffee.com/display-menu, the
-- page the TV shows now; loaded afresh each time, so the prices follow the till) and the monthly €10
-- competition with its "scan to enter" code. Made once, only if the café has no screen yet; the TV then
-- opens this screen's link (Screens → Café TV) instead of the menu board's address.

do $$
begin
  if not exists (select 1 from public.business where id = 1) or exists (select 1 from public.screens where business_id = 1) then return; end if;
  -- Named, so the screen's rules and the audit see Easy Beans (a migration runs signed out).
  perform set_config('app.business_id', '1', true);
  insert into public.screens (business_id, name, seconds, transition, slides)
  values (1, 'Café TV', 30, 'fade', jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'kind', 'web', 'url', 'https://www.easybeanscoffee.com/display-menu', 'design_id', null,
                       'title', 'Menu', 'seconds', 45, 'live', true, 'active', true),
    jsonb_build_object('id', gen_random_uuid(), 'kind', 'web', 'url', 'https://www.easybeanscoffee.com/es/competition', 'design_id', null,
                       'title', 'Competition: win €10 every month', 'seconds', 20, 'live', true, 'active', true)));
  perform set_config('app.business_id', '', true);
end $$;
