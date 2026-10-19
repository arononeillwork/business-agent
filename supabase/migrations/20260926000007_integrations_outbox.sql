-- Integrations (Google Business Profile, WhatsApp, Instagram) and a reliable outbox.
-- Anything that talks to an outside service is written to `outbox` in the same transaction as
-- the change that caused it; the Worker drains it every minute, retrying with backoff.

-- ---------------------------------------------------------------------------
-- Connections
-- ---------------------------------------------------------------------------
create table public.integrations (
  provider      text primary key check (provider in ('google_business', 'whatsapp', 'instagram')),
  status        text not null default 'disconnected' check (status in ('connected', 'needs_setup', 'error', 'disconnected')),
  account_label text,
  external      jsonb not null default '{}'::jsonb,   -- location name, phone number id, ig user id…
  connected_by  uuid references auth.users,
  connected_at  timestamptz,
  last_sync_at  timestamptz,
  last_error    text,
  updated_at    timestamptz not null default now()
);

-- Tokens, encrypted by the Worker (AES-GCM, key kept as a Worker secret). Service role only.
create table public.integration_secrets (
  provider    text primary key references public.integrations on delete cascade,
  ciphertext  text not null,
  updated_at  timestamptz not null default now()
);

alter table public.integrations enable row level security;
alter table public.integration_secrets enable row level security;
revoke all on public.integration_secrets from anon, authenticated;
create policy integrations_read on public.integrations for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.integrations from authenticated;
comment on table public.integration_secrets is 'Encrypted provider tokens. No policies by design; only the Worker (service role) reads/writes.';

insert into public.integrations (provider) values ('google_business'), ('whatsapp'), ('instagram')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- People: WhatsApp consent (GDPR: staff opt in; STOP opts out)
-- ---------------------------------------------------------------------------
alter table public.profiles add column whatsapp_opt_in boolean not null default false;
grant select (whatsapp_opt_in) on public.profiles to authenticated;
grant update (whatsapp_opt_in) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Outbox
-- ---------------------------------------------------------------------------
create table public.outbox (
  id               bigserial primary key,
  kind             text not null check (kind in ('whatsapp', 'google_sync', 'google_post', 'instagram_post')),
  payload          jsonb not null,
  dedupe_key       text unique,
  status           text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'dead')),
  attempts         int not null default 0,
  next_attempt_at  timestamptz not null default now(),
  last_error       text,
  external_id      text,            -- e.g. WhatsApp message id, for delivery receipts
  delivery         text,            -- sent / delivered / read / failed (from webhooks)
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  sent_at          timestamptz
);
create index outbox_due_idx on public.outbox (next_attempt_at) where status in ('pending', 'failed');
alter table public.outbox enable row level security;
create policy outbox_read on public.outbox for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.outbox from authenticated;

-- Queue a job. Duplicate dedupe keys are ignored (e.g. one reminder per shift).
create or replace function public._enqueue(p_kind text, p_payload jsonb, p_dedupe text default null)
returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare v_id bigint;
begin
  insert into public.outbox (kind, payload, dedupe_key) values (p_kind, p_payload, p_dedupe)
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- Queue a WhatsApp template message to a person, if they opted in and have a number.
create or replace function public._enqueue_whatsapp(p_profile_id uuid, p_template text, p_params text[], p_dedupe text default null)
returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare v_phone text;
begin
  select phone into v_phone from public.profiles
   where id = p_profile_id and active and whatsapp_opt_in and phone is not null;
  if v_phone is null then return null; end if;
  return public._enqueue('whatsapp',
    jsonb_build_object('to', regexp_replace(v_phone, '[^0-9]', '', 'g'), 'template', p_template,
                       'params', to_jsonb(p_params), 'profile_id', p_profile_id),
    p_dedupe);
end;
$$;

-- Worker: claim due jobs (skip ones another run is handling).
create or replace function public.claim_outbox(p_limit int default 20)
returns setof public.outbox
language plpgsql security definer
set search_path = ''
as $$
begin
  -- Jobs stuck in 'sending' for 10 minutes (Worker crashed) go back in the queue.
  update public.outbox set status = 'failed', last_error = 'Timed out while sending'
   where status = 'sending' and next_attempt_at < now() - interval '10 minutes';
  return query
  update public.outbox o set status = 'sending', attempts = o.attempts + 1, next_attempt_at = now()
   where o.id in (select id from public.outbox
                   where status in ('pending', 'failed') and next_attempt_at <= now()
                   order by id limit p_limit for update skip locked)
  returning o.*;
end;
$$;

-- Worker: record the result. Failures retry after 1, 5, 15, 60, 240 minutes, then give up.
create or replace function public.complete_outbox(p_id bigint, p_ok boolean, p_error text default null, p_external_id text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare v_attempts int;
begin
  select attempts into v_attempts from public.outbox where id = p_id;
  if p_ok then
    update public.outbox set status = 'sent', sent_at = now(), last_error = null, external_id = p_external_id,
                             delivery = coalesce(delivery, 'sent')
     where id = p_id;
  elsif v_attempts >= 6 then
    update public.outbox set status = 'dead', last_error = p_error where id = p_id;
  else
    update public.outbox set status = 'failed', last_error = p_error,
      next_attempt_at = now() + make_interval(mins => (array[1, 5, 15, 60, 240])[least(v_attempts, 5)])
     where id = p_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Google hours stay in sync: any change to opening hours or to holiday/closure dates queues a
-- sync (one pending sync at a time).
-- ---------------------------------------------------------------------------
create or replace function public._queue_google_sync()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.integrations where provider = 'google_business' and status = 'connected') then
    delete from public.outbox where kind = 'google_sync' and status = 'pending';
    perform public._enqueue('google_sync', jsonb_build_object('reason', tg_table_name));
  end if;
  return null;
end;
$$;

create trigger business_google_sync after update of opening_hours, phone on public.business
  for each statement execute function public._queue_google_sync();
create trigger calendar_google_sync after insert or update or delete on public.calendar_events
  for each statement execute function public._queue_google_sync();

-- ---------------------------------------------------------------------------
-- WhatsApp alerts
-- ---------------------------------------------------------------------------
-- Every few minutes: reminders an hour before a shift, and a nudge 15 minutes after a shift
-- started with no clock-in (to the person and to admins). One of each per shift.
create or replace function public.queue_shift_alerts()
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tz text := public.business_tz();
  v_n  int := 0;
  r    record;
  a    record;
begin
  for r in
    select s.id, s.profile_id, s.starts_at, p.full_name, pos.name as position
      from public.shifts s
      join public.profiles p on p.id = s.profile_id
      left join public.positions pos on pos.id = s.position_id
     where s.status = 'published' and s.starts_at between now() + interval '50 minutes' and now() + interval '70 minutes'
  loop
    if public._enqueue_whatsapp(r.profile_id, 'shift_reminder',
         array[split_part(r.full_name, ' ', 1), to_char(r.starts_at at time zone v_tz, 'HH24:MI'), coalesce(r.position, '')],
         'reminder:' || r.id) is not null then v_n := v_n + 1; end if;
  end loop;

  for r in
    select s.id, s.profile_id, s.starts_at, p.full_name
      from public.shifts s
      join public.profiles p on p.id = s.profile_id and p.active
     where s.status = 'published'
       and s.starts_at between now() - interval '60 minutes' and now() - interval '15 minutes'
       and not exists (select 1 from public.time_entries t
                        where t.profile_id = s.profile_id and t.clock_in > s.starts_at - interval '2 hours'
                          and t.clock_in < s.ends_at)
  loop
    perform public._enqueue_whatsapp(r.profile_id, 'missed_clock_in',
      array[split_part(r.full_name, ' ', 1), to_char(r.starts_at at time zone v_tz, 'HH24:MI')], 'missed:' || r.id);
    for a in select id from public.profiles where role = 'admin' and active loop
      perform public._enqueue_whatsapp(a.id, 'missed_clock_in_admin',
        array[r.full_name, to_char(r.starts_at at time zone v_tz, 'HH24:MI')], 'missed-admin:' || r.id || ':' || a.id);
    end loop;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Admins: send everyone their shifts for a week.
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
  if not public.is_admin() then raise exception 'Only an admin can send the rota'; end if;
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

-- Admins: queue a post to Instagram and/or Google for a calendar event (or any text).
create or replace function public.queue_share(p_caption text, p_image_url text, p_targets text[], p_event_id uuid default null)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare v_n int := 0; v_ev public.calendar_events;
begin
  if not public.is_admin() then raise exception 'Only an admin can post'; end if;
  if coalesce(btrim(p_caption), '') = '' then raise exception 'Write a caption first'; end if;
  if p_event_id is not null then select * into v_ev from public.calendar_events where id = p_event_id; end if;
  if 'instagram' = any(p_targets) then
    if p_image_url is null then raise exception 'Instagram posts need a photo'; end if;
    perform public._enqueue('instagram_post', jsonb_build_object('caption', p_caption, 'image_url', p_image_url));
    v_n := v_n + 1;
  end if;
  if 'google' = any(p_targets) then
    perform public._enqueue('google_post', jsonb_build_object('caption', p_caption, 'image_url', p_image_url,
      'title', v_ev.title, 'starts_on', v_ev.starts_on, 'ends_on', coalesce(v_ev.ends_on, v_ev.starts_on)));
    v_n := v_n + 1;
  end if;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
revoke execute on function public._enqueue(text, jsonb, text), public._enqueue_whatsapp(uuid, text, text[], text),
  public.claim_outbox(int), public.complete_outbox(bigint, boolean, text, text), public._queue_google_sync(),
  public.queue_shift_alerts()
  from public, anon, authenticated;
grant execute on function public.claim_outbox(int), public.complete_outbox(bigint, boolean, text, text),
  public.queue_shift_alerts() to service_role;
revoke execute on function public.send_rota(date), public.queue_share(text, text, text[], uuid) from public, anon;
grant execute on function public.send_rota(date), public.queue_share(text, text, text[], uuid) to authenticated;
