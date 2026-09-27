-- Personal music: each person connects their own Spotify or YouTube Music account to use the
-- Music page. Tokens are sealed by the Worker (INTEGRATION_KEY) and only the Worker (service key)
-- reads or writes this table; the app asks the Worker what is connected.
create table public.music_accounts (
  profile_id     uuid not null references public.profiles (id) on delete cascade,
  provider       text not null check (provider in ('spotify', 'youtube')),
  account_label  text,
  ciphertext     text not null,
  connected_at   timestamptz not null default now(),
  primary key (profile_id, provider)
);

alter table public.music_accounts enable row level security;
revoke all on public.music_accounts from anon, authenticated;
