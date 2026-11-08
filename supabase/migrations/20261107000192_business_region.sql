-- Spain's regions. A business in Spain now has a region: its autonomous community, or Ceuta or Melilla, by
-- its ISO 3166-2:ES code (shared/regions.ts), asked when it's added and on the Business page. Each night it
-- gets that region's public holidays for this year and next with the national ones, from the Ministry of
-- Labour's list in the BOE (worker/holidays.ts, worker/regionalHolidays.ts). Without one, the national ones
-- only, as before. create_business() is as it was: the app saves the region straight after, as any change.

alter table public.business add column region text
  constraint business_region_check check (region in ('AN', 'AR', 'AS', 'IB', 'CN', 'CB', 'CM', 'CL', 'CT', 'EX', 'GA', 'MD', 'MC', 'NC', 'PV', 'RI', 'VC', 'CE', 'ML'));

-- Easy Beans Coffee (business 1) is in San Pedro de Alcántara, Marbella: Andalucía. Its 2026 Andalucía
-- holidays, put on its calendar by its seed (supabase/seed/easy_beans.sql), take the names the nightly job
-- gives a region's (es-an-2026-02-28), so they aren't added a second time. Easy Beans is business 1 when it's
-- named so or Aron is on its team; anywhere else nothing changes, and running it again changes nothing.
do $$
begin
  if not exists (select 1 from public.business b
                  where b.id = 1 and b.country = 'ES'
                    and (b.name ~* 'easy\s*beans'
                         or exists (select 1 from public.profiles p where p.business_id = 1 and p.full_name ~* '^\s*aron\M'))) then
    return;
  end if;
  -- Named, so the rules see Easy Beans (a migration runs signed out).
  perform set_config('app.business_id', '1', true);
  update public.business set region = 'AN' where id = 1 and region is null;
  update public.calendar_events e set external_id = 'es-' || e.external_id
   where e.business_id = 1 and e.source = 'import' and e.external_id ~ '^an-\d{4}-\d{2}-\d{2}$'
     and not exists (select 1 from public.calendar_events x
                      where x.business_id = 1 and x.source = 'import' and x.external_id = 'es-' || e.external_id);
end $$;
