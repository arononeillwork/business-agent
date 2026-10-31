-- Bank holiday reminders the day before too: besides the reminder a week ahead (or however many days
-- an admin picks), every admin is reminded again the day before each holiday. On for every business
-- unless an admin turns it off (Notifications page → Bank holiday reminders).

alter table public.settings add column holiday_reminder_day_before boolean not null default true;

-- The day the holiday was on when admins got the day-before reminder (moved: reminded again).
alter table public.holiday_reminders add column day_before_for date;

-- Every minute (each business): from 09:00 the business's time, remind admins about the holidays
-- coming up within the days set, once each, and again the day before. Nothing earlier, so phones
-- don't buzz at night.
-- p_now: the time to act as (the tests' 09:00); the job passes nothing.
create or replace function public.bank_holiday_reminders(p_now timestamptz default now())
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_set record; v record; n int := 0;
  v_tz text := public.business_tz();
  v_now timestamp := p_now at time zone v_tz;
  v_today date := v_now::date;
  v_days int;
begin
  select holiday_reminders, holiday_reminder_days, holiday_reminder_kinds, holiday_reminder_day_before
    into v_set from public.settings where id = 1;
  if not found or not v_set.holiday_reminders or v_now::time < time '09:00' then return 0; end if;
  for v in
    select e.id, e.title, e.starts_on, e.category, e.town
      from public.calendar_events e
      left join public.holiday_reminders r on r.event_id = e.id
     where e.confirmed and e.category = any (v_set.holiday_reminder_kinds)
       and e.starts_on between v_today and v_today + v_set.holiday_reminder_days
       and coalesce(r.remind, true)
       and (r.sent_for is distinct from e.starts_on
            or (v_set.holiday_reminder_day_before and e.starts_on = v_today + 1 and r.day_before_for is distinct from e.starts_on))
     order by e.starts_on
     limit 20
  loop
    v_days := v.starts_on - v_today;
    insert into public.notifications (profile_id, title, body, link, kind, data)
    select p.id,
           'Bank holiday ' || case when v_days = 0 then 'today' when v_days = 1 then 'tomorrow'
                                   else 'in ' || v_days || ' days' end || ': ' || v.title,
           to_char(v.starts_on, 'FMDay FMDD FMMonth') || ' · '
             || case v.category when 'national' then 'National holiday' when 'regional' then 'Regional holiday'
                                when 'local' then 'Local holiday' || coalesce(' (' || v.town || ')', '')
                                else 'Holiday nearby' || coalesce(' (' || v.town || ')', '') end
             || '. Check the rota and the opening hours.',
           '/calendar', 'bank_holiday',
           jsonb_build_object('event', v.id, 'date', v.starts_on, 'days', v_days, 'name', v.title, 'category', v.category, 'town', v.town)
      from public.profiles p where p.role = 'admin' and p.active;
    -- One a day or less ahead counts as the day-before reminder too.
    insert into public.holiday_reminders (event_id, sent_for, sent_at, day_before_for, updated_by)
      values (v.id, v.starts_on, now(), case when v_days <= 1 then v.starts_on end, null)
      on conflict (business_id, event_id) do update set sent_for = excluded.sent_for, sent_at = excluded.sent_at,
        day_before_for = coalesce(excluded.day_before_for, public.holiday_reminders.day_before_for);
    n := n + 1;
  end loop;
  return n;
end $$;
alter function public.bank_holiday_reminders(timestamptz) owner to app_definer;
revoke execute on function public.bank_holiday_reminders(timestamptz) from public, anon, authenticated;
