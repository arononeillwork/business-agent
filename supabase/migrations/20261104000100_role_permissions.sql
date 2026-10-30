-- Role permissions: what a role in Roles & responsibilities lets its people do, area by area
-- (shared/roles.ts, ROLE_AREAS). Each area is Hidden (left out of their menu), Read (what the team has
-- always had there) or Update (what an admin does there). An area a role doesn't name is Read.
-- Someone in several roles gets the most any of them gives; admins can do everything as before.
--
-- Update is checked here, by can_update(area): the policies below let it write where only admins
-- could, and the functions that refused anyone but an admin now ask it instead. Hidden is only the
-- menu's; what the team could always read, they still can.
--   rota       shifts (drafts too), sending the rota
--   timeoff    everyone's requests and allowances; approving or declining (not their own)
--   timecards  everyone's hours and corrections; editing (not their own), adding, deciding
--              corrections (not their own), approving the week, filling it from the rota
--   calendar   events, the admins-only ones too
--   stock      the items (and the suppliers to pick from)
--   foodsafety what's checked
--   waste      changing and taking off anyone's waste entries
--   todo       the categories

alter table public.job_roles
  add column permissions jsonb not null default '{}',
  add column template text check (char_length(template) <= 60);

create or replace function public.job_role_permissions() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if jsonb_typeof(new.permissions) is distinct from 'object' then raise exception 'Permissions must be a list of areas'; end if;
  if exists (select 1 from jsonb_each(new.permissions) e
             where e.key not in ('rota', 'timeoff', 'timecards', 'calendar', 'stock', 'foodsafety', 'waste', 'todo')
                or jsonb_typeof(e.value) is distinct from 'string' or e.value #>> '{}' not in ('none', 'read', 'update')) then
    raise exception 'Each area is none, read or update: rota, timeoff, timecards, calendar, stock, foodsafety, waste or todo';
  end if;
  -- Everyone has their own shifts, holidays and hours: those can't be hidden.
  new.permissions := (select coalesce(jsonb_object_agg(e.key,
                        case when e.key in ('rota', 'timeoff', 'timecards') and e.value = '"none"' then '"read"'::jsonb else e.value end), '{}')
                        from jsonb_each(new.permissions) e);
  new.template := nullif(btrim(new.template), '');
  return new;
end $$;
create trigger job_roles_permissions before insert or update on public.job_roles
  for each row execute function public.job_role_permissions();

-- Whether the person asking may change an area: an admin, or someone on the team in a role with Update.
create or replace function public.can_update(p_area text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_admin() or (public.is_staff() and exists (
    select 1 from public.job_roles r where (select auth.uid()) = any(r.people) and r.permissions ->> p_area = 'update'))
$$;
alter function public.can_update(text) owner to app_definer;
revoke execute on function public.can_update(text) from public, anon;
grant execute on function public.can_update(text) to authenticated;

-- Tables: added next to the admins' policies (either one lets them through).
create policy shifts_role_read on public.shifts for select to authenticated using ((select public.can_update('rota')));
create policy shifts_role_write on public.shifts for all to authenticated
  using ((select public.can_update('rota'))) with check ((select public.can_update('rota')));
create policy time_off_role_read on public.time_off for select to authenticated using ((select public.can_update('timeoff')));
create policy leave_allowances_role_read on public.leave_allowances for select to authenticated using ((select public.can_update('timeoff')));
create policy time_entries_role_read on public.time_entries for select to authenticated using ((select public.can_update('timecards')));
create policy breaks_role_read on public.breaks for select to authenticated using ((select public.can_update('timecards')));
create policy time_entry_changes_role_read on public.time_entry_changes for select to authenticated using ((select public.can_update('timecards')));
create policy corrections_role_read on public.correction_requests for select to authenticated using ((select public.can_update('timecards')));
create policy calendar_role_read on public.calendar_events for select to authenticated using ((select public.can_update('calendar')));
create policy calendar_role_write on public.calendar_events for all to authenticated
  using ((select public.can_update('calendar'))) with check ((select public.can_update('calendar')));
create policy stock_items_role_write on public.stock_items for all to authenticated
  using ((select public.can_update('stock'))) with check ((select public.can_update('stock')));
create policy suppliers_role_read on public.suppliers for select to authenticated using ((select public.can_update('stock')));
create policy food_safety_points_role_write on public.food_safety_points for all to authenticated
  using ((select public.can_update('foodsafety'))) with check ((select public.can_update('foodsafety')));
create policy todo_categories_role_write on public.todo_categories for all to authenticated
  using ((select public.can_update('todo'))) with check ((select public.can_update('todo')));

-- Functions: as before, asking can_update() where they asked is_admin().

create or replace function public.send_rota(p_week_start date)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tz   text := public.business_tz();
  v_from timestamptz := (p_week_start::timestamp) at time zone v_tz;
  v_to   timestamptz := ((p_week_start + 7)::timestamp) at time zone v_tz;
  v_n    int := 0;
  r      record;
begin
  if not public.can_update('rota') then raise exception 'Only an admin can send the rota'; end if;
  for r in
    select p.id, p.full_name,
           string_agg(to_char(s.starts_at at time zone v_tz, 'Dy DD') || ' ' ||
                      to_char(s.starts_at at time zone v_tz, 'HH24:MI') || '-' ||
                      to_char(s.ends_at at time zone v_tz, 'HH24:MI'), ', ' order by s.starts_at) as lines
      from public.shifts s join public.profiles p on p.id = s.profile_id
     where s.status = 'published' and s.starts_at >= v_from and s.starts_at < v_to
     group by p.id, p.full_name
  loop
    if public._enqueue_whatsapp(r.id, 'rota_published',
         array[split_part(r.full_name, ' ', 1), to_char(p_week_start, 'DD/MM'), r.lines],
         'rota:' || p_week_start || ':' || r.id || ':' || extract(epoch from now())::bigint / 600) is not null then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

create or replace function public.decide_time_off(p_id uuid, p_approve boolean, p_note text default null, p_release_shifts boolean default true)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row  public.time_off;
  v_tz   text := public.business_tz();
  v_n    int := 0;
begin
  if not public.can_update('timeoff') then raise exception 'Only an admin can decide time off'; end if;
  select * into v_row from public.time_off where id = p_id for update;
  if v_row.profile_id = auth.uid() and not public.is_admin() then raise exception 'Ask a manager to decide your own time off'; end if;
  if v_row.status <> 'pending' then raise exception 'This request is already %', v_row.status; end if;
  update public.time_off set status = case when p_approve then 'approved' else 'declined' end,
         decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(p_note), '')
   where id = p_id;
  if p_approve and p_release_shifts then
    update public.shifts set profile_id = null,
           note = coalesce(note || ' · ', '') || 'Released: ' || (select full_name from public.profiles where id = v_row.profile_id) || ' off'
     where profile_id = v_row.profile_id
       and starts_at >= (v_row.starts_on::timestamp) at time zone v_tz
       and starts_at < ((v_row.ends_on + 1)::timestamp) at time zone v_tz;
    get diagnostics v_n = row_count;
  end if;
  perform public._enqueue_whatsapp(v_row.profile_id, 'time_off_decided',
    array[split_part((select full_name from public.profiles where id = v_row.profile_id), ' ', 1),
          to_char(v_row.starts_on, 'DD/MM') || case when v_row.ends_on <> v_row.starts_on then '–' || to_char(v_row.ends_on, 'DD/MM') else '' end,
          case when p_approve then 'approved' else 'declined' end],
    'timeoff-dec:' || p_id);
  return v_n;
end;
$$;

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
  if not public.can_update('timecards') then
    raise exception 'Only an admin can edit timecards. Request a correction instead.';
  end if;
  if not public.is_admin() and exists (select 1 from public.time_entries where id = p_entry_id and profile_id = auth.uid()) then
    raise exception 'Ask a manager to change your own timecard. Request a correction instead.';
  end if;
  return public._apply_time_edit(p_entry_id, p_clock_in, p_clock_out, p_reason);
end;
$$;

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
  if not public.can_update('timecards') then
    raise exception 'Only an admin can add timecards';
  end if;
  if p_profile_id = auth.uid() and not public.is_admin() then
    raise exception 'Ask a manager to add your own timecard';
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

create or replace function public.decide_correction(p_request_id uuid, p_approve boolean, p_note text default null)
returns public.correction_requests
language plpgsql security definer
set search_path = ''
as $$
declare
  v_req public.correction_requests;
begin
  if not public.can_update('timecards') then
    raise exception 'Only an admin can decide corrections';
  end if;
  select * into v_req from public.correction_requests where id = p_request_id for update;
  if v_req.profile_id = auth.uid() and not public.is_admin() then
    raise exception 'Ask a manager to decide your own correction';
  end if;
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
  if not public.can_update('timecards') then
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
  if not public.can_update('timecards') then
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

create or replace function public.undo_waste(p_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = ''
as $$
declare m public.stock_movements;
begin
  if not public.is_staff() then raise exception 'Only the team changes the waste log' using errcode = '42501'; end if;
  select * into m from public.stock_movements where id = p_id for update;
  if not found or m.reason <> 'waste' then raise exception 'That isn’t on the waste log' using errcode = 'P0002'; end if;
  if m."by" is distinct from auth.uid() and not public.can_update('waste') then
    raise exception 'Only an admin or whoever logged it can change it' using errcode = '42501';
  end if;
  if m.undone_at is not null then raise exception 'That’s already off the waste log' using errcode = '22023'; end if;
  update public.stock_movements set undone_at = now(), undone_by = auth.uid() where id = p_id;
  -- Goes through stock_move like any other, so the item's figure follows.
  insert into public.stock_movements (item_id, reason, change, note)
    values (m.item_id, 'correction', -m.change, coalesce(nullif(btrim(p_note), ''), 'Taken off the waste log'));
end $$;
