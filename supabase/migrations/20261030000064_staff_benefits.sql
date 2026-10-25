-- Staff benefits: what the team gets (Spain's legal minimum, from shared/benefits.ts, and what the
-- business gives on top), and each person's allocation for the year.
-- - time_off records every kind of leave the law gives (birth, marriage, a relative in hospital,
--   bereavement…), not just holidays, so the page can count each person's sick days and other leave.
-- - benefits: the business's own amount and notes for one of the law's (law_key), or a benefit of
--   its own (a staff meal, a birthday off). The team reads; admins change them.
-- - leave_allowances: one person's holiday for a year when it isn't settings.vacation_days_per_year
--   (they started part-way through, days carried over after a long sick leave). Requests check it.
-- - record_time_off(): admins record leave for someone (a sick note, birth leave), approved already.

alter table public.time_off drop constraint time_off_kind_check;
alter table public.time_off add constraint time_off_kind_check check (kind in
  ('vacation', 'personal', 'sick', 'birth', 'parental', 'marriage', 'family', 'bereavement', 'moving', 'urgent', 'other'));

create table public.benefits (
  id          uuid primary key default gen_random_uuid(),
  -- One of the law's entitlements (shared/benefits.ts), or null for one of the business's own.
  law_key     text unique check (law_key ~ '^[a-z_]{2,40}$'),
  name        text check (char_length(name) between 1 and 120),
  -- More than the law gives, in that entitlement's unit (days, weeks…).
  amount      numeric(5, 1) check (amount between 0 and 999),
  details     text check (char_length(details) <= 2000),
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users on delete set null default auth.uid(),
  constraint benefits_named check (law_key is not null or name is not null)
);

create or replace function public.benefit_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.name := nullif(btrim(new.name), '');
  new.details := nullif(btrim(new.details), '');
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger benefits_rules before insert or update on public.benefits for each row execute function public.benefit_rules();
create trigger audit_benefits after insert or update or delete on public.benefits for each row execute function public.audit_row();

alter table public.benefits enable row level security;
revoke all on public.benefits from anon;
create policy benefits_read on public.benefits for select to authenticated
  using ((select public.is_staff()) or (select public.partner_can('payroll')));
create policy benefits_admin on public.benefits for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create table public.leave_allowances (
  profile_id    uuid not null references public.profiles on delete cascade,
  year          int not null check (year between 2000 and 2100),
  holiday_days  numeric(4, 1) not null check (holiday_days between 0 and 366),
  note          text check (char_length(note) <= 500),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users on delete set null default auth.uid(),
  primary key (profile_id, year)
);
create trigger audit_leave_allowances after insert or update or delete on public.leave_allowances
  for each row execute function public.audit_row();

alter table public.leave_allowances enable row level security;
revoke all on public.leave_allowances from anon;
create policy leave_allowances_read on public.leave_allowances for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_admin()) or (select public.partner_can('payroll')));
create policy leave_allowances_admin on public.leave_allowances for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Someone's holiday for a year: their own when an admin set one, else the business's.
create or replace function public.holiday_allowance(p_profile_id uuid, p_year int)
returns numeric
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select holiday_days from public.leave_allowances where profile_id = p_profile_id and year = p_year),
                  (select vacation_days_per_year from public.settings where id = 1));
$$;

-- As before (migration 8), with the new kinds: leave nobody books ahead can be for days already
-- gone, and holiday is checked against the person's own allowance for that year.
create or replace function public.request_time_off(p_starts_on date, p_ends_on date, p_kind text default 'vacation', p_note text default null)
returns public.time_off
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row   public.time_off;
  v_days  int := p_ends_on - p_starts_on + 1;
  v_allow numeric;
  a       record;
begin
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  if p_ends_on < p_starts_on then raise exception 'The last day must be on or after the first day'; end if;
  if p_kind not in ('sick', 'birth', 'family', 'bereavement', 'urgent')
     and p_starts_on < (now() at time zone public.business_tz())::date then
    raise exception 'Holiday requests must be for today or later';
  end if;
  if exists (select 1 from public.time_off where profile_id = auth.uid() and status in ('pending', 'approved')
             and starts_on <= p_ends_on and ends_on >= p_starts_on) then
    raise exception 'You already have time off requested for some of those days';
  end if;
  if p_kind = 'vacation' then
    v_allow := public.holiday_allowance(auth.uid(), extract(year from p_starts_on)::int);
    if public.vacation_days_used(auth.uid(), extract(year from p_starts_on)::int) + v_days > v_allow then
      raise exception 'That is more than your % holiday days for the year', trim_scale(v_allow);
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

-- Admins: record leave for someone (a sick note, birth leave, a bereavement), approved already.
-- Their shifts in the period become open shifts, as when a request is approved. Returns how many.
create or replace function public.record_time_off(p_profile_id uuid, p_starts_on date, p_ends_on date,
  p_kind text, p_note text default null, p_release_shifts boolean default true)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tz   text := public.business_tz();
  v_year int := extract(year from p_starts_on)::int;
  v_n    int := 0;
begin
  if not public.is_admin() then raise exception 'Only an admin can record time off for someone'; end if;
  if not exists (select 1 from public.profiles where id = p_profile_id and role in ('admin', 'employee')) then
    raise exception 'Person not found';
  end if;
  if p_ends_on < p_starts_on then raise exception 'The last day must be on or after the first day'; end if;
  if exists (select 1 from public.time_off where profile_id = p_profile_id and status in ('pending', 'approved')
             and starts_on <= p_ends_on and ends_on >= p_starts_on) then
    raise exception '% already has time off on some of those days', (select full_name from public.profiles where id = p_profile_id);
  end if;
  if p_kind = 'vacation' and public.vacation_days_used(p_profile_id, v_year) + (p_ends_on - p_starts_on + 1)
       > public.holiday_allowance(p_profile_id, v_year) then
    raise exception 'That is more than their % holiday days for the year', trim_scale(public.holiday_allowance(p_profile_id, v_year));
  end if;
  insert into public.time_off (profile_id, starts_on, ends_on, kind, note, status, decided_by, decided_at)
  values (p_profile_id, p_starts_on, p_ends_on, p_kind, nullif(btrim(p_note), ''), 'approved', auth.uid(), now());
  if p_release_shifts then
    update public.shifts set profile_id = null,
           note = coalesce(note || ' · ', '') || 'Released: ' || (select full_name from public.profiles where id = p_profile_id) || ' off'
     where profile_id = p_profile_id
       and starts_at >= (p_starts_on::timestamp) at time zone v_tz
       and starts_at < ((p_ends_on + 1)::timestamp) at time zone v_tz;
    get diagnostics v_n = row_count;
  end if;
  return v_n;
end;
$$;

-- holiday_allowance() is for the functions above; the app reads leave_allowances itself.
revoke execute on function public.holiday_allowance(uuid, int) from public, anon, authenticated;
revoke execute on function public.record_time_off(uuid, date, date, text, text, boolean) from public, anon;
grant execute on function public.record_time_off(uuid, date, date, text, text, boolean) to authenticated;
