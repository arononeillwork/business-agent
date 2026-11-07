-- A Spanish business's region (the business_region migration): saved by its admin straight after
-- create_business(), as the app does, changed or cleared on Business, and only one of Spain's
-- communities or Ceuta or Melilla by its ISO 3166-2:ES code. Someone else's business can't be given one.

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
  ('sevilla@test', '{"full_name":"Rocío"}'), ('bilbao@test', '{"full_name":"Iker"}');

select pg_temp.act_as('sevilla@test');
do $$
declare
  v_id int := public.create_business(p_name => 'Café Triana', p_kind => 'cafe', p_timezone => 'Europe/Madrid', p_referral => null, p_country => 'ES');
  v_err text;
begin
  assert (select region is null from public.business where id = v_id), 'no region until one is picked';
  update public.business set region = 'AN' where id = v_id;
  assert (select region = 'AN' from public.business where id = v_id), 'Andalucía, saved by its admin';
  update public.business set region = 'CE' where id = v_id;
  assert (select region = 'CE' from public.business where id = v_id), 'Ceuta is one';
  begin update public.business set region = 'ES-AN' where id = v_id; exception when check_violation then v_err := sqlerrm; end;
  assert v_err like '%business_region_check%', 'only a code from the list: ' || coalesce(v_err, 'no error');
  v_err := null;
  begin update public.business set region = 'an' where id = v_id; exception when check_violation then v_err := sqlerrm; end;
  assert v_err is not null, 'capitals, as ISO writes them';
  update public.business set region = null where id = v_id;
  assert (select region is null from public.business where id = v_id), 'and it can be cleared';
  update public.business set region = 'AN' where id = v_id;
end $$;

-- Another business's admin doesn't reach it.
select pg_temp.act_as('bilbao@test');
do $$
declare v_mine int := public.create_business(p_name => 'Bar Txoko', p_kind => 'pub', p_timezone => 'Europe/Madrid', p_referral => null, p_country => 'ES');
begin
  update public.business set region = 'PV' where id = v_mine;
  update public.business set region = 'MD' where name = 'Café Triana';
  assert (select region = 'PV' from public.business where id = v_mine), 'País Vasco for its own';
end $$;
reset role;
do $$
begin
  assert (select region = 'AN' from public.business where name = 'Café Triana'), 'the other business''s region is as its admin left it';
end $$;
