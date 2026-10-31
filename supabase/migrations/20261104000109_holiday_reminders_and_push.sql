-- Bank holiday reminders and push notifications to phones.
--
-- 1. Bank holiday reminders: a week (or however many days an admin picks) before each public holiday
--    on the calendar, and again the day before, every admin gets a notification. On for every business
--    unless an admin turns it off (Notifications page), and any one holiday can be left out.
-- 2. Push: each person turns on notifications on their phone or computer (Notifications page), which
--    saves that device here. Every minute the Worker sends the notifications nobody has pushed yet to
--    their owner's devices (worker/push.ts), as each person chose: in the app, on the phone, or both
--    (profiles.preferences.notify).
-- Who: admins manage the holiday reminders; everyone manages their own devices.

-- ---------------------------------------------------------------------------
-- 1. Bank holiday reminders
-- ---------------------------------------------------------------------------
alter table public.settings
  add column holiday_reminders boolean not null default true,
  add column holiday_reminder_days int not null default 7 check (holiday_reminder_days between 1 and 60),
  -- A second reminder the day before.
  add column holiday_reminder_day_before boolean not null default true,
  add column holiday_reminder_kinds text[] not null default '{national,regional,local}'
    check (holiday_reminder_kinds <@ '{national,regional,local,area}'::text[]);

-- One row per holiday that's been reminded about, or that an admin left out.
create table public.holiday_reminders (
  event_id    uuid not null references public.calendar_events on delete cascade,
  -- False: an admin left this holiday out.
  remind      boolean not null default true,
  -- The day it was on when admins were reminded (a holiday moved to another day is reminded again).
  sent_for    date,
  sent_at     timestamptz,
  -- The same for the reminder the day before.
  day_before_for  date,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users on delete set null default auth.uid()
);
select public.add_business_scope('public.holiday_reminders');
alter table public.holiday_reminders add primary key (business_id, event_id);
alter table public.holiday_reminders enable row level security;
revoke all on public.holiday_reminders from anon;
create policy holiday_reminders_read on public.holiday_reminders for select to authenticated using ((select public.is_admin()));
revoke insert, update, delete on public.holiday_reminders from authenticated;

-- Admins leave a holiday out of the reminders, or put it back.
create or replace function public.set_holiday_reminder(p_event_id uuid, p_on boolean)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can change holiday reminders'; end if;
  if not exists (select 1 from public.calendar_events where id = p_event_id) then
    raise exception 'That holiday is no longer on the calendar';
  end if;
  insert into public.holiday_reminders (event_id, remind) values (p_event_id, p_on)
    on conflict (business_id, event_id) do update set remind = excluded.remind, updated_at = now(), updated_by = auth.uid();
  return p_on;
end $$;
alter function public.set_holiday_reminder(uuid, boolean) owner to app_definer;
revoke execute on function public.set_holiday_reminder(uuid, boolean) from public, anon;
grant execute on function public.set_holiday_reminder(uuid, boolean) to authenticated;

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

-- The jobs that run for each business: the same, plus holiday_reminders.
create or replace function public.each_business(p_job text)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  b int;
  v_failed int := 0;
begin
  if p_job not in ('auto_close_entries', 'queue_shift_alerts', 'deliver_event_alerts', 'queue_due_social_posts',
                   'auto_fill_timecards', 'licence_reminders', 'enquiry_follow_ups', 'campaign_reminders',
                   'bank_holiday_reminders') then
    raise exception 'Not a job that runs for each business: %', p_job;
  end if;
  for b in select id from public.business order by id loop
    perform set_config('app.business_id', b::text, true);
    begin
      execute format('select public.%I()', p_job);
    exception when others then
      v_failed := v_failed + 1;
      raise warning '% failed for business %: %', p_job, b, sqlerrm;
    end;
  end loop;
  perform set_config('app.business_id', '', true);
  return v_failed;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Notifications: new kinds, and which have gone to people's devices
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind is null or kind in ('instagram_mention', 'review', 'bank_holiday', 'test'));

-- When the Worker sent it to its person's devices (or found there was nowhere to send it). The ones
-- already here count as done, so nobody's phone gets the past all at once.
alter table public.notifications add column pushed_at timestamptz;
update public.notifications set pushed_at = created_at;
create index notifications_to_push_idx on public.notifications (created_at) where pushed_at is null;

-- "Send a test" on the Notifications page: one for yourself, which reaches your devices within a minute.
create or replace function public.send_me_test_notification()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if (select count(*) from public.notifications
       where profile_id = auth.uid() and kind = 'test' and created_at > now() - interval '1 minute') >= 3 then
    raise exception 'That''s plenty of tests for one minute';
  end if;
  insert into public.notifications (profile_id, title, body, link, kind)
  values (auth.uid(), 'Test notification', 'Notifications are working on this device.', '/notifications', 'test');
end $$;
alter function public.send_me_test_notification() owner to app_definer;
revoke execute on function public.send_me_test_notification() from public, anon;
grant execute on function public.send_me_test_notification() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Devices that get push notifications
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles on delete cascade default auth.uid(),
  -- Where the browser's push service takes them (Apple, Google, Mozilla…); one per device.
  endpoint    text not null check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  -- The browser's keys for encrypting what's sent (base64url).
  p256dh      text not null check (char_length(p256dh) between 40 and 200),
  auth        text not null check (char_length(auth) between 10 and 100),
  -- What it is, to tell them apart in the list ("iPhone · Safari").
  device      text check (char_length(device) <= 80),
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz,
  failures    int not null default 0
);
select public.add_business_scope('public.push_subscriptions');
alter table public.push_subscriptions add constraint push_subscriptions_endpoint_key unique (business_id, endpoint);
create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
create policy push_subscriptions_own on public.push_subscriptions for select to authenticated using (profile_id = (select auth.uid()));
create policy push_subscriptions_remove on public.push_subscriptions for delete to authenticated using (profile_id = (select auth.uid()));
revoke insert, update on public.push_subscriptions from authenticated;

-- Save this device for the person signed in. A device someone else used before (a shared tablet)
-- becomes theirs: one device, one person.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_device text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if (select count(*) from public.push_subscriptions where profile_id = auth.uid() and endpoint <> p_endpoint) >= 10 then
    raise exception 'Up to 10 devices each: remove one first';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and profile_id <> auth.uid();
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, device)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, nullif(left(btrim(p_device), 80), ''))
  on conflict (business_id, endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device, failures = 0
  returning id into v_id;
  return v_id;
end $$;
alter function public.save_push_subscription(text, text, text, text) owner to app_definer;
revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
