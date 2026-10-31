-- Sales reps' reach, crews and own page (the rep_reach_and_crews migration): rewards that grow with
-- reach, a crew's leader earning a share of what their crew earns, people waiting for an admin's OK,
-- and the page a rep opens from their link (what it shows, what they can send from it).
-- From the test before it: maria (admin), julio (employee); reps Lucía, Marco, Julio, Tom and Maria.

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.headers', '', false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

-- The Worker answering a rep's link: the service role, naming the business.
create function pg_temp.as_worker() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', 'service_role', false);
  perform set_config('request.headers', json_build_object('x-business-id', (select min(id) from public.business)::text)::text, false);
  set role service_role;
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
create function pg_temp.link(p_name text) returns text language sql as $$ select token from public.rep_links where rep_id = pg_temp.rep(p_name) $$;

-- Maria is an owner here (she sees pay): only an owner says yes to a new rep.
create temp table maria_pay_reach as select can_see_pay from public.profiles where email = 'maria@test';
update public.profiles set can_see_pay = true where email = 'maria@test';

-- 1. Reach, and what it does to a reward --------------------------------------------------------------
do $$ begin
  assert public.reach_multiplier(0) = 1 and public.reach_multiplier(999) = 1 and public.reach_multiplier(1000) = 2
     and public.reach_multiplier(9999) = 2 and public.reach_multiplier(10000) = 3 and public.reach_multiplier(50000) = 5
     and public.reach_multiplier(null) = 1, 'the steps: ×2 from 1,000, ×3 from 10,000, ×5 from 50,000';
end $$;

select pg_temp.act_as('maria@test');
insert into public.reward_rules (name, who, basis, amount, needs_approval, scales_with_reach) values ('Posted about us', 'everyone', 'fixed', 2, false, true);
select pg_temp.expect_error($q$insert into public.reward_rules (name, basis, amount, scales_with_reach) values ('Share of a party', 'percent', 10, true)$q$, 'reward_rules_reach_fixed');
insert into public.sales_reps (name, kind, instagram, instagram_followers, tiktok, tiktok_followers, community, notes)
values ('Coach Dani', 'ambassador', '@Dani.MMA', 6000, '@DaniFights', 1880, 120, 'Runs the MMA gym: 20 fighters');
do $$ begin
  assert (select reach = 8000 and approved and instagram = 'dani.mma' and tiktok = 'danifights' from public.sales_reps where name = 'Coach Dani'),
    'reach adds up the followers and the people they see; an admin''s rep is in straight away';
end $$;
select pg_temp.expect_error($q$update public.sales_reps set tiktok_followers = -1 where name = 'Coach Dani'$q$, 'check constraint');

-- Dani's own post: ×2 for reaching 8,000 people. A reward that doesn't grow with reach stays as it is.
do $$ declare v jsonb; begin
  v := public.log_reward(pg_temp.rep('Coach Dani'), pg_temp.rule('Posted about us'), p_note := 'Reel from the gym');
  assert v - 'id' = '{"status": "approved", "amount": 4}'::jsonb, '2 × 2';
  assert (select multiplier from public.rep_rewards where id = (v->>'id')::uuid) = 2, 'with the multiplier noted';
  v := public.log_reward(pg_temp.rep('Coach Dani'), pg_temp.rule('Brought a new customer'));
  assert (v->>'amount')::numeric = 3 and (select multiplier from public.rep_rewards where id = (v->>'id')::uuid) is null, 'the list''s amount';
end $$;

-- 2. A crew: someone on the team adds a fighter to Dani's crew; they wait for an admin's OK -------------
select pg_temp.act_as('julio@test');
insert into public.sales_reps (name, instagram, instagram_followers, leader_id) select 'Carlos', 'carlos.ko', 15000, pg_temp.rep('Coach Dani');
do $$ declare v jsonb; begin
  assert (select not approved and kind = 'customer' from public.sales_reps where name = 'Carlos'), 'Carlos waits';
  -- What the team logs for him waits with him: ×3 for 15,000 followers.
  v := public.log_reward(pg_temp.rep('Carlos'), pg_temp.rule('Posted about us'), p_note := 'Fight-week story');
  assert v - 'id' = '{"status": "pending", "amount": 6}'::jsonb, 'waits while Carlos does';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.notifications n join public.profiles p on p.id = n.profile_id
           where p.email = 'maria@test' and n.title = 'Julio added Carlos as a rep: waiting for your OK'
             and n.body = 'In Coach Dani’s crew · Reaches 15,000 people') = 1, 'admins are told who and how many people';
  assert (select count(*) from public.notifications n join public.profiles p on p.id = n.profile_id
           where p.email = 'maria@test' and n.title = 'Posted about us for Carlos: €6.00 to approve'
             and n.body = 'Julio · They''re waiting for your OK too · Fight-week story') = 1, 'and about his reward';
end $$;

-- Once Carlos is in, his reward counts, and Dani gets 10% of it.
select pg_temp.act_as('maria@test');
select public.decide_rep(pg_temp.rep('Carlos'), true);
do $$ declare v uuid := (select id from public.rep_rewards where rep_id = pg_temp.rep('Carlos')); begin
  assert (select status from public.rep_rewards where id = v) = 'approved', 'Carlos''s reward counts now';
  assert (select amount = 0.60 and status = 'approved' and label = 'Crew bonus · Carlos' and note = 'Posted about us'
            from public.rep_rewards where bonus_for = v), 'Dani''s crew bonus';
end $$;
-- Another reward for Carlos, from an admin: Dani's share comes with it. Turned down, there's none.
do $$ declare v uuid; begin
  v := public.log_reward(pg_temp.rep('Carlos'), pg_temp.rule('Brought a new customer'))->>'id';
  assert (select amount from public.rep_rewards where bonus_for = v) = 0.30, '10% of 3';
  delete from public.rep_rewards where id = v;
  assert not exists (select 1 from public.rep_rewards where bonus_for = v), 'taken off with it';
end $$;
-- Approved later: the share comes then.
update public.reward_rules set needs_approval = true where name = 'Posted about us';
select pg_temp.act_as('julio@test');
do $$ begin perform public.log_reward(pg_temp.rep('Carlos'), pg_temp.rule('Posted about us')); end $$;
select pg_temp.act_as('maria@test');
do $$ declare v uuid := (select id from public.rep_rewards where rep_id = pg_temp.rep('Carlos') and status = 'pending'); begin
  assert not exists (select 1 from public.rep_rewards where bonus_for = v), 'no share while it waits';
  perform public.decide_reward(v, true, 5);
  assert (select amount from public.rep_rewards where bonus_for = v) = 0.50, '10% of what was approved';
end $$;
update public.reward_rules set needs_approval = false where name = 'Posted about us';

-- One level: a leader is in no crew, and nobody is in their own.
select pg_temp.expect_error($q$update public.sales_reps set leader_id = pg_temp.rep('Carlos') where name = 'Lucía García'$q$, 'in someone else''s crew');
select pg_temp.expect_error($q$update public.sales_reps set leader_id = pg_temp.rep('Lucía García') where name = 'Coach Dani'$q$, 'leads a crew');
select pg_temp.expect_error($q$update public.sales_reps set leader_id = id where name = 'Lucía García'$q$, 'own crew');

-- The café's settings: no boost, and a crew's share changed.
update public.rep_settings set boost_by_reach = false, crew_share = 20;
do $$ declare v uuid; begin
  v := public.log_reward(pg_temp.rep('Carlos'), pg_temp.rule('Posted about us'))->>'id';
  assert (select amount = 2 and multiplier is null from public.rep_rewards where id = v), 'no boost';
  assert (select amount from public.rep_rewards where bonus_for = v) = 0.40, '20% of 2';
end $$;
update public.rep_settings set boost_by_reach = true, crew_share = 10;

-- 3. Their own page -----------------------------------------------------------------------------------
insert into public.rep_links (rep_id) select pg_temp.rep(n) from unnest(array['Coach Dani', 'Carlos']) n;
do $$ begin assert (select count(*) from public.rep_links) = 2, 'admins make the links'; end $$;
-- The team doesn't see anyone's link (it shows commission); a team rep sees their own.
select pg_temp.act_as('julio@test');
do $$ begin assert (select count(*) from public.rep_links) = 0, 'not other people''s links'; end $$;
select pg_temp.expect_error($q$select public.rep_page(pg_temp.link('Coach Dani'))$q$, 'permission denied');

select pg_temp.as_worker();
do $$ declare p jsonb := public.rep_page(pg_temp.link('Coach Dani')); begin
  assert p->'rep'->>'name' = 'Coach Dani' and (p->'rep'->>'reach')::int = 8000 and p->'rep'->>'code' is not null, 'who they are';
  assert not (p->'rep' ? 'phone') and not (p->'rep' ? 'notes') and not (p->'rep' ? 'email'), 'never their phone, email or the café''s notes';
  assert (p->>'balance')::numeric = 4 + 3 + 0.60 + 0.50 + 0.40, 'what they''re owed: their own and their crew''s share';
  assert jsonb_array_length(p->'crew') = 1 and p->'crew'->0->>'name' = 'Carlos' and (p->'crew'->0->>'bonus_this_month')::numeric = 1.50, 'their crew';
  assert (select count(*) from jsonb_array_elements(p->'rules') r where r->>'name' = 'Reposted our story') = 0, 'only what they can earn';
  assert (select (r->>'scales_with_reach')::boolean from jsonb_array_elements(p->'rules') r where r->>'name' = 'Posted about us'), 'with what grows with reach';
  assert (p->'settings'->>'crew_share')::numeric = 10, 'and the crew''s share';
  assert (p->'month'->>'rank')::int >= 1, 'their place this month';
  assert (select bool_or((r->>'bonus')::boolean) from jsonb_array_elements(p->'rewards') r), 'crew bonuses in their latest';
  assert public.rep_page('00000000000000000000000000000000') is null, 'no such link';
end $$;

-- Telling the café what they shared: it waits for an admin.
do $$ declare v jsonb; begin
  v := public.claim_reward(pg_temp.link('Coach Dani'), pg_temp.rule('Posted about us'), 'Reel with the team after training', 'https://www.instagram.com/reel/abc/');
  assert v - 'id' = '{"status": "pending", "amount": 4}'::jsonb, 'waits, at their reach';
  assert (select logged_by is null and proof_url = 'https://www.instagram.com/reel/abc/' from public.rep_rewards where id = (v->>'id')::uuid), 'from their own page';
end $$;
select pg_temp.expect_error($q$select public.claim_reward(pg_temp.link('Coach Dani'), pg_temp.rule('Posted about us'))$q$, 'Say what you shared');
select pg_temp.expect_error($q$select public.claim_reward(pg_temp.link('Coach Dani'), pg_temp.rule('Booked an event'), 'A party')$q$, 'logs "Booked an event" for you');
select pg_temp.expect_error($q$select public.claim_reward(pg_temp.link('Coach Dani'), pg_temp.rule('Reposted our story'), 'Story')$q$, 'a reward for customers');
select pg_temp.expect_error($q$select public.claim_reward('nope', pg_temp.rule('Posted about us'), 'Story')$q$, 'This link has changed');

-- Adding to their crew: someone new, waiting for an admin's OK.
do $$ declare v jsonb; begin
  v := public.suggest_crew(pg_temp.link('Coach Dani'), '{"name": " Ana Ruiz ", "instagram": "@Ana_Fights", "instagram_followers": 2300, "tiktok_followers": null, "note": "Amateur champion"}');
  assert v = '{"name": "Ana Ruiz", "reach": 2300, "approved": false}'::jsonb, 'what it says back';
  assert (select kind = 'customer' and leader_id = pg_temp.rep('Coach Dani') and instagram = 'ana_fights' and notes = 'Amateur champion' and not approved
            from public.sales_reps where name = 'Ana Ruiz'), 'in Dani''s crew, as a customer';
end $$;
select pg_temp.expect_error($q$select public.suggest_crew(pg_temp.link('Coach Dani'), '{"name": " "}')$q$, 'Give their name');
select pg_temp.expect_error($q$select public.suggest_crew(pg_temp.link('Coach Dani'), '{"name": "Big", "instagram_followers": "lots"}')$q$, 'Followers are a number');
select pg_temp.expect_error($q$select public.suggest_crew(pg_temp.link('Coach Dani'), '{"name": "Copy", "instagram": "carlos.ko"}')$q$, 'duplicate key');
select pg_temp.expect_error($q$select public.suggest_crew(pg_temp.link('Carlos'), '{"name": "Pepe"}')$q$, 'You''re in Coach Dani''s crew');
reset role;
do $$ begin
  assert (select count(*) from public.notifications n join public.profiles p on p.id = n.profile_id
           where p.email = 'maria@test' and n.title = 'Coach Dani added Ana Ruiz to their crew: waiting for your OK') = 1, 'admins are told';
  assert (select count(*) from public.notifications n join public.profiles p on p.id = n.profile_id
           where p.email = 'maria@test' and n.title = 'Posted about us for Coach Dani: €4.00 to approve'
             and n.body = 'From their own page · Reel with the team after training') = 1, 'and about what was sent';
end $$;

-- Saying yes to Ana leaves what she sent from a page waiting; no is taken off.
select pg_temp.act_as('maria@test');
select public.decide_rep(pg_temp.rep('Ana Ruiz'), false);
do $$ begin assert not exists (select 1 from public.sales_reps where name = 'Ana Ruiz'), 'no: taken off'; end $$;
-- A new link: the old one stops working.
update public.rep_links set token = replace(gen_random_uuid()::text, '-', '') where rep_id = pg_temp.rep('Carlos');

-- 4. Only an owner says yes (the rep_owner_ok migration) ----------------------------------------------
-- A shop manager (an admin who doesn't see pay) adds someone: they wait for an owner, like an employee's.
reset role;
select set_config('request.jwt.claim.sub', '', false);
update public.profiles set can_see_pay = false where email = 'maria@test';
select pg_temp.act_as('maria@test');
insert into public.sales_reps (name, kind, instagram, instagram_followers) values ('Coach Rafa', 'ambassador', 'rafa.boxing', 14500);
do $$ begin
  assert (select not approved from public.sales_reps where name = 'Coach Rafa'), 'a shop manager''s rep waits for an owner';
end $$;
select pg_temp.expect_error($q$select public.decide_rep(pg_temp.rep('Coach Rafa'), true)$q$, 'Only an owner');
-- Rewards that wait are still any admin's to approve.
update public.reward_rules set needs_approval = true where name = 'Posted about us';
select pg_temp.act_as('julio@test');
select public.log_reward(pg_temp.rep('Lucía García'), pg_temp.rule('Posted about us'), p_note := 'Waits for a manager');
select pg_temp.act_as('maria@test');
select public.decide_reward((select id from public.rep_rewards where note = 'Waits for a manager'), true);
do $$ begin
  assert (select status from public.rep_rewards where note = 'Waits for a manager') = 'approved', 'a shop manager approves a reward';
end $$;
update public.reward_rules set needs_approval = false where name = 'Posted about us';
-- Only the owners hear about people waiting: Maria, a shop manager now, isn't told about Julio's.
select pg_temp.act_as('julio@test');
insert into public.sales_reps (name) values ('Pepe Gym');
reset role;
do $$ begin
  assert not exists (select 1 from public.notifications n join public.profiles p on p.id = n.profile_id
                      where p.email = 'maria@test' and n.title = 'Julio added Pepe Gym as a rep: waiting for your OK'), 'a shop manager isn''t told';
end $$;
select set_config('request.jwt.claim.sub', '', false);
update public.profiles set can_see_pay = true where email = 'maria@test';
select pg_temp.act_as('maria@test');
select public.decide_rep(pg_temp.rep('Coach Rafa'), true);
do $$ begin assert (select approved from public.sales_reps where name = 'Coach Rafa'), 'an owner says yes'; end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
update public.profiles set can_see_pay = (select can_see_pay from maria_pay_reach) where email = 'maria@test';
