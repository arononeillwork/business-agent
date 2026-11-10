-- What the database says when it refuses something, with its amounts the way the business's country writes
-- them (the error_amounts_by_country migration): the kitty, a customer's credit at the till and the AI
-- music's pay-per-use limit say "€1,234.50" in Ireland and "€1.234,50" in Spain. Each business's own,
-- side by side.

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.headers', '', false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

create function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_err text;
begin
  begin execute p_sql; exception when others then v_err := sqlerrm; end;
  if v_err is null then raise exception 'Expected error like "%" but statement succeeded: %', p_like, p_sql; end if;
  if v_err not like '%' || p_like || '%' then raise exception 'Expected error like "%", got "%"', p_like, v_err; end if;
end $$;

reset role;
insert into auth.users (email, raw_user_meta_data) values
  ('dingle@test', '{"full_name":"Siobhán"}'), ('nerja@test', '{"full_name":"Pilar"}');

-- Two cafés, one in each country, each with €1,234.50 in the kitty and a regular with €12.50 of credit.
create function pg_temp.set_up(p_email text, p_name text, p_country text) returns int language plpgsql as $$
declare v_id int;
begin
  perform pg_temp.act_as(p_email);
  v_id := public.create_business(p_name, 'cafe', null, null, p_country);
  insert into public.kitty_entries (kind, amount, note) values ('top_up', 1234.5, 'Tips jar');
  insert into public.sales_reps (name, code, kind) values ('Seán Regular', upper(left(p_country || md5(p_name), 8)), 'customer');
  reset role;
  insert into public.rep_rewards (business_id, rep_id, kind, label, amount, status)
  select v_id, id, 'earn', 'Brought a friend', 12.5, 'approved' from public.sales_reps where business_id = v_id and name = 'Seán Regular';
  return v_id;
end $$;
select pg_temp.set_up('dingle@test', 'Dingle Bay Coffee', 'IE');
select pg_temp.set_up('nerja@test', 'Café Balcón', 'ES');

-- Ireland: a decimal point, thousands with a comma.
select pg_temp.act_as('dingle@test');
select pg_temp.expect_error($q$insert into public.kitty_entries (kind, amount) values ('adjust', -2000)$q$, 'The kitty has €1,234.50');
select pg_temp.expect_error($q$insert into public.kitty_goals (name, target, spent, bought_on) values ('Coffee machine', 1500, 1500, current_date)$q$, 'The kitty has €1,234.50: put more in first');
select pg_temp.expect_error($q$select public.settle_reward((select id from public.sales_reps where name = 'Seán Regular'), 20)$q$, 'Seán Regular has €12.50 of credit');
select pg_temp.expect_error($q$select public.set_ai_music_limit(-1)$q$, 'The limit must be between €0 and €1,000');

-- Spain: a decimal comma, thousands with a point.
select pg_temp.act_as('nerja@test');
select pg_temp.expect_error($q$insert into public.kitty_entries (kind, amount) values ('adjust', -2000)$q$, 'The kitty has €1.234,50');
select pg_temp.expect_error($q$insert into public.kitty_goals (name, target, spent, bought_on) values ('Coffee machine', 1500, 1500, current_date)$q$, 'The kitty has €1.234,50: put more in first');
select pg_temp.expect_error($q$select public.settle_reward((select id from public.sales_reps where name = 'Seán Regular'), 20)$q$, 'Seán Regular has €12,50 of credit');
select pg_temp.expect_error($q$select public.set_ai_music_limit(-1)$q$, 'The limit must be between €0 and €1.000');

-- Within what there is, both go through as before.
select pg_temp.act_as('dingle@test');
do $$ begin
  assert public.settle_reward((select id from public.sales_reps where name = 'Seán Regular'), 2.5) = 10, 'credit used at the till';
end $$;
insert into public.kitty_entries (kind, amount) values ('adjust', -34.5);
do $$ begin assert public.kitty_balance() = 1200, 'the kitty after an adjustment'; end $$;
reset role;
