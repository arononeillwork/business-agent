-- Rugby on the Sports page: the Six Nations, the Rugby Championship and the World Cup (national
-- teams), and the Premiership, the URC, the Top 14 and the Champions Cup (clubs), all from
-- TheSportsDB (league ids). The big ones for a café full of British and Irish fans are followed.
alter table public.sports_competitions drop constraint sports_competitions_sport_check;
alter table public.sports_competitions add constraint sports_competitions_sport_check
  check (sport in ('football', 'rugby', 'ufc', 'boxing'));

insert into public.sports_competitions (code, source, source_id, name, sport, region, kind, season_style, followed, sort) values
  ('rugby-six-nations',   'thesportsdb', '4714', 'Six Nations',               'rugby', 'National teams', 'national', 'year',  true,  70),
  ('rugby-championship',  'thesportsdb', '4986', 'Rugby Championship',        'rugby', 'National teams', 'national', 'year',  false, 71),
  ('rugby-world-cup',     'thesportsdb', '4574', 'Rugby World Cup',           'rugby', 'National teams', 'national', 'year',  true,  72),
  ('rugby-premiership',   'thesportsdb', '4414', 'Premiership Rugby',         'rugby', 'England',        'league',   'split', true,  73),
  ('rugby-urc',           'thesportsdb', '4446', 'United Rugby Championship', 'rugby', 'Europe',         'league',   'split', false, 74),
  ('rugby-top-14',        'thesportsdb', '4430', 'Top 14',                    'rugby', 'France',         'league',   'split', false, 75),
  ('rugby-champions-cup', 'thesportsdb', '4550', 'Champions Cup',             'rugby', 'Europe',         'cup',      'split', true,  76)
on conflict (code) do nothing;
