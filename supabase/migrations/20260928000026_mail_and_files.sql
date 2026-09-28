-- Email (Gmail, Outlook) and files (Google Drive, OneDrive) connections, email delivery of
-- alerts for people who prefer email, and the business set-up wizard's progress.
alter table public.integrations drop constraint integrations_provider_check;
alter table public.integrations add constraint integrations_provider_check
  check (provider in ('google_business', 'whatsapp', 'instagram', 'spotify', 'gmail', 'outlook', 'google_drive', 'onedrive'));
insert into public.integrations (provider) values ('gmail'), ('outlook'), ('google_drive'), ('onedrive') on conflict do nothing;

alter table public.outbox drop constraint outbox_kind_check;
alter table public.outbox add constraint outbox_kind_check
  check (kind in ('whatsapp', 'google_sync', 'google_post', 'instagram_post', 'email'));

-- When the admin finished (or skipped) the set-up wizard. Until then admins see a prompt on Today.
alter table public.business add column setup_completed_at timestamptz;

-- One place decides how a person hears about something: the alert kind must be switched on; then
-- people who prefer email get an email (when the café's mailbox is connected), everyone else a
-- WhatsApp if they opted in and have a number. Same name as before, so every caller follows it.
create or replace function public._enqueue_whatsapp(p_profile_id uuid, p_template text, p_params text[], p_dedupe text default null)
returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare
  v_person public.profiles;
  v_set    public.settings;
begin
  select * into v_set from public.settings where id = 1;
  if (p_template = 'shift_reminder' and not v_set.alert_shift_reminders)
     or (p_template like 'missed_clock_in%' and not v_set.alert_missed_clock_in)
     or (p_template = 'rota_published' and not v_set.alert_rota)
     or (p_template like 'time_off_%' and not v_set.alert_time_off) then
    return null;
  end if;
  select * into v_person from public.profiles where id = p_profile_id and active;
  if v_person.id is null then return null; end if;
  if v_person.contact_method = 'email' and v_person.email is not null
     and exists (select 1 from public.integrations where provider in ('gmail', 'outlook') and status = 'connected') then
    return public._enqueue('email',
      jsonb_build_object('to', v_person.email, 'template', p_template, 'params', to_jsonb(p_params), 'profile_id', p_profile_id),
      case when p_dedupe is null then null else p_dedupe || ':email' end);
  end if;
  if not v_person.whatsapp_opt_in or v_person.phone is null then return null; end if;
  return public._enqueue('whatsapp',
    jsonb_build_object('to', regexp_replace(v_person.phone, '[^0-9]', '', 'g'), 'template', p_template,
                       'params', to_jsonb(p_params), 'profile_id', p_profile_id),
    p_dedupe);
end;
$$;
revoke execute on function public._enqueue_whatsapp(uuid, text, text[], text) from public, anon, authenticated;
