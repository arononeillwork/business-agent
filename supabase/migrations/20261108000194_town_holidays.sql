-- A Spanish town's two local holidays a year (fiestas locales). Each town hall picks its two and each
-- community's bulletin publishes them: about 8,000 towns and no national list, so the app asks for them
-- (shared/townHolidays.ts) rather than importing them.
--
-- 1. business.town: a business in Spain says its town, at sign-up or on Business (the app saves it with
--    the normal business update straight after create_business(), as it does the region).
-- 2. set_town_holidays(): an admin adds a year's two days in one go. They're local holidays on the
--    calendar whose ids start local- (local-2027-06-11), the year's own: next year's are asked for again.
--    The nightly import of the national and regional days (worker/holidays.ts) never touches them, and
--    adds none of its own on their dates.
-- 3. The reminder: when a year's aren't in (this year's at any time, next year's from December), the
--    nightly job tells the admins once, in a notification of its own kind (town_holidays).
-- 4. Easy Beans Coffee (business 1) is in Marbella: its 2026 and 2027 days, as the BOJA publishes them.

-- ---------------------------------------------------------------------------
-- 1. The town
-- ---------------------------------------------------------------------------
alter table public.business add column town text
  constraint business_town_check check (town is null or (char_length(town) between 1 and 80 and town = btrim(town)));

-- ---------------------------------------------------------------------------
-- 2. A year's two days
-- ---------------------------------------------------------------------------
-- p_year: this year or next (the business's time). p_days: its two days, different, in that year, neither
-- one of the calendar's national or regional holidays. They replace that year's: one on a date kept stays
-- as it was (its name, its reminders); a local holiday an admin added by hand on one of the dates becomes
-- the town's; the others go. A new one is called "Fiesta local".
create or replace function public.set_town_holidays(p_year int, p_days date[])
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_business public.business;
  v_this int := extract(year from now() at time zone public.business_tz())::int;
  v_clash record;
  v_day date;
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'Only an admin can add the local holidays'; end if;
  select * into v_business from public.business where id = public.current_business_id();
  if v_business.country = 'IE' then raise exception 'Local holidays are for a business in Spain'; end if;
  if v_business.town is null then raise exception 'Add your town on the Business page first'; end if;
  if p_year is null or p_year not between v_this and v_this + 1 then
    raise exception 'Only this year''s or next year''s local holidays can be added';
  end if;
  if coalesce(cardinality(p_days), 0) <> 2 or array_position(p_days, null) is not null then raise exception 'Pick both days'; end if;
  if exists (select 1 from unnest(p_days) d where extract(year from d)::int <> p_year) then
    raise exception 'Both days must be in %', p_year;
  end if;
  if p_days[1] = p_days[2] then raise exception 'Pick two different days'; end if;
  select e.starts_on, e.title into v_clash from public.calendar_events e
   where e.category in ('national', 'regional') and e.starts_on = any (p_days)
   order by e.starts_on limit 1;
  if found then raise exception '% is already a holiday: %', to_char(v_clash.starts_on, 'DD/MM/YYYY'), v_clash.title; end if;

  -- That year's on other dates go.
  delete from public.calendar_events e
   where e.category = 'local' and e.external_id like 'local-%'
     and e.starts_on between make_date(p_year, 1, 1) and make_date(p_year, 12, 31)
     and e.starts_on <> all (p_days);
  foreach v_day in array p_days loop
    -- The day's own: already the town's, else a local holiday added by hand that day.
    select e.id into v_id from public.calendar_events e
     where e.category = 'local' and e.starts_on = v_day
     order by coalesce(e.external_id like 'local-%', false) desc, e.created_at
     limit 1;
    -- Its id is the day's alone (one moved off it by hand gives it up).
    delete from public.calendar_events e where e.external_id = 'local-' || v_day and e.id is distinct from v_id;
    if v_id is null then
      insert into public.calendar_events (starts_on, title, category, town, source, external_id, confirmed, visibility)
      values (v_day, 'Fiesta local', 'local', v_business.town, 'admin', 'local-' || v_day, true, 'all');
    else
      update public.calendar_events
         set external_id = 'local-' || v_day, town = v_business.town, ends_on = null, starts_at = null, confirmed = true, visibility = 'all'
       where id = v_id;
    end if;
  end loop;
  return 2;
end $$;
alter function public.set_town_holidays(int, date[]) owner to app_definer;
revoke execute on function public.set_town_holidays(int, date[]) from public, anon;
grant execute on function public.set_town_holidays(int, date[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The reminder's notifications: kind town_holidays, data {year, town} (worker/holidays.ts)
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind is null or kind in ('instagram_mention', 'review', 'bank_holiday', 'test', 'town_holidays'));

-- ---------------------------------------------------------------------------
-- 4. Easy Beans Coffee: Marbella's days
-- ---------------------------------------------------------------------------
-- San Pedro de Alcántara is in the municipality of Marbella (Málaga, Andalucía). Its fiestas locales, as
-- the Junta de Andalucía publishes each year's for every municipality (Dirección General de Trabajo,
-- Seguridad y Salud Laboral), province of Málaga:
-- - 2026: 11 June and 19 October. Resolución de 6 de octubre de 2025, BOJA núm. 197, 14 October 2025,
--   annex p. 13517/14 (CVE 00327114); not changed by the corrections in BOJA núm. 247 of 24 December 2025,
--   núm. 33 of 18 February 2026 or núm. 79 of 27 April 2026.
-- - 2027: 11 June and 19 October. Resolución de 23 de octubre de 2026, BOJA núm. 210, 29 October 2026,
--   annex p. 14189/18 (CVE 00345419).
-- The BOJA gives the dates only: the names are those its 2026 days have on its calendar (San Bernabé,
-- Marbella's patron, and San Pedro de Alcántara). Its 2026 days, put there by its seed as
-- marbella-2026-06-11 and marbella-2026-10-19, take the town's ids. Easy Beans is business 1 when it's
-- named so or Aron is on its team; anywhere else nothing changes, and running it again changes nothing.
do $$
declare
  v record;
  v_id uuid;
begin
  if not exists (select 1 from public.business b
                  where b.id = 1 and b.country = 'ES'
                    and (b.name ~* 'easy\s*beans'
                         or exists (select 1 from public.profiles p where p.business_id = 1 and p.full_name ~* '^\s*aron\M'))) then
    return;
  end if;
  -- Named, so the rules see Easy Beans (a migration runs signed out).
  perform set_config('app.business_id', '1', true);
  update public.business set town = 'Marbella' where id = 1 and town is null;
  for v in
    select d::date as day, t as title
      from (values ('2026-06-11', 'San Bernabé'), ('2026-10-19', 'San Pedro de Alcántara'),
                   ('2027-06-11', 'San Bernabé'), ('2027-10-19', 'San Pedro de Alcántara')) x(d, t)
  loop
    continue when exists (select 1 from public.calendar_events e where e.business_id = 1 and e.external_id = 'local-' || v.day);
    select e.id into v_id from public.calendar_events e
     where e.business_id = 1 and e.category = 'local' and e.starts_on = v.day
     order by e.created_at limit 1;
    if v_id is null then
      insert into public.calendar_events (business_id, starts_on, title, category, town, source, external_id, confirmed)
      values (1, v.day, v.title, 'local', 'Marbella', 'import', 'local-' || v.day, true);
    else
      update public.calendar_events set external_id = 'local-' || v.day, town = coalesce(town, 'Marbella') where id = v_id;
    end if;
  end loop;
end $$;
