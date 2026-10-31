-- Sales reps & rewards (who sees and does what, the list's limits, credit spent at the till and
-- commission paid out, nobody approving their own) and the staff kitty (the team reads, admins put
-- money in, and nothing takes it below what's been bought).
-- People from the tests before it: maria (admin), julio and aron (employees).

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

create function pg_temp.rep(p_name text) returns uuid language sql as $$ select id from public.sales_reps where name = p_name $$;
create function pg_temp.rule(p_name text) returns uuid language sql as $$ select id from public.reward_rules where name = p_name $$;

-- 1. Admins set up the list and the reps -----------------------------------------------------------
select pg_temp.act_as('maria@test');
insert into public.reward_rules (name, who, basis, amount, needs_approval, monthly_limit) values
  (' Reposted our story ', 'customers', 'fixed', 1, false, 2),
  ('Booked an event', 'reps', 'percent', 10, true, null),
  ('Brought a new customer', 'everyone', 'fixed', 3, false, null);
select pg_temp.expect_error($q$insert into public.reward_rules (name, basis, amount) values ('Half the shop', 'percent', 150)$q$, 'reward_rules_percent');
insert into public.sales_reps (name, kind, instagram) values ('Lucía García', 'customer', ' @Lucia.MBL ');
insert into public.sales_reps (name, kind, code) values ('Marco Bellini', 'ambassador', 'marco 1');
insert into public.sales_reps (name, kind, profile_id) select 'Julio', 'customer', id from public.profiles where email = 'julio@test';
do $$ begin
  assert (select name from public.reward_rules where name like '%story%') = 'Reposted our story', 'names tidied';
  assert (select code ~ '^LUCIA\d{2}$' and instagram = 'lucia.mbl' from public.sales_reps where name = 'Lucía García'), 'code from the name, handle tidied';
  assert (select code from public.sales_reps where name = 'Marco Bellini') = 'MARCO1', 'own code, in capitals';
  assert (select kind from public.sales_reps where name = 'Julio') = 'team', 'someone on the team is a team rep';
end $$;
select pg_temp.expect_error($q$insert into public.sales_reps (name, kind) values ('Nobody', 'team')$q$, 'Choose who on the team');
select pg_temp.expect_error($q$insert into public.sales_reps (name, code) values ('Copy', 'MARCO1')$q$, 'duplicate key');
select pg_temp.expect_error($q$insert into public.sales_reps (name, instagram) values ('Odd', 'not a handle!')$q$, 'check constraint');
update public.rep_settings set welcome_offer = '10% off your first drink';

-- 2. The team: sees every rep, adds customers, changes nothing else --------------------------------
select pg_temp.act_as('julio@test');
do $$ declare n int; begin
  assert (select count(*) from public.sales_reps) = 3, 'the team sees every rep';
  assert (select count(*) from public.reward_rules) = 3, 'and the list';
  assert (select welcome_offer from public.rep_settings) = '10% off your first drink', 'and what the cards offer';
  update public.sales_reps set code = 'MINE'; get diagnostics n = row_count;
  assert n = 0, 'but changes no rep';
  update public.rep_settings set welcome_offer = 'Free cake'; get diagnostics n = row_count;
  assert n = 0, 'nor the cards';
end $$;
-- Anyone on the team adds someone, a customer or an ambassador; they wait for an admin's OK.
insert into public.sales_reps (name, instagram) values ('Tom', 'tom_runs');
insert into public.sales_reps (name, kind) values ('Big Seller', 'ambassador');
do $$ begin
  assert (select count(*) from public.sales_reps where name in ('Tom', 'Big Seller') and not approved) = 2, 'both wait for an admin';
end $$;
select pg_temp.expect_error($q$insert into public.sales_reps (name, profile_id) select 'Not me', id from public.profiles where email = 'maria@test'$q$, 'row-level security');
select pg_temp.expect_error($q$select public.decide_rep(pg_temp.rep('Tom'), true)$q$, 'Only an admin');
select pg_temp.expect_error($q$insert into public.reward_rules (name, amount) values ('Everything free', 100)$q$, 'row-level security');
reset role;
do $$ begin
  assert (select count(*) from public.notifications n join public.profiles p on p.id = n.profile_id
           where p.email = 'maria@test' and n.link = '/sales-reps' and n.title = 'Julio added Tom as a rep: waiting for your OK') = 1, 'admins are told';
end $$;
-- An admin says yes to Tom and no to Big Seller (taken off).
select pg_temp.act_as('maria@test');
select public.decide_rep(pg_temp.rep('Tom'), true);
select public.decide_rep(pg_temp.rep('Big Seller'), false);
do $$ begin
  assert (select approved from public.sales_reps where name = 'Tom'), 'Tom is a rep';
  assert not exists (select 1 from public.sales_reps where name = 'Big Seller'), 'Big Seller isn''t';
end $$;
select pg_temp.expect_error($q$select public.decide_rep(pg_temp.rep('Tom'), true)$q$, 'already a rep');
select pg_temp.act_as('julio@test');

-- 3. Logging rewards: from the list, within its limit, for the right kind of rep -----------------
do $$ declare v uuid; begin
  v := public.log_reward(pg_temp.rep('Lucía García'), pg_temp.rule('Reposted our story'), p_note := 'Flat white story')->>'id';
  assert (select status = 'approved' and amount = 1 and label = 'Reposted our story' and logged_by = auth.uid() from public.rep_rewards where id = v),
    'a story counts straight away, for the list''s amount';
  perform public.log_reward(pg_temp.rep('Lucía García'), pg_temp.rule('Reposted our story'));
end $$;
select pg_temp.expect_error($q$select public.log_reward(pg_temp.rep('Lucía García'), pg_temp.rule('Reposted our story'))$q$, '2 times this month, the most there is');
select pg_temp.expect_error($q$select public.log_reward(pg_temp.rep('Marco Bellini'), pg_temp.rule('Reposted our story'))$q$, 'a reward for customers');
select pg_temp.expect_error($q$select public.log_reward(pg_temp.rep('Lucía García'), pg_temp.rule('Booked an event'), 100)$q$, 'a reward for reps');
select pg_temp.expect_error($q$select public.log_reward(pg_temp.rep('Marco Bellini'), pg_temp.rule('Booked an event'))$q$, 'amount of the sale');
select pg_temp.expect_error($q$select public.log_reward(pg_temp.rep('Tom'), pg_temp.rule('Brought a new customer'), p_occurred_on := current_date + 2)$q$, 'still to come');
-- Last month's limit is last month's.
do $$ begin perform public.log_reward(pg_temp.rep('Lucía García'), pg_temp.rule('Reposted our story'), p_occurred_on := (date_trunc('month', current_date) - interval '1 day')::date); end $$;

-- Julio's own reward waits for an admin, even one that needs no approval; the admins hear about it.
do $$ declare v uuid; w uuid; begin
  v := public.log_reward(pg_temp.rep('Julio'), pg_temp.rule('Booked an event'), 245.50, 'Baby shower, 15 people')->>'id';
  w := public.log_reward(pg_temp.rep('Julio'), pg_temp.rule('Brought a new customer'))->>'id';
  assert public.log_reward(pg_temp.rep('Tom'), pg_temp.rule('Brought a new customer')) - 'id' = '{"status": "approved", "amount": 3}'::jsonb, 'what it says back';
  assert (select status = 'pending' and amount = 24.55 and sale_amount = 245.50 from public.rep_rewards where id = v), '10% of the sale, waiting';
  assert (select status from public.rep_rewards where id = w) = 'pending', 'his own always waits';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.notifications n join public.profiles p on p.id = n.profile_id
           where p.email = 'maria@test' and n.link = '/sales-reps' and n.title = 'Booked an event for Julio: €24.55 to approve') = 1, 'admins are told';
end $$;

-- 4. Credit spent at the till; commission only paid by admins -------------------------------------
select pg_temp.act_as('julio@test');
do $$ begin
  assert public.settle_reward(pg_temp.rep('Lucía García'), 1.5, 'Half a croissant') = 1.5, 'what''s left of Lucía''s credit';
  assert (select kind = 'redeem' and amount = -1.5 and label = 'Used at the till' from public.rep_rewards
           where rep_id = pg_temp.rep('Lucía García') and kind <> 'earn'), 'spent at the till';
end $$;
select pg_temp.expect_error($q$select public.settle_reward(pg_temp.rep('Lucía García'), 2)$q$, 'Lucía García has €1.50 of credit');
select pg_temp.expect_error($q$select public.settle_reward(pg_temp.rep('Marco Bellini'), 1)$q$, 'Only an admin can pay commission');
select pg_temp.expect_error($q$select public.decide_reward((select id from public.rep_rewards where status = 'pending' limit 1), true)$q$, 'Only an admin');
select pg_temp.expect_error($q$insert into public.rep_rewards (rep_id, label, amount) select pg_temp.rep('Tom'), 'Free money', 50$q$, 'row-level security');

select pg_temp.act_as('maria@test');
do $$ declare v uuid; begin
  v := public.log_reward(pg_temp.rep('Marco Bellini'), pg_temp.rule('Booked an event'), 400, 'Hotel breakfast')->>'id';
  assert (select status from public.rep_rewards where id = v) = 'approved', 'an admin''s counts straight away';
  perform public.decide_reward((select id from public.rep_rewards where rep_id = pg_temp.rep('Julio') and sale_amount is not null), true, 25);
  perform public.decide_reward((select id from public.rep_rewards where rep_id = pg_temp.rep('Julio') and sale_amount is null), false);
  assert public.settle_reward(pg_temp.rep('Julio'), 25, 'Bank transfer') = 0, 'Julio is paid what was approved';
  assert (select count(*) from public.rep_rewards where rep_id = pg_temp.rep('Julio') and kind = 'payout' and label = 'Commission paid') = 1, 'as commission';
end $$;
select pg_temp.expect_error($q$select public.settle_reward(pg_temp.rep('Marco Bellini'), 40.01)$q$, 'Marco Bellini has €40.00 owed');
select pg_temp.expect_error($q$select public.decide_reward((select id from public.rep_rewards where rep_id = pg_temp.rep('Julio') and status = 'rejected'), true)$q$, 'no longer waiting');

-- Commission is the admins' and the rep's own; customers' credit is for the whole team to see.
select pg_temp.act_as('aron@test');
do $$ begin
  assert (select count(*) from public.rep_rewards where rep_id = pg_temp.rep('Lucía García')) = 4, 'customers'' credit, for the till';
  assert (select count(*) from public.rep_rewards where rep_id in (pg_temp.rep('Julio'), pg_temp.rep('Marco Bellini'))) = 0, 'not other people''s commission';
end $$;
select pg_temp.act_as('julio@test');
do $$ begin
  assert (select count(*) from public.rep_rewards where rep_id = pg_temp.rep('Julio')) = 3, 'his own';
  assert (select count(*) from public.rep_rewards where rep_id = pg_temp.rep('Marco Bellini')) = 0, 'not Marco''s';
end $$;

-- An admin who is a rep doesn't approve or pay their own.
reset role;
insert into public.sales_reps (name, profile_id) select 'Maria', id from public.profiles where email = 'maria@test';
select pg_temp.act_as('maria@test');
do $$ declare v uuid; begin
  v := public.log_reward(pg_temp.rep('Maria'), pg_temp.rule('Brought a new customer'))->>'id';
  assert (select status from public.rep_rewards where id = v) = 'pending', 'an admin''s own waits too';
end $$;
select pg_temp.expect_error($q$select public.decide_reward((select id from public.rep_rewards where rep_id = pg_temp.rep('Maria')), true)$q$, 'Someone else approves your own');

-- A story from Instagram is rewarded once.
reset role;
insert into public.instagram_mentions (id, kind, username, mentioned_at) values ('story:m1', 'story', 'lucia.mbl', now());
select pg_temp.act_as('maria@test');
do $$ begin perform public.log_reward(pg_temp.rep('Tom'), pg_temp.rule('Brought a new customer'), p_mention_id := 'story:m1'); end $$;
select pg_temp.expect_error($q$select public.log_reward(pg_temp.rep('Tom'), pg_temp.rule('Brought a new customer'), p_mention_id := 'story:m1')$q$, 'duplicate key');

-- Someone who leaves the team keeps their code and what they're owed, as an ambassador.
reset role;
update public.sales_reps set profile_id = null where name = 'Julio';
do $$ begin assert (select kind from public.sales_reps where name = 'Julio') = 'ambassador', 'left the team'; end $$;

-- 5. The staff kitty --------------------------------------------------------------------------------
select pg_temp.act_as('julio@test');
do $$ declare n int; begin
  assert (select string_agg(name, ', ' order by sort) from public.kitty_goals) = 'Christmas party, Ray-Ban sunglasses for the café', 'the first two goals';
  assert (select icon from public.kitty_goals where sort = 2) = 'sunglasses', 'with their pictures';
  assert (select profit_percent from public.kitty_settings) = 10, '10% of what''s taken above breakeven';
  assert public.kitty_balance() = 0, 'nothing in yet';
  update public.kitty_settings set profit_percent = 50; get diagnostics n = row_count;
  assert n = 0, 'the team can''t change the share';
end $$;
select pg_temp.expect_error($q$insert into public.kitty_entries (kind, amount) values ('top_up', 1000)$q$, 'row-level security');

select pg_temp.act_as('maria@test');
insert into public.kitty_entries (kind, month, percent, amount, note)
values ('profit', (date_trunc('month', current_date) - interval '1 month')::date, 5, 300, ' 5% of last month ');
insert into public.kitty_entries (kind, amount, note, month) values ('top_up', 40, 'Tips jar', '2026-01-01');
do $$ begin
  assert public.kitty_balance() = 340, 'in the kitty';
  assert (select month is null and note = 'Tips jar' from public.kitty_entries where kind = 'top_up'), 'only a profit share has a month';
end $$;
select pg_temp.expect_error($q$insert into public.kitty_entries (kind, month, percent, amount) values ('profit', (date_trunc('month', current_date) - interval '1 month')::date, 5, 10)$q$, 'duplicate key');
select pg_temp.expect_error($q$insert into public.kitty_entries (kind, month, percent, amount) values ('profit', date_trunc('month', current_date)::date, 5, 10)$q$, 'once the month is over');
select pg_temp.expect_error($q$insert into public.kitty_entries (kind, month, percent, amount) values ('profit', '2026-06-15', 5, 10)$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.kitty_entries (kind, amount) values ('top_up', -5)$q$, 'kitty_entries_top_up');
select pg_temp.expect_error($q$update public.kitty_goals set spent = 400, bought_on = current_date where name = 'Christmas party'$q$, 'The kitty has €340.00: put more in first');
update public.kitty_goals set spent = 300, bought_on = current_date where name = 'Christmas party';
update public.kitty_goals set spent = 310 where name = 'Christmas party'; -- its own spend counts back
select pg_temp.expect_error($q$update public.kitty_goals set spent = 10 where name = 'Ray-Ban sunglasses for the café'$q$, 'kitty_goals_bought');
select pg_temp.expect_error($q$insert into public.kitty_entries (kind, amount) values ('adjust', -50)$q$, 'The kitty has €30.00');
select pg_temp.expect_error($q$delete from public.kitty_entries where kind = 'profit'$q$, 'That money has been spent');
insert into public.kitty_entries (kind, amount, note) values ('adjust', -5, 'Counted wrong');
insert into public.kitty_goals (name, icon, target, sort) values ('Latte art course', 'equipment', 240, 3);
select pg_temp.expect_error($q$insert into public.kitty_goals (name, icon, target) values ('A boat', 'yacht', 90000)$q$, 'check constraint');
select pg_temp.act_as('julio@test');
do $$ begin
  assert public.kitty_balance() = 25, 'the team sees what''s in it';
  assert (select count(*) from public.kitty_entries) = 3, 'and what went in';
end $$;
reset role;
