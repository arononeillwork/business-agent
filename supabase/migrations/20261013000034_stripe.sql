-- Stripe as a payment system (takings on the Finances page), next to Square. One payment system
-- at a time, like the other choose-one groups.
alter table public.integrations drop constraint integrations_provider_check;
alter table public.integrations add constraint integrations_provider_check check (provider in (
  'google_business', 'whatsapp', 'instagram', 'spotify', 'gmail', 'outlook', 'google_drive', 'onedrive',
  'google_calendar', 'outlook_calendar', 'youtube_music', 'facebook', 'tiktok', 'square', 'stripe'));
insert into public.integrations (provider) values ('stripe') on conflict do nothing;

create or replace function public.integration_group(p text) returns text
language sql immutable set search_path = ''
as $$
  select case
    when p in ('gmail', 'outlook') then 'email'
    when p in ('google_drive', 'onedrive') then 'files'
    when p in ('google_calendar', 'outlook_calendar') then 'calendar'
    when p in ('spotify', 'youtube_music') then 'music'
    when p = 'whatsapp' then 'communication'
    when p in ('square', 'stripe') then 'payments'
  end
$$;
