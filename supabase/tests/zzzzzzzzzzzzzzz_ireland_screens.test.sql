-- Ireland on more screens (the ireland_screens migration): a business made in Ireland starts at Revenue's
-- mileage rate and one in Spain at Spain's; both have GAA in the sports catalogue, followed by neither; an
-- Irish contract, job board and GAA competition fit, and Spain's still do.

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.headers', '', false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

reset role;
insert into auth.users (email, raw_user_meta_data) values
  ('cork@test', '{"full_name":"Siobhán"}'), ('cadiz@test', '{"full_name":"Paco"}');

select pg_temp.act_as('cork@test');
do $$
declare
  v_id int := public.create_business('The Coffee Dock', 'cafe', null, null, 'IE');
  v_me uuid := (select id from public.profiles where email = 'cork@test');
  v_job uuid;
begin
  assert (select mileage_rate = 0.418 from public.settings), 'Revenue''s band 1 rate, up to 1,200 cc';
  assert (select count(*) = 5 and bool_and(not followed) and bool_and(region = 'Ireland') from public.sports_competitions where sport = 'gaa'),
    'GAA in the catalogue, not followed yet';
  insert into public.employment_contracts (profile_id, kind, starts_on) values (v_me, 'specified_purpose', '2026-11-09');
  insert into public.employment_contracts (profile_id, kind, starts_on) values (v_me, 'casual', '2026-11-09');
  insert into public.job_openings (title, posted_on) values ('Barista', array['irishjobs', 'jobsie', 'jobsireland', 'indeed']) returning id into v_job;
  insert into public.applicants (opening_id, full_name, source) values (v_job, 'Ciara Walsh', 'jobsireland');
  assert (select count(*) = 2 from public.employment_contracts), 'Irish contracts fit';
  assert (select count(*) = 1 from public.applicants where source = 'jobsireland'), 'an Irish job board fits';
end $$;

select pg_temp.act_as('cadiz@test');
do $$
declare
  v_id int := public.create_business('Bar La Caleta', 'pub', null, null, 'ES');
  v_err text;
begin
  assert (select mileage_rate = 0.26 from public.settings), 'Spain''s 0.26 €, as before';
  assert (select count(*) = 5 and bool_and(not followed) from public.sports_competitions where sport = 'gaa'), 'GAA there too, not followed';
  insert into public.job_openings (title, posted_on) values ('Camarero', array['infojobs']);
  begin
    insert into public.job_openings (title, posted_on) values ('Camarero', array['monster']);
  exception when check_violation then v_err := sqlerrm;
  end;
  assert v_err is not null, 'an unknown job board is still refused';
end $$;
reset role;
