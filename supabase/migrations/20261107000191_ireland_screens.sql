-- Ireland on more screens (shared/country.ts): Ireland's kinds of employment contract, its job boards, GAA on
-- the Sports page, and Revenue's tax-free mileage rate for a business there. Spain's stay as they are, and
-- nothing here changes a row that's already saved (but an Irish business's mileage rate still at Spain's).

-- 1. Contracts: Ireland's kinds next to Spain's (IRISH_CONTRACT_KINDS in shared/contracts.ts): permanent, full
--    or part time, fixed-term, specified-purpose and casual.
alter table public.employment_contracts drop constraint employment_contracts_kind_check,
  add constraint employment_contracts_kind_check check (kind in ('indefinido', 'indefinido_parcial', 'fijo_discontinuo', 'temporal_produccion',
    'temporal_sustitucion', 'formativo', 'autonomo', 'permanent', 'permanent_part_time', 'fixed_term', 'specified_purpose', 'casual'));

-- 2. Hiring: IrishJobs.ie, Jobs.ie and JobsIreland.ie (the State's free job board) next to the others (shared/hiring.ts).
alter table public.job_openings drop constraint job_openings_posted_on_check,
  add constraint job_openings_posted_on_check
    check (posted_on <@ array['infojobs', 'indeed', 'linkedin', 'instagram', 'window', 'referral', 'other', 'irishjobs', 'jobsie', 'jobsireland']);
alter table public.applicants drop constraint applicants_source_check,
  add constraint applicants_source_check
    check (source in ('infojobs', 'indeed', 'linkedin', 'instagram', 'window', 'referral', 'other', 'irishjobs', 'jobsie', 'jobsireland'));

-- 3. Sports: the GAA's All-Ireland championships and National Leagues, from TheSportsDB (league ids), in every
--    business's catalogue and followed by none yet; the Sports page offers them first in Ireland. A new
--    business copies the catalogue (seed_new_business()).
alter table public.sports_competitions drop constraint sports_competitions_sport_check,
  add constraint sports_competitions_sport_check check (sport in ('football', 'rugby', 'ufc', 'boxing', 'gaa'));
insert into public.sports_competitions (business_id, code, source, source_id, name, sport, region, kind, season_style, followed, sort)
select b.id, x.code, 'thesportsdb', x.source_id, x.name, 'gaa', 'Ireland', x.kind, 'year', false, x.sort
  from public.business b
 cross join (values
   ('gaa-football-championship', '5564', 'All-Ireland Senior Football Championship', 'cup',    100),
   ('gaa-hurling-championship',  '5565', 'All-Ireland Senior Hurling Championship',  'cup',    101),
   ('gaa-football-league',       '5577', 'National Football League Division 1',       'league', 102),
   ('gaa-hurling-league-1a',     '5578', 'National Hurling League Division 1A',       'league', 103),
   ('gaa-hurling-league-1b',     '5579', 'National Hurling League Division 1B',       'league', 104)) x(code, source_id, name, kind, sort)
on conflict (business_id, code) do nothing;

-- 4. Expenses: a business in Ireland starts at Revenue's civil service motor travel rate for band 1 (someone's
--    first 1,500 business km in the year) for a car up to 1,200 cc, 41.8 cent a km, tax free for any car
--    (IRISH_MILEAGE in shared/claims.ts); Spain's start at its 0.26 €. Irish businesses already on Spain's move.
create or replace function public.default_mileage_rate() returns numeric
language sql stable set search_path = ''
as $$
  select case when (select b.country from public.business b where b.id = public.current_business_id()) = 'IE' then 0.418 else 0.26 end::numeric
$$;
alter table public.settings alter column mileage_rate set default public.default_mileage_rate();
update public.settings s set mileage_rate = 0.418
  from public.business b
 where b.id = s.business_id and b.country = 'IE' and s.mileage_rate = 0.26;
