-- Sports: upcoming football (leagues, cups, national teams), UFC and boxing, for planning busy
-- nights and what's on the café TV. The Worker refreshes each followed competition every 6 hours
-- (a couple a minute, from free sources) with the service key; staff read, admins choose.
-- Replaces sports_follows (the football-data.org plan that never got a key).
drop table if exists public.sports_follows;

create table public.sports_competitions (
  code          text primary key,
  source        text not null check (source in ('fixturedownload', 'thesportsdb', 'wikipedia')),
  source_id     text not null,
  name          text not null,
  sport         text not null check (sport in ('football', 'ufc', 'boxing')),
  region        text not null,
  kind          text not null default 'league' check (kind in ('league', 'cup', 'national', 'fight')),
  season_style  text not null default 'split' check (season_style in ('split', 'year')),
  followed      boolean not null default false,
  sort          int not null default 0,
  refreshed_at  timestamptz,
  last_error    text
);

create table public.sports_events (
  id           text primary key,
  competition  text not null references public.sports_competitions (code) on delete cascade,
  sport        text not null,
  starts_at    timestamptz not null,
  time_tbc     boolean not null default false,  -- only the day is known yet
  title        text not null,
  home         text,
  away         text,
  home_badge   text,
  away_badge   text,
  round        text,
  venue        text,
  city         text,
  country      text,
  status       text not null default 'scheduled' check (status in ('scheduled', 'live', 'finished', 'postponed')),
  big          boolean not null default false,
  image        text,
  updated_at   timestamptz not null default now()
);
create index sports_events_starts_idx on public.sports_events (starts_at);
create index sports_events_competition_idx on public.sports_events (competition);

alter table public.sports_competitions enable row level security;
alter table public.sports_events enable row level security;
revoke all on public.sports_competitions, public.sports_events from anon;

create policy sports_competitions_read on public.sports_competitions for select to authenticated using (public.is_staff());
create policy sports_competitions_follow on public.sports_competitions for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke insert, update, delete on public.sports_competitions from authenticated;
grant update (followed) on public.sports_competitions to authenticated;

create policy sports_events_read on public.sports_events for select to authenticated using (public.is_staff());
revoke insert, update, delete on public.sports_events from authenticated;

create trigger audit_sports_competitions after update on public.sports_competitions
  for each row when (old.followed is distinct from new.followed) execute function public.audit_row();

-- The catalogue. fixturedownload ids are feed slugs (the season year is added), TheSportsDB ids
-- are league ids, Wikipedia ids are page titles.
insert into public.sports_competitions (code, source, source_id, name, sport, region, kind, season_style, followed, sort) values
  ('es-laliga',       'fixturedownload', 'la-liga',            'La Liga',              'football', 'Spain',          'league',   'split', true,  10),
  ('es-segunda',      'thesportsdb',     '4400',               'La Liga 2',            'football', 'Spain',          'league',   'split', false, 11),
  ('es-copa',         'thesportsdb',     '4483',               'Copa del Rey',         'football', 'Spain',          'cup',      'split', true,  12),
  ('en-premier',      'fixturedownload', 'epl',                'Premier League',       'football', 'England',        'league',   'split', true,  20),
  ('en-championship', 'fixturedownload', 'championship',       'Championship',         'football', 'England',        'league',   'split', false, 21),
  ('en-fa-cup',       'thesportsdb',     '4482',               'FA Cup',               'football', 'England',        'cup',      'split', false, 22),
  ('en-efl-cup',      'thesportsdb',     '4570',               'EFL Cup',              'football', 'England',        'cup',      'split', false, 23),
  ('sc-premiership',  'fixturedownload', 'scottish-premiership', 'Scottish Premiership', 'football', 'Scotland',       'league',   'split', false, 30),
  ('nl-eredivisie',   'fixturedownload', 'eredivisie',         'Eredivisie',           'football', 'Netherlands',    'league',   'split', true,  40),
  ('de-bundesliga',   'fixturedownload', 'bundesliga',         'Bundesliga',           'football', 'Germany',        'league',   'split', false, 41),
  ('it-serie-a',      'fixturedownload', 'serie-a',            'Serie A',              'football', 'Italy',          'league',   'split', false, 42),
  ('fr-ligue-1',      'fixturedownload', 'ligue-1',            'Ligue 1',              'football', 'France',         'league',   'split', false, 43),
  ('pt-primeira',     'fixturedownload', 'primeira-liga',      'Primeira Liga',        'football', 'Portugal',       'league',   'split', false, 44),
  ('uefa-cl',         'fixturedownload', 'champions-league',   'Champions League',     'football', 'Europe',         'cup',      'split', true,  50),
  ('uefa-el',         'fixturedownload', 'europa-league',      'Europa League',        'football', 'Europe',         'cup',      'split', true,  51),
  ('uefa-ecl',        'fixturedownload', 'conference-league',  'Conference League',    'football', 'Europe',         'cup',      'split', false, 52),
  ('uefa-nations',    'fixturedownload', 'nations-league',     'Nations League',       'football', 'National teams', 'national', 'split', true,  60),
  ('intl-friendlies', 'thesportsdb',     '4562',               'Friendlies',           'football', 'National teams', 'national', 'year',  true,  61),
  ('fifa-world-cup',  'thesportsdb',     '4429',               'World Cup',            'football', 'National teams', 'national', 'year',  false, 62),
  ('uefa-euro',       'thesportsdb',     '4502',               'European Championship', 'football', 'National teams', 'national', 'year', false, 63),
  ('ufc',             'wikipedia',       'List_of_UFC_events', 'UFC',                  'ufc',      'Fights',         'fight',    'year',  true,  90),
  ('boxing',          'thesportsdb',     '4445',               'Boxing',               'boxing',   'Fights',         'fight',    'year',  true,  91)
on conflict (code) do nothing;
