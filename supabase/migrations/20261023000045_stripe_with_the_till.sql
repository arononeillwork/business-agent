-- Stripe (online payments) can be connected on top of the till: Square or SumUp stay one at a
-- time (the payments group), Stripe joins no group, and the Sales page adds the two up.
create or replace function public.integration_group(p text) returns text
language sql immutable set search_path = ''
as $$
  select case
    when p in ('gmail', 'outlook') then 'email'
    when p in ('google_drive', 'onedrive') then 'files'
    when p in ('google_calendar', 'outlook_calendar') then 'calendar'
    when p in ('spotify', 'youtube_music') then 'music'
    when p = 'whatsapp' then 'communication'
    when p in ('square', 'sumup') then 'payments'
  end
$$;
