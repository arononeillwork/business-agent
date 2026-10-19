-- Time tracking rules. All clock times come from the database clock (now()), never the device.
-- Timecards are corrected, never deleted, and every correction is logged with a reason.

-- ---------------------------------------------------------------------------
-- Flags for a timecard: missed break, over daily limit, etc.
-- Keeps flags that are not recalculated here (unscheduled, auto_clock_out, edited, early_override).
-- ---------------------------------------------------------------------------
create or replace function public._compute_flags(p_entry_id uuid)
returns text[]
language plpgsql security definer
set search_path = ''
as $$
declare
  v_entry  public.time_entries;
  v_set    public.settings;
  v_total  numeric;
  v_breaks numeric;
  v_flags  text[];
begin
  select * into v_entry from public.time_entries where id = p_entry_id;
  select * into v_set from public.settings where id = 1;

  v_flags := array(select f from unnest(v_entry.flags) f
                   where f not in ('missed_break', 'over_daily_limit'));

  if v_entry.clock_out is null then
    return v_flags;
  end if;

  v_total := extract(epoch from (v_entry.clock_out - v_entry.clock_in)) / 60;
  select coalesce(sum(extract(epoch from (coalesce(ended_at, v_entry.clock_out) - started_at)) / 60), 0)
    into v_breaks
    from public.breaks where time_entry_id = p_entry_id;

  if v_total > coalesce(v_set.break_after_hours, 6) * 60
     and v_breaks < coalesce(v_set.min_break_minutes, 15) then
    v_flags := array_append(v_flags, 'missed_break');
  end if;
  if v_total - v_breaks > coalesce(v_set.max_daily_hours, 9) * 60 then
    v_flags := array_append(v_flags, 'over_daily_limit');
  end if;
  return v_flags;
end;
$$;

-- ---------------------------------------------------------------------------
-- Core punch logic, shared by phone, kiosk, REST and AI.
-- ---------------------------------------------------------------------------
create or replace function public._clock_in(
  p_profile_id  uuid,
  p_source      text,
  p_position_id int default null,
  p_override    boolean default false
)
returns public.time_entries
language plpgsql security definer
set search_path = ''
as $$
declare
  v_set    public.settings;
  v_shift  public.shifts;
  v_flags  text[] := '{}';
  v_tz     text := public.business_tz();
  v_entry  public.time_entries;
begin
  if not exists (select 1 from public.profiles
                 where id = p_profile_id and active and role in ('admin', 'employee')) then
    raise exception 'This person cannot clock in';
  end if;
  if exists (select 1 from public.time_entries where profile_id = p_profile_id and clock_out is null) then
    raise exception 'Already clocked in';
  end if;

  select * into v_set from public.settings where id = 1;

  if p_source = 'phone' and v_set.phone_clock_in = 'off' then
    raise exception 'Clock-in from phones is turned off. Please use the café tablet.';
  end if;

  -- The person's shift closest to now that hasn't ended yet (within 12 hours).
  select * into v_shift
    from public.shifts
   where profile_id = p_profile_id
     and status = 'published'
     and ends_at > now()
     and starts_at < now() + interval '12 hours'
   order by abs(extract(epoch from (starts_at - now())))
   limit 1;

  if v_shift.id is not null then
    if now() < v_shift.starts_at - make_interval(mins => v_set.early_clock_in_minutes) then
      if not p_override then
        raise exception 'Too early: your shift starts at %. You can clock in from %.',
          to_char(v_shift.starts_at at time zone v_tz, 'HH24:MI'),
          to_char((v_shift.starts_at - make_interval(mins => v_set.early_clock_in_minutes)) at time zone v_tz, 'HH24:MI');
      end if;
      v_flags := array_append(v_flags, 'early_override');
    end if;
  else
    if v_set.unscheduled_clock_in = 'block' and not p_override then
      raise exception 'You have no shift scheduled now. Ask an admin to add one or to override.';
    end if;
    v_flags := array_append(v_flags, 'unscheduled');
  end if;

  insert into public.time_entries (profile_id, position_id, shift_id, clock_in, source, flags)
  values (p_profile_id, coalesce(p_position_id, v_shift.position_id), v_shift.id, now(), p_source, v_flags)
  returning * into v_entry;

  return v_entry;
end;
$$;

create or replace function public._clock_out(p_profile_id uuid, p_source text)
returns public.time_entries
language plpgsql security definer
set search_path = ''
as $$
declare
  v_entry public.time_entries;
begin
  select * into v_entry from public.time_entries
   where profile_id = p_profile_id and clock_out is null
   for update;
  if v_entry.id is null then
    raise exception 'Not clocked in';
  end if;

  update public.breaks set ended_at = now()
   where time_entry_id = v_entry.id and ended_at is null;

  update public.time_entries set clock_out = now(), clock_out_source = p_source
   where id = v_entry.id;

  update public.time_entries set flags = public._compute_flags(v_entry.id)
   where id = v_entry.id
  returning * into v_entry;

  return v_entry;
end;
$$;

create or replace function public._start_break(p_profile_id uuid, p_break_type_id int default null)
returns public.breaks
language plpgsql security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
  v_break    public.breaks;
begin
  select id into v_entry_id from public.time_entries
   where profile_id = p_profile_id and clock_out is null;
  if v_entry_id is null then
    raise exception 'Not clocked in';
  end if;
  if exists (select 1 from public.breaks where time_entry_id = v_entry_id and ended_at is null) then
    raise exception 'Already on a break';
  end if;
  insert into public.breaks (time_entry_id, break_type_id, started_at)
  values (v_entry_id, p_break_type_id, now())
  returning * into v_break;
  return v_break;
end;
$$;

create or replace function public._end_break(p_profile_id uuid)
returns public.breaks
language plpgsql security definer
set search_path = ''
as $$
declare
  v_break public.breaks;
begin
  update public.breaks b set ended_at = now()
    from public.time_entries t
   where b.time_entry_id = t.id
     and t.profile_id = p_profile_id
     and t.clock_out is null
     and b.ended_at is null
  returning b.* into v_break;
  if v_break.id is null then
    raise exception 'Not on a break';
  end if;
  return v_break;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public API for the signed-in person (phone, REST, AI).
-- Admins may act for someone else (p_profile_id) and override the early/unscheduled check.
-- ---------------------------------------------------------------------------
create or replace function public._resolve_actor(p_profile_id uuid)
returns uuid
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if p_profile_id is null or p_profile_id = auth.uid() then
    return auth.uid();
  end if;
  if not public.is_admin() then
    raise exception 'Only an admin can clock in or out for someone else';
  end if;
  return p_profile_id;
end;
$$;

create or replace function public._surface()
returns text
language sql stable
set search_path = ''
as $$
  select case public.request_via() when 'ai' then 'ai' when 'api' then 'api' else 'phone' end;
$$;

create or replace function public.clock_in(
  p_position_id int default null,
  p_profile_id  uuid default null,
  p_override    boolean default false
)
returns public.time_entries
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := public._resolve_actor(p_profile_id);
begin
  if p_override and not public.is_admin() then
    raise exception 'Only an admin can override clock-in rules';
  end if;
  return public._clock_in(
    v_actor,
    case when v_actor <> auth.uid() then 'manual' else public._surface() end,
    p_position_id,
    p_override);
end;
$$;

create or replace function public.clock_out(p_profile_id uuid default null)
returns public.time_entries
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := public._resolve_actor(p_profile_id);
begin
  return public._clock_out(v_actor, case when v_actor <> auth.uid() then 'manual' else public._surface() end);
end;
$$;

create or replace function public.start_break(p_break_type_id int default null, p_profile_id uuid default null)
returns public.breaks
language plpgsql security definer
set search_path = ''
as $$
begin
  return public._start_break(public._resolve_actor(p_profile_id), p_break_type_id);
end;
$$;

create or replace function public.end_break(p_profile_id uuid default null)
returns public.breaks
language plpgsql security definer
set search_path = ''
as $$
begin
  return public._end_break(public._resolve_actor(p_profile_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Kiosk (café tablet). The tablet signs in as a 'kiosk' account, which can only list names
-- and punch with a 4-digit PIN.
-- ---------------------------------------------------------------------------
create table public.kiosk_attempts (
  id          bigserial primary key,
  profile_id  uuid not null,
  at          timestamptz not null default now(),
  ok          boolean not null
);
alter table public.kiosk_attempts enable row level security;
revoke all on public.kiosk_attempts from anon, authenticated;

create or replace function public.kiosk_roster()
returns table (id uuid, full_name text, colour text, status text, since timestamptz, has_pin boolean)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if public.my_role() not in ('kiosk', 'admin') then
    raise exception 'Kiosk only';
  end if;
  return query
  select p.id, p.full_name, p.colour,
         case when b.id is not null then 'break'
              when t.id is not null then 'in'
              else 'out' end,
         coalesce(b.started_at, t.clock_in),
         p.pin_hash is not null
    from public.profiles p
    left join public.time_entries t on t.profile_id = p.id and t.clock_out is null
    left join public.breaks b on b.time_entry_id = t.id and b.ended_at is null
   where p.active and p.role in ('admin', 'employee')
   order by p.full_name;
end;
$$;

create or replace function public.kiosk_punch(
  p_profile_id    uuid,
  p_pin           text,
  p_action        text,
  p_position_id   int default null,
  p_break_type_id int default null
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_hash    text;
  v_fails   int;
  v_entry   public.time_entries;
  v_break   public.breaks;
begin
  if public.my_role() is distinct from 'kiosk' then
    raise exception 'Kiosk only';
  end if;

  select count(*) into v_fails from public.kiosk_attempts
   where profile_id = p_profile_id and not ok and at > now() - interval '10 minutes';
  if v_fails >= 5 then
    raise exception 'Too many wrong PINs. Try again in 10 minutes or ask an admin.';
  end if;

  select pin_hash into v_hash from public.profiles where id = p_profile_id and active;
  if v_hash is null then
    raise exception 'No PIN set. Ask an admin to set your PIN.';
  end if;
  if v_hash <> extensions.crypt(p_pin, v_hash) then
    insert into public.kiosk_attempts (profile_id, ok) values (p_profile_id, false);
    raise exception 'Wrong PIN';
  end if;
  insert into public.kiosk_attempts (profile_id, ok) values (p_profile_id, true);

  case p_action
    when 'in' then
      v_entry := public._clock_in(p_profile_id, 'kiosk', p_position_id, false);
    when 'out' then
      v_entry := public._clock_out(p_profile_id, 'kiosk');
    when 'break_start' then
      v_break := public._start_break(p_profile_id, p_break_type_id);
    when 'break_end' then
      v_break := public._end_break(p_profile_id);
    else
      raise exception 'Unknown action %', p_action;
  end case;

  return jsonb_build_object(
    'action', p_action,
    'at', now(),
    'full_name', (select full_name from public.profiles where id = p_profile_id),
    'entry', to_jsonb(v_entry),
    'break', to_jsonb(v_break),
    'summary', case when p_action = 'out' then
      (select to_jsonb(s) from public.time_entry_totals s where s.id = v_entry.id) end
  );
end;
$$;

-- Set your own PIN, or (admins) anyone's.
create or replace function public.set_pin(p_pin text, p_profile_id uuid default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_target uuid := coalesce(p_profile_id, auth.uid());
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if v_target <> auth.uid() and not public.is_admin() then
    raise exception 'Only an admin can set someone else''s PIN';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be 4 digits';
  end if;
  update public.profiles
     set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf'))
   where id = v_target;
end;
$$;

-- The guard trigger blocks pin_hash changes by non-admins; set_pin is the sanctioned path,
-- so let it through when the target is the caller.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    if new.role is distinct from old.role
       or new.can_see_pay is distinct from old.can_see_pay
       or new.active is distinct from old.active
       or (new.pin_hash is distinct from old.pin_hash and old.id <> auth.uid()) then
      raise exception 'Only an admin can change role, pay access, status or PIN';
    end if;
  end if;
  if old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active) then
    if not exists (select 1 from public.profiles
                   where role = 'admin' and active and id <> old.id) then
      raise exception 'At least one admin must remain';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Corrections
-- ---------------------------------------------------------------------------
create or replace function public._apply_time_edit(
  p_entry_id  uuid,
  p_clock_in  timestamptz,
  p_clock_out timestamptz,
  p_reason    text
)
returns public.time_entries
language plpgsql security definer
set search_path = ''
as $$
declare
  v_old public.time_entries;
  v_new public.time_entries;
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required';
  end if;
  select * into v_old from public.time_entries where id = p_entry_id for update;
  if v_old.id is null then
    raise exception 'Timecard not found';
  end if;
  if p_clock_in > now() or p_clock_out > now() then
    raise exception 'Times cannot be in the future';
  end if;

  update public.time_entries
     set clock_in  = coalesce(p_clock_in, clock_in),
         clock_out = coalesce(p_clock_out, clock_out),
         clock_out_source = case when p_clock_out is not null and clock_out is null then 'manual'
                                 else clock_out_source end,
         flags = array(select distinct f from unnest(flags || '{edited}'::text[]) f)
   where id = p_entry_id;

  update public.time_entries set flags = public._compute_flags(p_entry_id)
   where id = p_entry_id
  returning * into v_new;

  insert into public.time_entry_changes (time_entry_id, changed_by, via, reason, old_values, new_values)
  values (p_entry_id, auth.uid(), public.request_via(), p_reason,
          jsonb_build_object('clock_in', v_old.clock_in, 'clock_out', v_old.clock_out),
          jsonb_build_object('clock_in', v_new.clock_in, 'clock_out', v_new.clock_out));
  return v_new;
end;
$$;

-- Admin edit. Works on approved weeks too (only admins get here), and is logged.
create or replace function public.edit_time_entry(
  p_entry_id  uuid,
  p_clock_in  timestamptz default null,
  p_clock_out timestamptz default null,
  p_reason    text default null
)
returns public.time_entries
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can edit timecards. Request a correction instead.';
  end if;
  return public._apply_time_edit(p_entry_id, p_clock_in, p_clock_out, p_reason);
end;
$$;

-- Admin adds a missing timecard (e.g. forgot to clock in at all).
create or replace function public.add_time_entry(
  p_profile_id  uuid,
  p_clock_in    timestamptz,
  p_clock_out   timestamptz,
  p_reason      text,
  p_position_id int default null
)
returns public.time_entries
language plpgsql security definer
set search_path = ''
as $$
declare
  v_entry public.time_entries;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can add timecards';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required';
  end if;
  if p_clock_out > now() then
    raise exception 'Times cannot be in the future';
  end if;
  insert into public.time_entries (profile_id, position_id, clock_in, clock_out, source, clock_out_source, flags)
  values (p_profile_id, p_position_id, p_clock_in, p_clock_out, 'manual', 'manual', '{edited}')
  returning * into v_entry;
  update public.time_entries set flags = public._compute_flags(v_entry.id)
   where id = v_entry.id returning * into v_entry;
  insert into public.time_entry_changes (time_entry_id, changed_by, via, reason, old_values, new_values)
  values (v_entry.id, auth.uid(), public.request_via(), p_reason, null,
          jsonb_build_object('clock_in', p_clock_in, 'clock_out', p_clock_out));
  return v_entry;
end;
$$;

create or replace function public.request_correction(
  p_entry_id  uuid,
  p_clock_in  timestamptz,
  p_clock_out timestamptz,
  p_note      text
)
returns public.correction_requests
language plpgsql security definer
set search_path = ''
as $$
declare
  v_entry public.time_entries;
  v_req   public.correction_requests;
  v_days  int;
begin
  select * into v_entry from public.time_entries where id = p_entry_id;
  if v_entry.id is null or v_entry.profile_id <> auth.uid() then
    raise exception 'You can only request corrections to your own timecards';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'Please add a note explaining the correction';
  end if;
  select correction_expiry_days into v_days from public.settings where id = 1;
  insert into public.correction_requests
    (time_entry_id, profile_id, requested_clock_in, requested_clock_out, note, expires_at)
  values (p_entry_id, auth.uid(), p_clock_in, p_clock_out, p_note,
          now() + make_interval(days => coalesce(v_days, 30)))
  returning * into v_req;
  return v_req;
end;
$$;

create or replace function public.decide_correction(p_request_id uuid, p_approve boolean, p_note text default null)
returns public.correction_requests
language plpgsql security definer
set search_path = ''
as $$
declare
  v_req public.correction_requests;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can decide corrections';
  end if;
  select * into v_req from public.correction_requests where id = p_request_id for update;
  if v_req.status <> 'pending' then
    raise exception 'This request is already %', v_req.status;
  end if;
  if v_req.expires_at < now() then
    update public.correction_requests set status = 'expired' where id = p_request_id;
    raise exception 'This request has expired';
  end if;
  if p_approve then
    perform public._apply_time_edit(
      v_req.time_entry_id, v_req.requested_clock_in, v_req.requested_clock_out,
      'Correction request approved: ' || v_req.note || coalesce(' (' || p_note || ')', ''));
  end if;
  update public.correction_requests
     set status = case when p_approve then 'approved' else 'declined' end,
         decided_by = auth.uid(), decided_at = now(), decision_note = p_note
   where id = p_request_id
  returning * into v_req;
  return v_req;
end;
$$;

-- ---------------------------------------------------------------------------
-- Weekly approval: locks closed timecards for the week starting p_week_start (a Monday).
-- ---------------------------------------------------------------------------
create or replace function public.approve_week(p_week_start date)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tz    text := public.business_tz();
  v_from  timestamptz := (p_week_start::timestamp) at time zone v_tz;
  v_to    timestamptz := ((p_week_start + 7)::timestamp) at time zone v_tz;
  v_count int;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can approve timecards';
  end if;
  if exists (select 1 from public.time_entries
             where clock_in >= v_from and clock_in < v_to and clock_out is null) then
    raise exception 'Someone is still clocked in for that week';
  end if;
  update public.time_entries
     set approved_at = now(), approved_by = auth.uid()
   where clock_in >= v_from and clock_in < v_to and approved_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Auto clock-out, run every few minutes by the Worker cron (service role).
-- Closes timecards that are well past the scheduled shift end, or, without a shift,
-- past closing time + grace. Flagged 'auto_clock_out' for review.
-- ---------------------------------------------------------------------------
create or replace function public.auto_close_entries()
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_set    public.settings;
  v_tz     text := public.business_tz();
  v_hours  jsonb;
  v_count  int := 0;
  r        record;
  v_close  timestamptz;
  v_day    text;
  v_local  date;
begin
  select * into v_set from public.settings where id = 1;
  select opening_hours into v_hours from public.business where id = 1;

  for r in
    select t.id, t.profile_id, t.clock_in, s.ends_at
      from public.time_entries t
      left join public.shifts s on s.id = t.shift_id
     where t.clock_out is null
  loop
    v_close := null;
    if r.ends_at is not null then
      v_close := r.ends_at + make_interval(mins => v_set.auto_clock_out_minutes);
    else
      v_local := (r.clock_in at time zone v_tz)::date;
      v_day := lower(to_char(v_local, 'Dy'));
      if v_hours -> v_day ->> 'close' is not null then
        v_close := ((v_local + (v_hours -> v_day ->> 'close')::time)::timestamp at time zone v_tz)
                   + make_interval(mins => v_set.forgot_clock_out_grace_minutes);
      else
        v_close := r.clock_in + interval '12 hours';
      end if;
    end if;

    if v_close is not null and v_close < now() and v_close > r.clock_in then
      update public.breaks set ended_at = least(v_close, now())
       where time_entry_id = r.id and ended_at is null;
      update public.time_entries
         set clock_out = v_close,
             clock_out_source = 'auto',
             flags = array(select distinct f from unnest(flags || '{auto_clock_out}'::text[]) f)
       where id = r.id;
      update public.time_entries set flags = public._compute_flags(r.id) where id = r.id;
      v_count := v_count + 1;
    end if;
  end loop;

  update public.correction_requests set status = 'expired'
   where status = 'pending' and expires_at < now();

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff take an open shift (blocked if it clashes with one of their own).
-- ---------------------------------------------------------------------------
create or replace function public.take_open_shift(p_shift_id uuid)
returns public.shifts
language plpgsql security definer
set search_path = ''
as $$
declare
  v_shift public.shifts;
begin
  if not public.is_staff() then
    raise exception 'Not allowed';
  end if;
  select * into v_shift from public.shifts
   where id = p_shift_id and profile_id is null and status = 'published' for update;
  if v_shift.id is null then
    raise exception 'That shift is no longer open';
  end if;
  if exists (select 1 from public.shifts
             where profile_id = auth.uid()
               and tstzrange(starts_at, ends_at) && tstzrange(v_shift.starts_at, v_shift.ends_at)) then
    raise exception 'It clashes with one of your shifts';
  end if;
  update public.shifts set profile_id = auth.uid() where id = p_shift_id returning * into v_shift;
  return v_shift;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function permissions: internal helpers are not callable from the API.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

revoke execute on function
  public._compute_flags(uuid),
  public._clock_in(uuid, text, int, boolean),
  public._clock_out(uuid, text),
  public._start_break(uuid, int),
  public._end_break(uuid),
  public._apply_time_edit(uuid, timestamptz, timestamptz, text),
  public.auto_close_entries(),
  public.handle_new_user(),
  public.guard_profile_update(),
  public.audit_row(),
  public.touch_updated()
from authenticated;

grant execute on function public.auto_close_entries() to service_role;
