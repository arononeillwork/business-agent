-- Team crests: looked up once per team name (clubs from TheSportsDB, national teams as flags) and
-- stamped onto fixtures automatically, so fixture sources without crests still show them.
create table public.sports_teams (
  name text primary key,          -- exactly as the fixture source writes it ("Man Utd", "Atleti")
  badge text,                     -- image URL; null = looked for, not found yet
  source text not null,           -- 'thesportsdb' | 'flag'
  checked_at timestamptz not null default now()
);
alter table public.sports_teams enable row level security;
revoke all on public.sports_teams from anon;
create policy sports_teams_read on public.sports_teams for select to authenticated using (public.is_staff());
revoke insert, update, delete on public.sports_teams from authenticated;

-- Any fixture saved without a crest picks one up from the table.
create or replace function public.fill_team_badges() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.home is not null and new.home_badge is null then
    select badge into new.home_badge from sports_teams where name = new.home;
  end if;
  if new.away is not null and new.away_badge is null then
    select badge into new.away_badge from sports_teams where name = new.away;
  end if;
  return new;
end $$;
create trigger sports_events_badges before insert or update on public.sports_events
  for each row execute function public.fill_team_badges();

-- When a crest is found, give it to the fixtures already saved.
create or replace function public.apply_team_badge() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.badge is not null then
    update sports_events set home_badge = new.badge where home = new.name and home_badge is distinct from new.badge;
    update sports_events set away_badge = new.badge where away = new.name and away_badge is distinct from new.badge;
  end if;
  return new;
end $$;
create trigger sports_teams_apply after insert or update of badge on public.sports_teams
  for each row execute function public.apply_team_badge();
revoke execute on function public.fill_team_badges(), public.apply_team_badge() from public, anon, authenticated;
