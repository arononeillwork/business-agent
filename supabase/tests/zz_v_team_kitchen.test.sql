-- Expenses & mileage, Hiring, Food safety, Allergens and Tips: who may do what (the database's
-- rules, not just the app's), mileage worked out here, interviews on the calendar, checks kept and
-- out-of-range readings in the bell, the team reading the menu's allergens, and tips adding up.
-- People from the tests before it: maria (admin with pay access), julio (employee). Added here:
-- an admin without pay access, a gestoría with finances and payroll access, and someone uninvited.

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

reset role;
insert into auth.users (email, raw_user_meta_data, invited_at) values
  ('nopay-admin@test', '{"full_name": "Mark"}', now()),
  ('pages-gestoria@test', '{"full_name": "Rosa", "role": "partner", "partner_company": "Gestoría Sol", "partner_access": ["finances", "payroll"]}', now());
update public.profiles set role = 'admin', can_see_pay = false where email = 'nopay-admin@test';
-- Someone who signed up without an invite: switched off.
insert into auth.users (email, raw_user_meta_data) values ('uninvited@test', '{"full_name": "Nobody"}');

-- 1. Expenses & mileage -----------------------------------------------------------------------------
select pg_temp.act_as('julio@test');
do $$
declare v_trip uuid; v_buy uuid;
begin
  insert into public.expense_claims (kind, description, km, return_trip, status, rate_per_km)
    values ('mileage', '  Cash & Carry run ', 9.5, true, 'paid', null) returning id into v_trip;
  assert (select description = 'Cash & Carry run' and status = 'submitted' and rate_per_km = 0.26 and amount = 4.94 and profile_id = auth.uid()
            from public.expense_claims where id = v_trip), 'mileage worked out at the business’s rate; always sent to approve';
  insert into public.expense_claims (description, amount, km) values ('Parking', 6, 12) returning id into v_buy;
  assert (select km is null and amount = 6 from public.expense_claims where id = v_buy), 'an expense has no kilometres';
  update public.expense_claims set status = 'approved', amount = 60 where id = v_buy;
  assert (select status = 'submitted' and amount = 60 from public.expense_claims where id = v_buy), 'their own, changed while it waits, never approved by them';
end $$;
select pg_temp.act_as('maria@test');
do $$ begin
  assert (select count(*) from public.notifications where title like 'Expense to approve: Julio, %' and profile_id = auth.uid()) = 2, 'admins with pay access hear';
  assert (select count(*) from public.expense_claims) = 2, 'and see everyone’s';
  update public.expense_claims set status = 'approved' where description = 'Parking';
  assert (select decided_by = auth.uid() and decided_at is not null from public.expense_claims where description = 'Parking'), 'who decided and when';
  update public.expense_claims set status = 'paid' where description = 'Parking';
  assert (select paid_on = current_date and decided_by = auth.uid() from public.expense_claims where description = 'Parking'), 'paid: today, still the approval’s';
end $$;
select pg_temp.act_as('julio@test');
do $$ declare n int; begin
  assert (select count(*) from public.notifications where title like 'Expense paid back: Parking%') = 1, 'the person hears';
  update public.expense_claims set amount = 600 where description = 'Parking'; get diagnostics n = row_count;
  assert n = 0, 'decided: no longer theirs to change';
  delete from public.expense_claims where description = 'Parking'; get diagnostics n = row_count;
  assert n = 0, 'nor to take back';
end $$;
select pg_temp.expect_error($q$insert into public.expense_claims (kind, description) values ('mileage', 'No km')$q$, 'Enter the kilometres');
select pg_temp.act_as('nopay-admin@test');
do $$ begin
  assert (select count(*) from public.expense_claims) = 0, 'an admin without pay access sees only their own';
end $$;
select pg_temp.act_as('pages-gestoria@test');
do $$ declare n int; begin
  assert (select count(*) from public.expense_claims) = 2, 'the gestoría reads them all';
  update public.expense_claims set amount = 0; get diagnostics n = row_count;
  assert n = 0, 'and changes none';
end $$;

-- 2. Hiring: admins only; an interview goes on the calendar for admins ------------------------------
select pg_temp.act_as('nopay-admin@test');
do $$
declare v_job uuid; v_a uuid;
begin
  insert into public.job_openings (title, posted_on, hours_per_week) values (' Weekend barista ', '{instagram,infojobs,instagram}', 16) returning id into v_job;
  assert (select title = 'Weekend barista' and posted_on = '{infojobs,instagram}' from public.job_openings where id = v_job), 'tidied, each board once';
  insert into public.applicants (opening_id, full_name, email, applied_on, interview_at, stage)
    values (v_job, 'Lucía Romero', ' Lucia@Example.ES ', '2026-02-28', now() + interval '1 day', 'interview') returning id into v_a;
  assert (select email = 'lucia@example.es' and keep_until = '2027-02-28' from public.applicants where id = v_a), 'kept a year from applying';
  assert (select count(*) from public.calendar_events where external_id = 'interview:' || v_a and visibility = 'admins'
            and title = 'Interview: Lucía Romero (Weekend barista)') = 1, 'the interview is on the calendar, for admins';
  update public.applicants set stage = 'rejected' where id = v_a;
  assert (select count(*) from public.calendar_events where external_id = 'interview:' || v_a) = 0, 'and off it once they’re out';
end $$;
select pg_temp.expect_error($q$insert into public.job_openings (title, posted_on) values ('X', '{monster}')$q$, 'check constraint');
select pg_temp.act_as('julio@test');
do $$ begin
  assert (select count(*) from public.job_openings) = 0 and (select count(*) from public.applicants) = 0, 'employees see no hiring';
end $$;
select pg_temp.expect_error($q$insert into public.job_openings (title) values ('Sneaky')$q$, 'row-level security');

-- 3. Food safety: the team records; checks are kept; out of range needs what was done --------------
select pg_temp.act_as('maria@test');
do $$ begin
  insert into public.food_safety_points (name, min_temp, max_temp, frequency) values ('Kitchen fridge', 0, 4, 'twice_daily');
  insert into public.food_safety_points (name, kind, frequency) values ('Coffee machine backflush', 'task', 'daily');
end $$;
select pg_temp.expect_error($q$insert into public.food_safety_points (name, kind, max_temp) values ('X', 'task', 4)$q$, 'food_safety_points_limits');
select pg_temp.act_as('julio@test');
do $$ begin
  insert into public.food_safety_checks (point_id, reading, checked_at, by)
    values ((select id from public.food_safety_points where name = 'Kitchen fridge'), 3.2, '2020-01-01', null);
  assert (select ok and by = auth.uid() and checked_at > now() - interval '1 minute' from public.food_safety_checks where reading = 3.2), 'the server’s time and whoever is signed in';
  insert into public.food_safety_checks (point_id, reading) values ((select id from public.food_safety_points where kind = 'task'), 99);
  assert (select reading is null and ok from public.food_safety_checks where point_id = (select id from public.food_safety_points where kind = 'task')), 'a job has no reading';
end $$;
select pg_temp.expect_error($q$insert into public.food_safety_checks (point_id) values ((select id from public.food_safety_points where name = 'Kitchen fridge'))$q$, 'Enter what it read');
select pg_temp.expect_error($q$insert into public.food_safety_checks (point_id, reading) values ((select id from public.food_safety_points where name = 'Kitchen fridge'), 7.5)$q$, 'say what was done');
do $$ declare n int; begin
  insert into public.food_safety_checks (point_id, reading, action) values ((select id from public.food_safety_points where name = 'Kitchen fridge'), 7.5, 'Door left open: closed it');
  update public.food_safety_checks set reading = 3; get diagnostics n = row_count;
  assert n = 0, 'nobody changes a check';
  delete from public.food_safety_checks; get diagnostics n = row_count;
  assert n = 0, 'or deletes one';
end $$;
select pg_temp.expect_error($q$insert into public.food_safety_points (name) values ('Sneaky')$q$, 'row-level security');
select pg_temp.act_as('maria@test');
do $$ begin
  assert (select count(*) from public.notifications where title = 'Out of range: Kitchen fridge 7.5 °C' and body = 'Door left open: closed it' and profile_id = auth.uid()) = 1,
    'admins hear about an out-of-range reading';
end $$;
select pg_temp.expect_error($q$delete from public.food_safety_points where name = 'Kitchen fridge'$q$, 'switch it off instead');
select pg_temp.act_as('pages-gestoria@test');
do $$ begin
  assert (select count(*) from public.food_safety_checks) = 0, 'outside businesses don’t see the kitchen’s records';
end $$;

-- 4. Allergens: admins set an item's; the team reads the menu's ------------------------------------
select pg_temp.act_as('maria@test');
do $$
declare v_milk uuid; v_oat uuid; v_bun uuid; v_r uuid; v_v uuid; m jsonb;
begin
  insert into public.stock_items (name, unit, allergens) values ('Allergen milk', 'l', '{milk,milk}') returning id into v_milk;
  insert into public.stock_items (name, unit, allergens, may_contain) values ('Allergen oat milk', 'l', '{gluten}', '{gluten,nuts}') returning id into v_oat;
  insert into public.stock_items (name, unit) values ('Allergen bun', 'unit') returning id into v_bun;
  assert (select allergens = '{milk}' from public.stock_items where id = v_milk), 'each once';
  assert (select may_contain = '{nuts}' from public.stock_items where id = v_oat), 'a trace of what it contains isn’t a trace';
  assert (select allergens is null from public.stock_items where id = v_bun), 'not said yet: null, not none';
  insert into public.recipes (name, sell_price) values ('Allergen latte', 3) returning id into v_r;
  insert into public.recipe_variants (recipe_id, name) values (v_r, 'Oat milk') returning id into v_v;
  insert into public.recipe_lines (recipe_id, item_id, quantity, unit) values (v_r, v_milk, 200, 'ml');
  insert into public.recipe_lines (recipe_id, variant_id, item_id, quantity, unit, replaces_item_id) values (v_r, v_v, v_oat, 200, 'ml', v_milk);
  m := public.menu_allergens();
  assert jsonb_path_exists(m, '$.dishes[*] ? (@.name == "Allergen latte" && @.variants[0].name == "Oat milk")'), 'the dish with its variant';
  assert not jsonb_path_exists(m, '$.items[*] ? (@.name == "Allergen bun")'), 'only items in the menu';
  assert jsonb_path_exists(m, '$.items[*] ? (@.name == "Allergen oat milk" && @.allergens[0] == "gluten")'), 'with their allergens';
end $$;
select pg_temp.expect_error($q$update public.stock_items set allergens = '{wheat}' where name = 'Allergen bun'$q$, 'check constraint');
select pg_temp.act_as('julio@test');
do $$ declare n int; begin
  assert jsonb_path_exists(public.menu_allergens(), '$.dishes[*] ? (@.name == "Allergen latte")'), 'the team reads the menu’s allergens';
  assert not jsonb_path_exists(public.menu_allergens(), '$.dishes[*].lines[*] ? (@.quantity > 1)'), 'without the quantities';
  assert (select count(*) from public.recipes) = 0, 'though not the recipes themselves';
  update public.stock_items set allergens = '{}'; get diagnostics n = row_count;
  assert n = 0, 'and changes no allergens';
end $$;
select pg_temp.act_as('uninvited@test');
do $$ begin
  assert public.menu_allergens() is null, 'nothing for someone not on the team';
end $$;

-- 5. Tips: admins with pay access share them out; the shares add up; each sees their own ----------
select pg_temp.act_as('nopay-admin@test');
select pg_temp.expect_error($q$select public.save_tip_pool('{"starts_on": "2026-09-21", "ends_on": "2026-09-27", "cash": 10}', '[]')$q$, 'Only admins with pay access');
select pg_temp.act_as('maria@test');
do $$
declare v_pool uuid; v_julio uuid := (select id from public.profiles where email = 'julio@test'); v_me uuid := auth.uid();
begin
  v_pool := public.save_tip_pool('{"starts_on": "2026-09-21", "ends_on": "2026-09-27", "cash": 64.8, "card": 38.2, "split": "hours", "status": "draft"}',
    jsonb_build_array(jsonb_build_object('profile_id', v_julio, 'minutes', 600, 'amount', 50)));
  assert (select count(*) from public.tip_shares where pool_id = v_pool) = 1, 'a draft needn’t add up yet';
  begin
    perform public.save_tip_pool(jsonb_build_object('id', v_pool, 'starts_on', '2026-09-21', 'ends_on', '2026-09-27', 'cash', 64.8, 'card', 38.2, 'status', 'shared'),
      jsonb_build_array(jsonb_build_object('profile_id', v_julio, 'minutes', 600, 'amount', 50)));
    raise exception 'shares that don’t add up were saved';
  exception when others then
    if sqlerrm not like 'The shares add up to %' then raise; end if;
  end;
  perform public.save_tip_pool(jsonb_build_object('id', v_pool, 'starts_on', '2026-09-21', 'ends_on', '2026-09-27', 'cash', 64.8, 'card', 38.2, 'status', 'shared'),
    jsonb_build_array(jsonb_build_object('profile_id', v_julio, 'minutes', 600, 'amount', 60), jsonb_build_object('profile_id', v_me, 'minutes', 500, 'amount', 43)));
  assert (select status = 'shared' from public.tip_pools where id = v_pool), 'shared out';
  assert (select count(*) from public.tip_shares where pool_id = v_pool) = 2, 'the shares replaced';
  perform public.save_tip_pool('{"starts_on": "2026-09-28", "ends_on": "2026-10-04", "cash": 20}',
    jsonb_build_array(jsonb_build_object('profile_id', v_julio, 'minutes', 60, 'amount', 20)));
end $$;
select pg_temp.expect_error($q$select public.save_tip_pool('{"starts_on": "2026-09-01", "ends_on": "2026-12-31"}', '[]')$q$, 'tip_pools_dates');
select pg_temp.act_as('julio@test');
do $$ begin
  assert (select count(*) from public.notifications where title = 'Your tips: 60.00 €' and link = '/tips') = 1, 'they hear what’s theirs, once';
  assert (select count(*) from public.tip_pools) = 1, 'only the pool shared out with them (not the draft)';
  assert (select count(*) from public.tip_shares) = 1 and (select amount from public.tip_shares) = 60, 'and only their own share';
end $$;
select pg_temp.expect_error($q$select public.save_tip_pool('{"starts_on": "2026-09-21", "ends_on": "2026-09-27"}', '[]')$q$, 'Only admins with pay access');
select pg_temp.act_as('pages-gestoria@test');
do $$ begin
  assert (select count(*) from public.tip_pools) = 2 and (select count(*) from public.tip_shares) = 3, 'a payroll gestoría reads all of them';
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
