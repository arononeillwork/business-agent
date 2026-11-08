-- The League of Ireland on the Sports page: the Premier Division, the First Division and the FAI Cup, from
-- TheSportsDB (league ids 4643, 4757 and 5638, as its search_all_leagues and lookupleague calls list them),
-- in every business's catalogue and followed by none yet, like GAA (the ireland_screens migration). The
-- Sports page offers them first in Ireland, after the GAA (homeFirst in shared/sports.ts); the last round of
-- each division and the FAI Cup final are the big nights (isBigEvent). Their seasons run within the year
-- (TheSportsDB's "2026"). A new business copies the catalogue (seed_new_business()).
insert into public.sports_competitions (business_id, code, source, source_id, name, sport, region, kind, season_style, followed, sort)
select b.id, x.code, 'thesportsdb', x.source_id, x.name, 'football', 'Ireland', x.kind, 'year', false, x.sort
  from public.business b
 cross join (values
   ('ie-premier-division', '4643', 'League of Ireland Premier Division', 'league', 105),
   ('ie-first-division',   '4757', 'League of Ireland First Division',   'league', 106),
   ('ie-fai-cup',          '5638', 'FAI Cup',                            'cup',    107)) x(code, source_id, name, kind, sort)
on conflict (business_id, code) do nothing;
