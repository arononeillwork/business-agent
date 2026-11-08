-- The League of Ireland on the Sports page (the league_of_ireland migration): every business has the Premier
-- Division, the First Division and the FAI Cup in its sports catalogue, from TheSportsDB and followed by none;
-- a business made since (in Ireland or Spain) copies them; an admin can follow one, only in their own business.

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.headers', '', false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

reset role;
do $$
begin
  -- Every business with a sports catalogue (those the tests made by hand have none): all three, none followed.
  assert not exists (select 1 from public.business b
                      where exists (select 1 from public.sports_competitions s where s.business_id = b.id and s.sport = 'gaa')
                        and (select count(*) from public.sports_competitions s where s.business_id = b.id and s.code like 'ie-%') <> 3),
    'the three in every business''s catalogue';
  assert exists (select 1 from public.sports_competitions where code = 'ie-fai-cup'), 'there at all';
  assert not exists (select 1 from public.sports_competitions where code like 'ie-%' and followed), 'followed by nobody';
  assert (select array_agg(source_id order by sort) = array['4643', '4757', '5638']
            and bool_and(source = 'thesportsdb' and sport = 'football' and region = 'Ireland' and season_style = 'year')
            from public.sports_competitions
           where business_id = (select min(business_id) from public.sports_competitions where code = 'ie-fai-cup') and code like 'ie-%'),
    'TheSportsDB''s league ids, Irish football, seasons within the year';
end $$;

insert into auth.users (email, raw_user_meta_data) values
  ('galway@test', '{"full_name":"Orla"}'), ('malaga@test', '{"full_name":"Lola"}');

select pg_temp.act_as('galway@test');
do $$
declare
  v_id int := public.create_business('The Salthill Cup', 'cafe', null, null, 'IE');
begin
  assert (select array_agg(code order by sort) = array['ie-premier-division', 'ie-first-division', 'ie-fai-cup']
            from public.sports_competitions where region = 'Ireland' and sport = 'football'),
    'a new Irish business has them, after the GAA';
  assert (select bool_and(not followed) and min(sort) > (select max(sort) from public.sports_competitions where sport = 'gaa')
            from public.sports_competitions where code like 'ie-%'), 'not followed, and sorted after the GAA';
  update public.sports_competitions set followed = true where code = 'ie-premier-division';
  assert (select followed from public.sports_competitions where code = 'ie-premier-division'), 'an admin follows the Premier Division';
end $$;

select pg_temp.act_as('malaga@test');
do $$
declare
  v_id int := public.create_business('Café La Malagueta', 'cafe', null, null, 'ES');
begin
  assert (select count(*) = 3 and bool_and(not followed) from public.sports_competitions where code like 'ie-%'),
    'a Spanish business has them too, not followed (the other business''s choice isn''t seen here)';
end $$;
reset role;
