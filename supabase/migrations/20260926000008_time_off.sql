-- Time off: staff request holidays and days off themselves; admins approve or decline.
-- Approved time off blocks scheduling that person on those days.

alter table public.settings add column vacation_days_per_year int not null default 30;  -- Spain: 30 calendar days minimum

create table public.time_off (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references public.profiles on delete cascade,
  starts_on      date not null,
  ends_on        date not null,
  kind           text not null default 'vacation' check (kind in ('vacation', 'personal', 'sick', 'other')),
  note           text,
  status         text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  created_at     timestamptz not null default now(),
  decided_by     uuid references auth.users,
  decided_at     timestamptz,
  decision_note  text,
  check (ends_on >= starts_on)
);
create index time_off_profile_idx on public.time_off (profile_id, starts_on);

alter table public.time_off enable row level security;
-- Everyone sees approved time off (so the team knows who's away); pending/declined only yours or admins.
create policy time_off_read on public.time_off for select to authenticated
  using (profile_id = auth.uid() or public.is_admin() or (status = 'approved' and public.is_staff()));
revoke insert, update, delete on public.time_off from authenticated;

create trigger audit_time_off after insert or update or delete on public.time_off
  for each row execute function public.audit_row();

-- Calendar days of approved holiday used in a year.
create or replace function public.vacation_days_used(p_profile_id uuid, p_year int)
returns int
language sql stable security definer
set search_path = ''
as $$
  select coalesce(sum(least(ends_on, make_date(p_year, 12, 31)) - greatest(starts_on, make_date(p_year, 1, 1)) + 1), 0)::int
    from public.time_off
   where profile_id = p_profile_id and kind = 'vacation' and status in ('approved', 'pending')
     and starts_on <= make_date(p_year, 12, 31) and ends_on >= make_date(p_year, 1, 1);
$$;

create or replace function public.request_time_off(p_starts_on date, p_ends_on date, p_kind text default 'vacation', p_note text default null)
returns public.time_off
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row   public.time_off;
  v_days  int := p_ends_on - p_starts_on + 1;
  v_allow int;
  a       record;
begin
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  if p_ends_on < p_starts_on then raise exception 'The last day must be on or after the first day'; end if;
  if p_kind <> 'sick' and p_starts_on < (now() at time zone public.business_tz())::date then
    raise exception 'Holiday requests must be for today or later';
  end if;
  if exists (select 1 from public.time_off where profile_id = auth.uid() and status in ('pending', 'approved')
             and starts_on <= p_ends_on and ends_on >= p_starts_on) then
    raise exception 'You already have time off requested for some of those days';
  end if;
  if p_kind = 'vacation' then
    select vacation_days_per_year into v_allow from public.settings where id = 1;
    if public.vacation_days_used(auth.uid(), extract(year from p_starts_on)::int) + v_days > v_allow then
      raise exception 'That is more than your % holiday days for the year', v_allow;
    end if;
  end if;
  insert into public.time_off (profile_id, starts_on, ends_on, kind, note)
  values (auth.uid(), p_starts_on, p_ends_on, p_kind, nullif(btrim(p_note), ''))
  returning * into v_row;

  for a in select id from public.profiles where role = 'admin' and active and id <> auth.uid() loop
    perform public._enqueue_whatsapp(a.id, 'time_off_requested',
      array[(select full_name from public.profiles where id = auth.uid()),
            to_char(p_starts_on, 'DD/MM') || case when p_ends_on <> p_starts_on then '–' || to_char(p_ends_on, 'DD/MM') else '' end,
            p_kind], 'timeoff-req:' || v_row.id || ':' || a.id);
  end loop;
  return v_row;
end;
$$;

create or replace function public.cancel_time_off(p_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare v_row public.time_off;
begin
  select * into v_row from public.time_off where id = p_id for update;
  if v_row.id is null or (v_row.profile_id <> auth.uid() and not public.is_admin()) then
    raise exception 'Request not found';
  end if;
  if v_row.status not in ('pending', 'approved') then raise exception 'This request is already %', v_row.status; end if;
  if v_row.status = 'approved' and v_row.starts_on <= (now() at time zone public.business_tz())::date and not public.is_admin() then
    raise exception 'Time off that has started can only be changed by an admin';
  end if;
  update public.time_off set status = 'cancelled' where id = p_id;
end;
$$;

-- Admins: approve or decline. On approval, that person's shifts in the period can be turned
-- into open shifts (p_release_shifts) so someone else can cover them.
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
  if not public.is_admin() then raise exception 'Only an admin can decide time off'; end if;
  select * into v_row from public.time_off where id = p_id for update;
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

-- Nobody can be scheduled on approved time off.
create or replace function public.guard_shift_time_off()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare v_tz text := public.business_tz();
begin
  if new.profile_id is not null and exists (
    select 1 from public.time_off t
     where t.profile_id = new.profile_id and t.status = 'approved'
       and (new.starts_at at time zone v_tz)::date between t.starts_on and t.ends_on) then
    raise exception '% has approved time off that day', (select full_name from public.profiles where id = new.profile_id);
  end if;
  return new;
end;
$$;

create trigger shifts_time_off_guard before insert or update of profile_id, starts_at on public.shifts
  for each row execute function public.guard_shift_time_off();

revoke execute on function public.guard_shift_time_off() from public, anon, authenticated;
revoke execute on function public.request_time_off(date, date, text, text), public.cancel_time_off(uuid),
  public.decide_time_off(uuid, boolean, text, boolean), public.vacation_days_used(uuid, int) from public, anon;
grant execute on function public.request_time_off(date, date, text, text), public.cancel_time_off(uuid),
  public.decide_time_off(uuid, boolean, text, boolean), public.vacation_days_used(uuid, int) to authenticated;
