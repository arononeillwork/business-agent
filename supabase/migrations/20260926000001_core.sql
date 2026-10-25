-- Core schema: business, people, rota, time tracking, calendar, audit.
-- Every rule that matters (clock-in window, reasons on edits, approval lock) lives in SQL
-- functions so the web app, REST API and AI connector all go through the same checks.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'employee', 'kiosk');

-- ---------------------------------------------------------------------------
-- Business and settings (one row each)
-- ---------------------------------------------------------------------------
create table public.business (
  id               int primary key default 1 check (id = 1),
  name             text not null,
  business_type    text,
  address          text,
  phone            text,
  email            text,
  instagram        text,
  timezone         text not null default 'Europe/Madrid',
  locale           text not null default 'es-ES',
  currency         text not null default 'EUR',
  -- {"mon": {"open": "08:00", "close": "18:00"}, ..., "sun": null}
  opening_hours    jsonb not null default '{}'::jsonb,
  peak_hours       jsonb,
  team_channel     text check (team_channel in ('whatsapp', 'slack', 'sms')),
  owners           text[] not null default '{}',
  suppliers        jsonb not null default '[]'::jsonb,
  towns_followed   text[] not null default '{}',
  notes            text,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users
);

-- Admin-only notes (alarm code holder, wifi, landlord…) kept in their own table so row
-- security can hide them from employees.
create table public.business_admin_notes (
  id          int primary key default 1 check (id = 1),
  notes       text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users
);

create table public.settings (
  id                            int primary key default 1 check (id = 1),
  early_clock_in_minutes        int not null default 10,
  unscheduled_clock_in          text not null default 'flag' check (unscheduled_clock_in in ('flag', 'block')),
  auto_clock_out_minutes        int not null default 60,
  forgot_clock_out_grace_minutes int not null default 30,
  phone_clock_in                text not null default 'anywhere' check (phone_clock_in in ('off', 'anywhere', 'near_cafe')),
  geofence_lat                  numeric,
  geofence_lng                  numeric,
  geofence_radius_m             int not null default 150,
  min_break_minutes             int not null default 15,
  break_after_hours             numeric not null default 6,
  max_daily_hours               numeric not null default 9,
  max_weekly_hours              numeric not null default 40,
  min_rest_hours                numeric not null default 12,
  approval_weekday              int not null default 1 check (approval_weekday between 1 and 7),
  approval_time                 time not null default '12:00',
  employer_cost_multiplier      numeric not null default 1.0,
  correction_expiry_days        int not null default 30,
  updated_at                    timestamptz not null default now(),
  updated_by                    uuid references auth.users
);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users on delete cascade,
  full_name      text not null,
  email          text,
  role           public.app_role not null default 'employee',
  can_see_pay    boolean not null default false,
  colour         text not null default '#8d6e63',
  active         boolean not null default true,
  birth_date     date,
  phone          text,
  alert_channel  text check (alert_channel in ('whatsapp', 'slack', 'sms', 'email')),
  pin_hash       text,
  created_at     timestamptz not null default now()
);

create table public.positions (
  id      serial primary key,
  name    text not null unique,
  colour  text not null default '#8d6e63',
  sort    int not null default 0,
  active  boolean not null default true
);

create table public.pay_rates (
  profile_id      uuid not null references public.profiles on delete cascade,
  effective_from  date not null default current_date,
  hourly_rate     numeric(8, 2) not null check (hourly_rate >= 0),
  primary key (profile_id, effective_from)
);

-- ---------------------------------------------------------------------------
-- Rota
-- ---------------------------------------------------------------------------
create table public.shifts (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid references public.profiles on delete set null,  -- null = open shift
  position_id    int references public.positions,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  break_minutes  int not null default 0 check (break_minutes >= 0),
  note           text,
  status         text not null default 'published' check (status in ('draft', 'published')),
  created_by     uuid references auth.users default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index shifts_starts_at_idx on public.shifts (starts_at);
create index shifts_profile_idx on public.shifts (profile_id, starts_at);

-- ---------------------------------------------------------------------------
-- Time tracking
-- ---------------------------------------------------------------------------
create table public.break_types (
  id       serial primary key,
  name     text not null,
  minutes  int not null,
  paid     boolean not null default false,
  active   boolean not null default true
);

create table public.time_entries (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles,
  position_id       int references public.positions,
  shift_id          uuid references public.shifts on delete set null,
  clock_in          timestamptz not null,
  clock_out         timestamptz,
  source            text not null check (source in ('kiosk', 'phone', 'manual', 'api', 'ai')),
  clock_out_source  text check (clock_out_source in ('kiosk', 'phone', 'manual', 'api', 'ai', 'auto')),
  flags             text[] not null default '{}',
  note              text,
  approved_at       timestamptz,
  approved_by       uuid references auth.users,
  created_at        timestamptz not null default now(),
  check (clock_out is null or clock_out > clock_in)
);
create index time_entries_profile_idx on public.time_entries (profile_id, clock_in);
create unique index time_entries_one_open_idx on public.time_entries (profile_id) where clock_out is null;

create table public.breaks (
  id             uuid primary key default gen_random_uuid(),
  time_entry_id  uuid not null references public.time_entries on delete cascade,
  break_type_id  int references public.break_types,
  started_at     timestamptz not null,
  ended_at       timestamptz,
  check (ended_at is null or ended_at > started_at)
);
create index breaks_entry_idx on public.breaks (time_entry_id);

create table public.time_entry_changes (
  id             bigserial primary key,
  time_entry_id  uuid not null references public.time_entries on delete cascade,
  changed_by     uuid references auth.users,
  changed_at     timestamptz not null default now(),
  via            text not null default 'app',
  reason         text not null,
  old_values     jsonb,
  new_values     jsonb
);
create index time_entry_changes_entry_idx on public.time_entry_changes (time_entry_id);

create table public.correction_requests (
  id                   uuid primary key default gen_random_uuid(),
  time_entry_id        uuid references public.time_entries on delete cascade,
  profile_id           uuid not null references public.profiles default auth.uid(),
  requested_clock_in   timestamptz,
  requested_clock_out  timestamptz,
  note                 text not null,
  status               text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'expired')),
  created_at           timestamptz not null default now(),
  expires_at           timestamptz not null default now() + interval '30 days',
  decided_by           uuid references auth.users,
  decided_at           timestamptz,
  decision_note        text
);

-- ---------------------------------------------------------------------------
-- Calendar
-- ---------------------------------------------------------------------------
create table public.calendar_events (
  id          uuid primary key default gen_random_uuid(),
  starts_on   date not null,
  ends_on     date,
  starts_at   timestamptz,           -- set for timed events, e.g. kick-off
  title       text not null,
  category    text not null check (category in
                ('national', 'regional', 'local', 'area', 'event', 'sports', 'business', 'staff')),
  town        text,
  competition text,
  source      text not null default 'admin' check (source in ('import', 'admin', 'ai', 'feed', 'app')),
  external_id text,
  confirmed   boolean not null default true,
  visibility  text not null default 'all' check (visibility in ('all', 'admins')),
  details     jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users default auth.uid(),
  created_at  timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index calendar_events_starts_on_idx on public.calendar_events (starts_on);
create unique index calendar_events_external_idx on public.calendar_events (source, external_id) where external_id is not null;

create table public.sports_follows (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('competition', 'team')),
  provider     text not null default 'football-data',
  provider_id  text not null,
  name         text not null,
  alerts       text not null default 'big_matches' check (alerts in ('all', 'big_matches', 'none')),
  created_at   timestamptz not null default now(),
  unique (provider, provider_id)
);

-- ---------------------------------------------------------------------------
-- Audit log (business, settings, rota, calendar, people, pay)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor       uuid,
  via         text not null,
  table_name  text not null,
  row_id      text,
  action      text not null,
  old_values  jsonb,
  new_values  jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);

-- ===========================================================================
-- Helpers
-- ===========================================================================

-- Which surface made the request: 'app' (default), 'kiosk', 'api' or 'ai'.
-- The Worker sets the x-app-via header when calling on behalf of the REST API or MCP.
create or replace function public.request_via()
returns text
language sql stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'x-app-via',
    'app'
  );
$$;

create or replace function public.my_role()
returns public.app_role
language sql stable security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid() and active;
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid() and active), false);
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select role in ('admin', 'employee') from public.profiles where id = auth.uid() and active), false);
$$;

create or replace function public.can_see_pay()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select role = 'admin' and can_see_pay from public.profiles where id = auth.uid() and active), false);
$$;

create or replace function public.business_tz()
returns text
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select timezone from public.business where id = 1), 'Europe/Madrid');
$$;

-- ---------------------------------------------------------------------------
-- New users get a profile; the very first one becomes an admin who can see pay.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_first boolean;
begin
  select not exists (select 1 from public.profiles where role = 'admin') into v_first;
  insert into public.profiles (id, full_name, email, role, can_see_pay)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    case when v_first then 'admin'::public.app_role
         when new.raw_user_meta_data ->> 'role' = 'kiosk' then 'kiosk'::public.app_role
         else 'employee'::public.app_role end,
    v_first
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Employees may edit their own contact details, never their role, pay permission or status.
-- At least one active admin must always remain.
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
       or new.pin_hash is distinct from old.pin_hash then
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

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------------
-- Generic audit trigger
-- ---------------------------------------------------------------------------
create or replace function public.audit_row()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  -- never copy PIN hashes into the log
  v_old := v_old - 'pin_hash';
  v_new := v_new - 'pin_hash';
  insert into public.audit_log (actor, via, table_name, row_id, action, old_values, new_values)
  values (auth.uid(), public.request_via(), tg_table_name,
          coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'profile_id', v_old ->> 'profile_id'),
          lower(tg_op), v_old, v_new);
  return coalesce(new, old);
end;
$$;

create trigger audit_business after insert or update or delete on public.business
  for each row execute function public.audit_row();
create trigger audit_business_admin_notes after insert or update or delete on public.business_admin_notes
  for each row execute function public.audit_row();
create trigger audit_settings after insert or update or delete on public.settings
  for each row execute function public.audit_row();
create trigger audit_profiles after insert or update or delete on public.profiles
  for each row execute function public.audit_row();
create trigger audit_positions after insert or update or delete on public.positions
  for each row execute function public.audit_row();
create trigger audit_pay_rates after insert or update or delete on public.pay_rates
  for each row execute function public.audit_row();
create trigger audit_shifts after insert or update or delete on public.shifts
  for each row execute function public.audit_row();
create trigger audit_calendar_events after insert or update or delete on public.calendar_events
  for each row execute function public.audit_row();
create trigger audit_sports_follows after insert or update or delete on public.sports_follows
  for each row execute function public.audit_row();

create or replace function public.touch_updated()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_table_name in ('business', 'business_admin_notes', 'settings') then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger touch_business before update on public.business
  for each row execute function public.touch_updated();
create trigger touch_business_admin_notes before update on public.business_admin_notes
  for each row execute function public.touch_updated();
create trigger touch_settings before update on public.settings
  for each row execute function public.touch_updated();
create trigger touch_shifts before update on public.shifts
  for each row execute function public.touch_updated();

-- ===========================================================================
-- Row-level security
-- ===========================================================================
alter table public.business             enable row level security;
alter table public.business_admin_notes enable row level security;
alter table public.settings             enable row level security;
alter table public.profiles             enable row level security;
alter table public.positions            enable row level security;
alter table public.pay_rates            enable row level security;
alter table public.shifts               enable row level security;
alter table public.break_types          enable row level security;
alter table public.time_entries         enable row level security;
alter table public.breaks               enable row level security;
alter table public.time_entry_changes   enable row level security;
alter table public.correction_requests  enable row level security;
alter table public.calendar_events      enable row level security;
alter table public.sports_follows       enable row level security;
alter table public.audit_log            enable row level security;

-- Nothing is readable anonymously.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- business / settings: staff read, admins write
create policy business_read on public.business for select to authenticated using (public.is_staff());
create policy business_write on public.business for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_notes_all on public.business_admin_notes for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy settings_read on public.settings for select to authenticated using (public.is_staff());
create policy settings_write on public.settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles: staff see the team (the PIN hash column is not granted), edit themselves; admins edit all
create policy profiles_read on public.profiles for select to authenticated
  using (public.is_staff() or id = auth.uid());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke select, insert, update, delete on public.profiles from authenticated;
grant select (id, full_name, email, role, can_see_pay, colour, active, birth_date, phone, alert_channel, created_at)
  on public.profiles to authenticated;
grant update (full_name, colour, phone, alert_channel, birth_date, role, can_see_pay, active)
  on public.profiles to authenticated;

-- positions / break types: staff read, admins write
create policy positions_read on public.positions for select to authenticated using (public.is_staff());
create policy positions_write on public.positions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy break_types_read on public.break_types for select to authenticated using (public.is_staff());
create policy break_types_write on public.break_types for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- pay: your own rate, or admins with "see pay"
create policy pay_rates_read on public.pay_rates for select to authenticated
  using (profile_id = auth.uid() or public.can_see_pay());
create policy pay_rates_write on public.pay_rates for all to authenticated
  using (public.can_see_pay()) with check (public.can_see_pay());

-- shifts: staff see the rota, admins edit it
create policy shifts_read on public.shifts for select to authenticated
  using (public.is_staff() and (status = 'published' or public.is_admin()));
create policy shifts_write on public.shifts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- time entries, breaks, change log: own rows or admins. Writes only through functions.
create policy time_entries_read on public.time_entries for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());
create policy breaks_read on public.breaks for select to authenticated
  using (exists (select 1 from public.time_entries t
                 where t.id = time_entry_id and (t.profile_id = auth.uid() or public.is_admin())));
create policy time_entry_changes_read on public.time_entry_changes for select to authenticated
  using (exists (select 1 from public.time_entries t
                 where t.id = time_entry_id and (t.profile_id = auth.uid() or public.is_admin())));
revoke insert, update, delete on public.time_entries, public.breaks, public.time_entry_changes from authenticated;

create policy corrections_read on public.correction_requests for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.correction_requests from authenticated;

-- calendar: staff read (admins-only items hidden from employees), admins write
create policy calendar_read on public.calendar_events for select to authenticated
  using (public.is_staff() and (visibility = 'all' or public.is_admin()));
create policy calendar_write on public.calendar_events for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy sports_read on public.sports_follows for select to authenticated using (public.is_staff());
create policy sports_write on public.sports_follows for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- audit log: admins read; written only by triggers
create policy audit_read on public.audit_log for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.audit_log from authenticated;

-- ===========================================================================
-- Views (security_invoker so row security still applies)
-- ===========================================================================
create view public.time_entry_totals
with (security_invoker = true) as
select
  t.id,
  t.profile_id,
  t.position_id,
  t.shift_id,
  t.clock_in,
  t.clock_out,
  t.source,
  t.clock_out_source,
  t.flags,
  t.note,
  t.approved_at,
  (t.clock_in at time zone public.business_tz())::date as work_date,
  round(extract(epoch from (coalesce(t.clock_out, now()) - t.clock_in)) / 60)::int as total_minutes,
  coalesce(b.break_minutes, 0) as break_minutes,
  coalesce(b.unpaid_break_minutes, 0) as unpaid_break_minutes,
  round(extract(epoch from (coalesce(t.clock_out, now()) - t.clock_in)) / 60)::int
    - coalesce(b.unpaid_break_minutes, 0) as paid_minutes,
  exists (select 1 from public.calendar_events e
          where e.category in ('national', 'regional', 'local')
            and e.confirmed
            and (t.clock_in at time zone public.business_tz())::date
                between e.starts_on and coalesce(e.ends_on, e.starts_on)) as on_holiday
from public.time_entries t
left join lateral (
  select
    round(sum(extract(epoch from (coalesce(br.ended_at, now()) - br.started_at))) / 60)::int as break_minutes,
    round(sum(extract(epoch from (coalesce(br.ended_at, now()) - br.started_at)))
          filter (where not coalesce(bt.paid, false)) / 60)::int as unpaid_break_minutes
  from public.breaks br
  left join public.break_types bt on bt.id = br.break_type_id
  where br.time_entry_id = t.id
) b on true;

grant select on public.time_entry_totals to authenticated;
