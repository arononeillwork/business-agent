-- Calendar feeds: a private link per person ("my shifts") and, for admins, one for the whole
-- business. Calendar apps fetch it without signing in, so the link itself is the key: only its
-- SHA-256 is used for lookup; the sealed copy lets the owner see the link again. Worker-only.
create table public.calendar_feeds (
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  scope       text not null check (scope in ('me', 'business')),
  token_hash  text not null unique,
  ciphertext  text not null,
  created_at  timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (profile_id, scope)
);

alter table public.calendar_feeds enable row level security;
revoke all on public.calendar_feeds from anon, authenticated;
