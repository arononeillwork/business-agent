-- Connections: the business picks ONE app per group (Gmail or Outlook, Google Drive or OneDrive,
-- Google Calendar or Outlook Calendar, Spotify or YouTube Music). Connecting one replaces the
-- other: its stored access is deleted in the same transaction, so two can never be live at once.
alter table public.integrations drop constraint integrations_provider_check;
alter table public.integrations add constraint integrations_provider_check check (provider in (
  'google_business', 'whatsapp', 'instagram', 'spotify', 'gmail', 'outlook', 'google_drive', 'onedrive',
  'google_calendar', 'outlook_calendar', 'youtube_music'));
insert into public.integrations (provider) values ('google_calendar'), ('outlook_calendar'), ('youtube_music') on conflict do nothing;

-- 'pending': chosen, waiting to be proven (e.g. Google Calendar hasn't fetched the calendar yet).
alter table public.integrations drop constraint integrations_status_check;
alter table public.integrations add constraint integrations_status_check
  check (status in ('connected', 'pending', 'needs_setup', 'error', 'disconnected'));
-- When the Worker last proved the connection still works (on connect, nightly, or "Check now").
alter table public.integrations add column last_checked_at timestamptz;
-- Which app last fetched a calendar feed (its User-Agent), so the app can show it really is subscribed.
alter table public.calendar_feeds add column last_read_by text;

create or replace function public.integration_group(p text) returns text
language sql immutable set search_path = ''
as $$
  select case
    when p in ('gmail', 'outlook') then 'email'
    when p in ('google_drive', 'onedrive') then 'files'
    when p in ('google_calendar', 'outlook_calendar') then 'calendar'
    when p in ('spotify', 'youtube_music') then 'music'
    when p = 'whatsapp' then 'communication'
  end
$$;

create or replace function public.one_connection_per_group() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare g text := public.integration_group(new.provider);
begin
  if g is not null and new.status in ('connected', 'pending')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    delete from public.integration_secrets s
     where s.provider <> new.provider and public.integration_group(s.provider) = g;
    update public.integrations
       set status = 'disconnected', account_label = null, external = '{}'::jsonb, last_error = null, updated_at = now()
     where provider <> new.provider and public.integration_group(provider) = g and status <> 'disconnected';
  end if;
  return null;
end;
$$;
create trigger integrations_one_per_group after insert or update of status on public.integrations
  for each row execute function public.one_connection_per_group();
revoke execute on function public.one_connection_per_group() from public, anon, authenticated;
