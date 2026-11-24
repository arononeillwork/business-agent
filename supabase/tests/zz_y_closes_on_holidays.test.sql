-- Closed on public holidays, for the team: anyone on the team reads the Opening hours setting kept with the
-- Google Maps connection (the connection itself stays the admins'); none set or no connection is open on them.
-- Its own people; the business's connection put back as it was at the end.

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

reset role; select set_config('request.jwt.claim.sub', '', false);
insert into auth.users (email, raw_user_meta_data, invited_at) values
  ('coh-owner@test', '{"full_name": "Olga"}', now()),
  ('coh-employee@test', '{"full_name": "Eva"}', now());
update public.profiles set role = 'admin' where email = 'coh-owner@test';
create temp table coh_was as select * from public.integrations where provider = 'google_business';
grant select on coh_was to public;
delete from public.integrations where provider = 'google_business';

-- No Google connection: open on public holidays.
select pg_temp.act_as('coh-employee@test');
do $$ begin
  assert public.closes_on_holidays() = false, 'no connection, no setting';
  assert (select count(*) from public.integrations) = 0, 'an employee doesn''t see the connections';
end $$;

-- Ticked on Opening hours: an employee reads it, without seeing the connection.
reset role; select set_config('request.jwt.claim.sub', '', false);
insert into public.integrations (provider, status, external)
  values ('google_business', 'connected', '{"location": "locations/1", "closed_on_holidays": true}');
select pg_temp.act_as('coh-employee@test');
do $$ begin
  assert public.closes_on_holidays(), 'closed on public holidays';
  assert (select count(*) from public.integrations) = 0, 'still not the connection itself';
end $$;

-- Unticked.
reset role; select set_config('request.jwt.claim.sub', '', false);
update public.integrations set external = external || '{"closed_on_holidays": false}' where provider = 'google_business';
select pg_temp.act_as('coh-employee@test');
do $$ begin assert not public.closes_on_holidays(), 'open on them again'; end $$;

reset role; select set_config('request.jwt.claim.sub', '', false);
delete from public.integrations where provider = 'google_business';
insert into public.integrations select * from coh_was;
delete from auth.users where email in ('coh-owner@test', 'coh-employee@test');
