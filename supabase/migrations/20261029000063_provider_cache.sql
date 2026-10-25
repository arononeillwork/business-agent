-- Outside services' answers (takings, ads, Search Console, loyalty, email invoices, reviews), kept a
-- while so opening a page or coming back to it doesn't ask Square, Google or Meta again each time.
-- How long each is kept: shared/refresh.ts. Written and read by the Worker only (the service key);
-- answers older than two days are cleared every night.
create table public.provider_cache (
  key         text primary key check (char_length(key) <= 300),
  data        jsonb not null,
  fetched_at  timestamptz not null default now()
);
alter table public.provider_cache enable row level security;
revoke all on public.provider_cache from anon, authenticated;
