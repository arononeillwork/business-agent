-- Café music: Spotify and YouTube Music no longer exclude each other. A business can keep both
-- connected (the Music page then offers each); connecting one leaves the other as it is. Each keeps
-- its own approved playlist. The other choose-one groups (email, calendar, communication, the till)
-- are as they were.
create or replace function public.integration_group(p text) returns text
language sql immutable set search_path = ''
as $$
  select case
    when p in ('gmail', 'outlook') then 'email'
    when p in ('google_calendar', 'outlook_calendar') then 'calendar'
    when p = 'whatsapp' then 'communication'
    when p in ('square', 'sumup') then 'payments'
  end
$$;
