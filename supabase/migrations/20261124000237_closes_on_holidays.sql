-- Whether the business closes on public holidays (Opening hours → "We close on public holidays", kept with
-- its Google Maps connection), for the whole team: the Rota shows those days closed and warns of shifts on
-- them, as Google Maps and the website show them (shared/closures.ts). The connection itself stays the
-- admins' (integrations_read); this is the one setting, for whoever sees the rota.
create or replace function public.closes_on_holidays() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select (i.external ->> 'closed_on_holidays')::boolean
                     from public.integrations i
                    where i.provider = 'google_business' and i.business_id = public.current_business_id()), false)
$$;
alter function public.closes_on_holidays() owner to app_definer;
revoke execute on function public.closes_on_holidays() from public, anon;
grant execute on function public.closes_on_holidays() to authenticated, service_role;
