-- Each person's favourite teams (by name, as fixtures write it) and competitions (by code).
-- Private to them: the Sports page shows their favourites first.
create table public.sports_favourites (
  profile_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('team', 'competition')),
  ref text not null check (length(ref) between 1 and 120),
  created_at timestamptz not null default now(),
  primary key (profile_id, kind, ref)
);
alter table public.sports_favourites enable row level security;
revoke all on public.sports_favourites from anon;
grant select, insert, delete on public.sports_favourites to authenticated;
create policy sports_favourites_own on public.sports_favourites for all to authenticated
  using (profile_id = (select auth.uid()) and public.is_staff())
  with check (profile_id = (select auth.uid()) and public.is_staff());
