-- Square PINs: the table is the Worker's alone. Nobody signed in reads, adds, changes or deletes a row,
-- not even an owner (the Worker shows owners everyone's and anyone else their own). Its own people and
-- rows, removed at the end.

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

create function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_err text;
begin
  begin execute p_sql; exception when others then v_err := sqlerrm; end;
  if v_err is null then raise exception 'Expected error like "%" but statement succeeded: %', p_like, p_sql; end if;
  if v_err not ilike '%' || p_like || '%' then raise exception 'Expected error like "%", got "%"', p_like, v_err; end if;
end $$;

reset role; select set_config('request.jwt.claim.sub', '', false);
insert into auth.users (email, raw_user_meta_data, invited_at) values
  ('sp-owner@test', '{"full_name": "Olga"}', now()),
  ('sp-staff@test', '{"full_name": "Ana"}', now());
update public.profiles set role = 'admin', can_see_pay = true where email = 'sp-owner@test';

-- The Worker (the service role) keeps one, sealed, for business 1.
insert into public.square_pins (business_id, profile_id, ciphertext)
select 1, id, 'sealed-not-a-pin' from public.profiles where email = 'sp-staff@test';
-- One per person in a business.
select pg_temp.expect_error($q$insert into public.square_pins (business_id, profile_id, ciphertext)
  select 1, id, 'again' from public.profiles where email = 'sp-staff@test'$q$, 'square_pins_pkey');

-- Nobody signed in touches the table: not an owner, not the person whose PIN it is.
select pg_temp.act_as('sp-owner@test');
select pg_temp.expect_error($q$select * from public.square_pins$q$, 'permission denied');
select pg_temp.expect_error($q$insert into public.square_pins (profile_id, ciphertext) values (auth.uid(), 'x')$q$, 'permission denied');
select pg_temp.expect_error($q$delete from public.square_pins$q$, 'permission denied');
select pg_temp.act_as('sp-staff@test');
select pg_temp.expect_error($q$select ciphertext from public.square_pins$q$, 'permission denied');
select pg_temp.expect_error($q$update public.square_pins set ciphertext = 'x'$q$, 'permission denied');

-- Removing someone removes their PIN.
reset role; select set_config('request.jwt.claim.sub', '', false);
delete from auth.users where email like 'sp-%@test';
do $$ begin
  assert not exists (select 1 from public.square_pins where ciphertext = 'sealed-not-a-pin'), 'the PIN went with the person';
end $$;
