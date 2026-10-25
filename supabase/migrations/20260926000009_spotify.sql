-- Spotify: the café's approved playlist, played on the café speaker.
alter table public.integrations drop constraint integrations_provider_check;
alter table public.integrations add constraint integrations_provider_check
  check (provider in ('google_business', 'whatsapp', 'instagram', 'spotify'));
insert into public.integrations (provider) values ('spotify') on conflict do nothing;

-- Staff can see which playlist is approved (not tokens or anything else).
create or replace function public.approved_playlist()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select case when public.is_staff() then external -> 'playlist' end
    from public.integrations where provider = 'spotify' and status = 'connected';
$$;
revoke execute on function public.approved_playlist() from public, anon;
grant execute on function public.approved_playlist() to authenticated;
