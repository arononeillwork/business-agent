-- Finances: the café's recurring monthly expenses (imported from the Accounts sheet, then kept
-- here). Only admins with pay access can see or change them.
create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (btrim(name) <> ''),
  amount      numeric(10, 2) not null check (amount >= 0),
  frequency   text not null default 'monthly' check (frequency in ('monthly')),
  category    text,
  notes       text,
  active      boolean not null default true,
  sort        int not null default 0,
  source      text not null default 'app' check (source in ('sheet', 'app', 'ai')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users default auth.uid()
);

alter table public.expenses enable row level security;
create policy expenses_all on public.expenses for all to authenticated
  using (public.can_see_pay()) with check (public.can_see_pay());

create trigger audit_expenses after insert or update or delete on public.expenses
  for each row execute function public.audit_row();

create or replace function public.touch_expense()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger touch_expenses before update on public.expenses
  for each row execute function public.touch_expense();

-- Alerts: admins switch each kind of WhatsApp alert on or off.
alter table public.settings
  add column alert_shift_reminders boolean not null default true,
  add column alert_missed_clock_in boolean not null default true,
  add column alert_rota boolean not null default true,
  add column alert_time_off boolean not null default true;

-- One place decides whether a message may be queued: the person opted in, has a number, and
-- that kind of alert is switched on.
create or replace function public._enqueue_whatsapp(p_profile_id uuid, p_template text, p_params text[], p_dedupe text default null)
returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare
  v_phone text;
  v_set   public.settings;
begin
  select * into v_set from public.settings where id = 1;
  if (p_template = 'shift_reminder' and not v_set.alert_shift_reminders)
     or (p_template like 'missed_clock_in%' and not v_set.alert_missed_clock_in)
     or (p_template = 'rota_published' and not v_set.alert_rota)
     or (p_template like 'time_off_%' and not v_set.alert_time_off) then
    return null;
  end if;
  select phone into v_phone from public.profiles
   where id = p_profile_id and active and whatsapp_opt_in and phone is not null;
  if v_phone is null then return null; end if;
  return public._enqueue('whatsapp',
    jsonb_build_object('to', regexp_replace(v_phone, '[^0-9]', '', 'g'), 'template', p_template,
                       'params', to_jsonb(p_params), 'profile_id', p_profile_id),
    p_dedupe);
end;
$$;
revoke execute on function public._enqueue_whatsapp(uuid, text, text[], text) from public, anon, authenticated;
revoke execute on function public.touch_expense() from public, anon, authenticated;
