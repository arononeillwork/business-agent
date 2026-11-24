-- Repeating the rota (Rota → Repeat week): a week of the rota copied onto the weeks after it, either once
-- for a few weeks ("next week only", "the next 2 weeks") or kept going as a continuous rota. For a
-- continuous rota the week's shifts are saved here as they were, so changing that week later changes
-- nothing; the nightly job keeps the rota filled from them to the end of the fourth week after this one.
-- A change made on one week stays that week's; saving another week as the continuous rota replaces this
-- one. Copying replaces the shifts already on the weeks it goes onto, but never one that has started.
-- Who: whoever edits the rota (admins, and roles with Update on the rota); they also see what repeats.

create table public.rota_repeat (
  -- The Monday of the week the rota repeats.
  source_week   date not null check (extract(isodow from source_week) = 1),
  -- The last day the rota has been filled to from it.
  filled_until  date not null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users on delete set null default auth.uid()
);
select public.add_business_scope('public.rota_repeat');
alter table public.rota_repeat add primary key (business_id);
create index rota_repeat_updated_by_idx on public.rota_repeat (updated_by);

create table public.rota_repeat_shifts (
  id             uuid primary key default gen_random_uuid(),
  weekday        smallint not null check (weekday between 1 and 7),  -- 1 Monday … 7 Sunday
  starts         time not null,
  ends           time not null,                                       -- at or before starts: the next day
  profile_id     uuid references public.profiles on delete cascade,  -- none: an open shift
  position_id    int references public.positions on delete set null,
  break_minutes  int not null default 0 check (break_minutes >= 0),
  note           text
);
select public.add_business_scope('public.rota_repeat_shifts');
create index rota_repeat_shifts_profile_idx on public.rota_repeat_shifts (profile_id);
create index rota_repeat_shifts_position_idx on public.rota_repeat_shifts (position_id);

alter table public.rota_repeat enable row level security;
alter table public.rota_repeat_shifts enable row level security;
revoke all on public.rota_repeat, public.rota_repeat_shifts from anon;
-- Read by whoever edits the rota; written only through the functions below.
create policy rota_repeat_read on public.rota_repeat for select to authenticated
  using ((select public.can_update('rota')));
create policy rota_repeat_shifts_read on public.rota_repeat_shifts for select to authenticated
  using ((select public.can_update('rota')));

-- One shift onto the rota on a day, unless it would start before p_now, its person has left, is off the
-- rota or has approved time off that day, or they (or, for an open shift, an open shift at the same
-- times) are on already then. Says which: 'added', 'past', 'off', 'away' or 'busy'.
create or replace function public._rota_add(p_day date, p_profile uuid, p_position int, p_starts time, p_ends time,
  p_break int, p_note text, p_now timestamptz) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_tz   text := public.business_tz();
  v_from timestamptz := (p_day + p_starts) at time zone v_tz;
  v_to   timestamptz := (p_day + p_ends) at time zone v_tz;
begin
  if p_ends <= p_starts then v_to := ((p_day + 1) + p_ends) at time zone v_tz; end if;
  if v_from <= p_now then return 'past'; end if;
  if p_profile is not null then
    if not exists (select 1 from public.profiles where id = p_profile and business_id = public.current_business_id()
                     and active and on_rota is not false) then
      return 'off';
    end if;
    if exists (select 1 from public.time_off t where t.profile_id = p_profile and t.status = 'approved'
                 and p_day between t.starts_on and t.ends_on) then
      return 'away';
    end if;
    if exists (select 1 from public.shifts s where s.profile_id = p_profile and s.starts_at < v_to and s.ends_at > v_from) then
      return 'busy';
    end if;
  elsif exists (select 1 from public.shifts s where s.profile_id is null and s.starts_at = v_from and s.ends_at = v_to) then
    return 'busy';
  end if;
  insert into public.shifts (profile_id, position_id, starts_at, ends_at, break_minutes, note)
    values (p_profile, p_position, v_from, v_to, p_break, p_note);
  return 'added';
end $$;
alter function public._rota_add(date, uuid, int, time, time, int, text, timestamptz) owner to app_definer;
revoke execute on function public._rota_add(date, uuid, int, time, time, int, text, timestamptz) from public, anon, authenticated;

-- Copy the week starting p_week (any day of it) onto the weeks after it: p_weeks of them, or, with
-- p_continuous, to the end of the fourth week after this one and on from there every night. Shifts on
-- those weeks that haven't started are replaced. Returns what it did: { added, removed, away, until }
-- (away: shifts left off for someone's time off).
create or replace function public.repeat_rota_week(p_week date, p_weeks int default 1, p_continuous boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_tz      text := public.business_tz();
  v_now     timestamptz := now();
  v_today   date := (now() at time zone public.business_tz())::date;
  v_week    date := p_week - (extract(isodow from p_week)::int - 1);
  v_from    date := v_week + 7;
  v_until   date;
  v_removed int;
  v_added   int := 0;
  v_away    int := 0;
  v_did     text;
  d         date;
  s         record;
begin
  if not public.can_update('rota') then
    raise exception 'Only an admin can repeat the rota' using errcode = '42501';
  end if;
  if p_continuous then
    v_until := greatest(v_today - (extract(isodow from v_today)::int - 1) + 34, v_from + 6);
  elsif p_weeks is null or p_weeks not between 1 and 12 then
    raise exception 'Repeat it for 1 to 12 weeks' using errcode = '22023';
  else
    v_until := v_from + 7 * p_weeks - 1;
  end if;
  if not exists (select 1 from public.shifts
                  where starts_at >= (v_week::timestamp at time zone v_tz) and starts_at < (v_from::timestamp at time zone v_tz)) then
    raise exception 'There are no shifts that week to repeat' using errcode = '22023';
  end if;

  if p_continuous then
    delete from public.rota_repeat_shifts where business_id = public.current_business_id();
    insert into public.rota_repeat_shifts (weekday, starts, ends, profile_id, position_id, break_minutes, note)
      select extract(isodow from starts_at at time zone v_tz), (starts_at at time zone v_tz)::time,
             (ends_at at time zone v_tz)::time, profile_id, position_id, break_minutes, note
        from public.shifts
       where starts_at >= (v_week::timestamp at time zone v_tz) and starts_at < (v_from::timestamp at time zone v_tz);
    insert into public.rota_repeat (source_week, filled_until) values (v_week, v_until)
      on conflict (business_id) do update set source_week = excluded.source_week, filled_until = excluded.filled_until,
        updated_at = now(), updated_by = auth.uid();
  else
    -- Weeks filled by hand aren't filled again by a continuous rota.
    update public.rota_repeat set filled_until = v_until
     where business_id = public.current_business_id() and filled_until < v_until;
  end if;

  -- What's on those weeks and hasn't started makes way (the week copied is before them, so it stays).
  delete from public.shifts
   where starts_at >= (v_from::timestamp at time zone v_tz) and starts_at < ((v_until + 1)::timestamp at time zone v_tz)
     and starts_at > v_now;
  get diagnostics v_removed = row_count;

  for d in select generate_series(v_from, v_until, interval '1 day')::date loop
    for s in select (w.starts_at at time zone v_tz)::time as starts, (w.ends_at at time zone v_tz)::time as ends,
                    w.profile_id, w.position_id, w.break_minutes, w.note
               from public.shifts w
              where w.starts_at >= ((v_week + extract(isodow from d)::int - 1)::timestamp at time zone v_tz)
                and w.starts_at < ((v_week + extract(isodow from d)::int)::timestamp at time zone v_tz)
              order by w.starts_at loop
      v_did := public._rota_add(d, s.profile_id, s.position_id, s.starts, s.ends, s.break_minutes, s.note, v_now);
      if v_did = 'added' then v_added := v_added + 1; elsif v_did = 'away' then v_away := v_away + 1; end if;
    end loop;
  end loop;
  return jsonb_build_object('added', v_added, 'removed', v_removed, 'away', v_away, 'until', v_until);
end $$;
alter function public.repeat_rota_week(date, int, boolean) owner to app_definer;
revoke execute on function public.repeat_rota_week(date, int, boolean) from public, anon;
grant execute on function public.repeat_rota_week(date, int, boolean) to authenticated, service_role;

-- Stop the continuous rota: the weeks it already filled keep their shifts.
create or replace function public.stop_repeating_rota() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.can_update('rota') then
    raise exception 'Only an admin can change the rota' using errcode = '42501';
  end if;
  delete from public.rota_repeat_shifts where business_id = public.current_business_id();
  delete from public.rota_repeat where business_id = public.current_business_id();
end $$;
alter function public.stop_repeating_rota() owner to app_definer;
revoke execute on function public.stop_repeating_rota() from public, anon;
grant execute on function public.stop_repeating_rota() to authenticated, service_role;

-- The nightly job (the Worker, business by business): a continuous rota filled on to the end of the
-- fourth week after this one. The days it adds were never filled, so nothing is replaced: someone already
-- on then keeps what they have. Returns the shifts added.
create or replace function public.extend_repeating_rota(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_today date := (p_now at time zone public.business_tz())::date;
  v_until date := v_today - (extract(isodow from v_today)::int - 1) + 34;
  v_last  date;
  v_added int := 0;
  d       date;
  s       record;
begin
  select filled_until into v_last from public.rota_repeat where business_id = public.current_business_id();
  if v_last is null or v_last >= v_until then return 0; end if;
  for d in select generate_series(greatest(v_last + 1, v_today), v_until, interval '1 day')::date loop
    for s in select * from public.rota_repeat_shifts w
              where w.business_id = public.current_business_id() and w.weekday = extract(isodow from d) order by w.starts loop
      if public._rota_add(d, s.profile_id, s.position_id, s.starts, s.ends, s.break_minutes, s.note, p_now) = 'added' then
        v_added := v_added + 1;
      end if;
    end loop;
  end loop;
  update public.rota_repeat set filled_until = v_until where business_id = public.current_business_id();
  return v_added;
end $$;
alter function public.extend_repeating_rota(timestamptz) owner to app_definer;
revoke execute on function public.extend_repeating_rota(timestamptz) from public, anon, authenticated;
grant execute on function public.extend_repeating_rota(timestamptz) to service_role;
