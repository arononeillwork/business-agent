-- Personal access keys: let any AI or automation act as a team member without a browser sign-in
-- (MCP clients that send a header, the REST API, n8n/Zapier). Each person makes their own keys;
-- only a SHA-256 hash is stored, the key itself is shown once. The Worker checks the key, then
-- acts as that person with a normal session, so every database rule still applies.
create table public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  prefix       text not null check (prefix ~ '^ba_[A-Za-z0-9]{4}$'),
  key_hash     text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  -- The person's current session for this key, encrypted by the Worker (INTEGRATION_KEY).
  session      text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index api_keys_profile_idx on public.api_keys (profile_id) where revoked_at is null;
alter table public.api_keys enable row level security;
revoke all on public.api_keys from anon, authenticated;
comment on table public.api_keys is 'Personal access keys (hashes only). No policies by design: the Worker (service role) manages them for the signed-in person.';
