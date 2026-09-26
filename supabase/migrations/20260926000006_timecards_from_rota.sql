-- Automatic timecards: when someone was on the published rota but has no clock-in for that
-- shift, create the timecard from the rota so the week is never missing hours. Flagged
-- 'from_rota' and logged, so an admin can check it before approving the week.
alter table public.settings add column auto_timecards_from_rota boolean not null default true;

alter table public.time_entries drop constraint time_entries_source_check;
alter table public.time_entries add constraint time_entries_source_check
  check (source in ('kiosk', 'phone', 'manual', 'api', 'ai', 'rota'));
alter table public.time_entries drop constraint time_entries_clock_out_source_check;
alter table public.time_entries add constraint time_entries_clock_out_source_check
  check (clock_out_source in ('kiosk', 'phone', 'manual', 'api', 'ai', 'auto', 'rota'));

-- Fills one business-local day. Returns how many timecards were created.
create or replace function public._fill_timecards_for_day(p_date date)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tz    text := public.business_tz();
  v_from  timestamptz := (p_date::timestamp) at time zone v_tz;
  v_to    timestamptz := ((p_date + 1)::timestamp) at time zone v_tz;
  v_count int := 0;
  r       record;
  v_id    uuid;
begin
  if p_date >= (now() at time zone v_tz)::date then
    raise exception 'Only past days can be filled from the rota';
  end if;
  for r in
    select s.* from public.shifts s
      join public.profiles p on p.id = s.profile_id and p.active
     where s.status = 'published' and s.starts_at >= v_from and s.starts_at < v_to
       and not exists (
         select 1 from public.time_entries t
          where t.profile_id = s.profile_id
            and t.clock_in < s.ends_at + interval '2 hours'
            and coalesce(t.clock_out, now()) > s.starts_at - interval '2 hours')
  loop
    insert into public.time_entries (profile_id, position_id, shift_id, clock_in, clock_out, source, clock_out_source, flags)
    values (r.profile_id, r.position_id, r.id, r.starts_at, r.ends_at, 'rota', 'rota', '{from_rota}')
    returning id into v_id;
    if r.break_minutes > 0 then
      -- Scheduled break placed mid-shift (unpaid unless a paid break type is recorded later).
      insert into public.breaks (time_entry_id, started_at, ended_at)
      values (v_id, r.starts_at + (r.ends_at - r.starts_at) / 2,
              r.starts_at + (r.ends_at - r.starts_at) / 2 + make_interval(mins => r.break_minutes));
    end if;
    update public.time_entries set flags = public._compute_flags(v_id) where id = v_id;
    insert into public.time_entry_changes (time_entry_id, changed_by, via, reason, old_values, new_values)
    values (v_id, auth.uid(), case when auth.uid() is null then 'auto' else public.request_via() end,
            'Filled from the rota: no clock-in was recorded for this shift', null,
            jsonb_build_object('clock_in', r.starts_at, 'clock_out', r.ends_at));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Nightly job (Worker cron, service key): fill yesterday if the setting is on.
create or replace function public.auto_fill_timecards()
returns int
language plpgsql security definer
set search_path = ''
as $$
begin
  if not coalesce((select auto_timecards_from_rota from public.settings where id = 1), false) then
    return 0;
  end if;
  return public._fill_timecards_for_day(((now() at time zone public.business_tz())::date) - 1);
end;
$$;

-- Admins: fill every past day of a week (week_start = Monday) now.
create or replace function public.fill_timecards_from_rota(p_week_start date)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone public.business_tz())::date;
  v_total int := 0;
  d       date;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can fill timecards from the rota';
  end if;
  for d in select generate_series(p_week_start, p_week_start + 6, interval '1 day')::date loop
    if d < v_today then
      v_total := v_total + public._fill_timecards_for_day(d);
    end if;
  end loop;
  return v_total;
end;
$$;

revoke execute on function public._fill_timecards_for_day(date), public.auto_fill_timecards() from public, anon, authenticated;
revoke execute on function public.fill_timecards_from_rota(date) from public, anon;
grant execute on function public.fill_timecards_from_rota(date) to authenticated;
grant execute on function public.auto_fill_timecards() to service_role;
