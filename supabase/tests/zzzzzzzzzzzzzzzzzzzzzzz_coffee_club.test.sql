-- The coffee club (the coffee_club migration): admins read the club, its members and their coffees; nobody changes
-- them from the app, only the Worker (the service role, for one business), and what it writes is that business's.
-- The rules hold: the name tidied, a link with its id, a member's status as Square's, a coffee's week a Monday and a
-- sale's line counted once. Another business's club is its own. Its own people and rows, removed at the end.

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

-- The Worker: the service role, for one business.
create function pg_temp.as_worker(p_business int) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('app.business_id', p_business::text, false);
  set role service_role;
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
  ('cc-owner@test', '{"full_name": "Olga", "role": "admin", "business_id": "1"}', now()),
  ('cc-ana@test', '{"full_name": "Ana", "role": "employee", "business_id": "1"}', now());

-- 1. The Worker sets Easy Beans' club up, with a member and a coffee: Easy Beans' rows, the name tidied.
select pg_temp.as_worker(1);
insert into public.coffee_club (name, price, coffees_per_week, max_value, square_variation_id, square_discount_id, square_link_id, signup_url)
values ('  Coffee   club ', 10, 1, 5, 'V1', 'D1', 'PL1', 'https://square.link/u/club');
insert into public.coffee_club_members (square_subscription_id, square_customer_id, status, started_on)
values ('cc-S1', 'cc-SQC1', 'active', '2026-11-01');
insert into public.coffee_club_coffees (square_order_id, square_line_uid, member_id, item, quantity, value, at, week)
select 'cc-O1', 'L1', id, 'Flat White', 1, 3.8, '2026-11-25T09:30:00Z', '2026-11-23' from public.coffee_club_members where square_subscription_id = 'cc-S1';
do $$ begin
  assert (select name = 'Coffee club' and business_id = 1 and selling and till_language = 'en' from public.coffee_club), 'tidied, Easy Beans''';
  assert (select business_id = 1 and paid from public.coffee_club_members where square_subscription_id = 'cc-S1'), 'its member, paid until told';
  assert (select business_id = 1 and problem is null from public.coffee_club_coffees where square_order_id = 'cc-O1'), 'its coffee, counted';
end $$;

-- 2. The rules.
select pg_temp.expect_error($$insert into public.coffee_club_coffees (square_order_id, square_line_uid, at, week) values ('cc-O1', 'L1', now(), '2026-11-23')$$, 'coffee_club_coffees_line_key');
select pg_temp.expect_error($$insert into public.coffee_club_coffees (square_order_id, square_line_uid, at, week) values ('cc-O2', 'L1', now(), '2026-11-24')$$, 'coffee_club_coffees_week_check');
select pg_temp.expect_error($$insert into public.coffee_club_coffees (square_order_id, square_line_uid, at, week, problem) values ('cc-O3', 'L1', now(), '2026-11-23', 'lost')$$, 'coffee_club_coffees_problem_check');
select pg_temp.expect_error($$insert into public.coffee_club_members (square_subscription_id, square_customer_id, status) values ('cc-S2', 'cc-SQC2', 'gone')$$, 'coffee_club_members_status_check');
select pg_temp.expect_error($$insert into public.coffee_club_members (square_subscription_id, square_customer_id, status) values ('cc-S1', 'cc-SQC9', 'active')$$, 'coffee_club_members_subscription_key');
select pg_temp.expect_error($$update public.coffee_club set signup_url = null$$, 'coffee_club_link');
select pg_temp.expect_error($$update public.coffee_club set name = '   '$$, 'Give the club a name');
select pg_temp.expect_error($$update public.coffee_club set price = 0$$, 'coffee_club_price_check');
-- When it was set up stays.
update public.coffee_club set set_up_at = '2020-01-01', price = 12;
do $$ begin assert (select set_up_at > '2026-01-01' and price = 12 from public.coffee_club), 'set up when it was'; end $$;

-- Each member has a code of their own (the club_member_codes migration), which never changes.
insert into public.coffee_club_members (square_subscription_id, square_customer_id, status) values ('cc-S3', 'cc-SQC3', 'active');
do $$ begin
  assert (select bool_and(card_code ~ '^[A-HJ-NP-Z2-9]{8}$') from public.coffee_club_members where square_subscription_id like 'cc-%'), 'a code each, readable';
  assert (select count(distinct card_code) = 2 from public.coffee_club_members where square_subscription_id in ('cc-S1', 'cc-S3')), 'their own';
end $$;
update public.coffee_club_members set card_code = 'AAAA2222', paid = false where square_subscription_id = 'cc-S3';
do $$ begin
  assert (select card_code <> 'AAAA2222' and not paid from public.coffee_club_members where square_subscription_id = 'cc-S3'), 'the code stays';
end $$;
delete from public.coffee_club_members where square_subscription_id = 'cc-S3';

-- 3. Admins read it all; an employee sees none; nobody changes it from the app.
select pg_temp.act_as('cc-owner@test');
do $$ begin
  assert (select count(*) from public.coffee_club) = 1, 'the club';
  assert (select count(*) from public.coffee_club_members where square_subscription_id = 'cc-S1') = 1, 'its members';
  assert (select count(*) from public.coffee_club_coffees where square_order_id = 'cc-O1') = 1, 'their coffees';
end $$;
select pg_temp.expect_error($$update public.coffee_club set price = 1$$, 'permission denied');
select pg_temp.expect_error($$update public.coffee_club_members set paid = false$$, 'permission denied');
select pg_temp.expect_error($$delete from public.coffee_club_coffees$$, 'permission denied');
select pg_temp.act_as('cc-ana@test');
do $$ begin
  assert not exists (select 1 from public.coffee_club), 'an employee sees no club';
  assert not exists (select 1 from public.coffee_club_members), 'nor members';
  assert not exists (select 1 from public.coffee_club_coffees), 'nor coffees';
end $$;

-- 4. Another business's club is its own: the same Square ids there are its rows, and Easy Beans' are untouched.
-- (Made and undone in one transaction, by its own number, so the businesses later tests make keep theirs.)
reset role; select set_config('request.jwt.claim.sub', '', false);
begin;
select set_config('app.business_id', '92', true);
insert into public.business (id, name, timezone, opening_hours) values (92, 'Bar Noventa y Dos', 'Europe/Madrid', '{}');
insert into public.settings default values;
insert into public.business_admin_notes default values;
insert into public.billing default values;
select set_config('app.business_id', '92', false);
set local role service_role;
insert into public.coffee_club (name, price, max_value) values ('Club', 8, 4);
insert into public.coffee_club_members (square_subscription_id, square_customer_id, status) values ('cc-S1', 'cc-SQC1', 'active');
insert into public.coffee_club_coffees (square_order_id, square_line_uid, at, week) values ('cc-O1', 'L1', now(), '2026-11-23');
reset role;
do $$ begin
  assert (select count(*) from public.coffee_club_members where square_subscription_id = 'cc-S1') = 2, 'one each';
  assert (select price = 12 from public.coffee_club where business_id = 1), 'Easy Beans'' club untouched';
  assert (select business_id = 92 from public.coffee_club where name = 'Club'), 'Bar Noventa y Dos'' own';
end $$;
rollback;

-- Tidy up: this test's people and rows.
reset role; select set_config('request.jwt.claim.sub', '', false); select set_config('app.business_id', '', false);
delete from public.coffee_club_coffees where business_id = 1 and square_order_id like 'cc-%';
delete from public.coffee_club_members where business_id = 1 and square_subscription_id like 'cc-%';
delete from public.coffee_club where business_id = 1;
delete from auth.users where email like 'cc-%@test';
