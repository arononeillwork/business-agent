-- Business Agent's own reps (the hq_reps migration): HQ with Julio, a rep's code at sign-up and on
-- Billing, HQ's list kept up to date, commission from payments held 30 days, crews, refunds, and a
-- rep's page. Runs last: HQ is made here (start_hq()), as on a brand-new database.

create function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_err text;
begin
  begin execute p_sql; exception when others then v_err := sqlerrm; end;
  if v_err is null then raise exception 'Expected error like "%" but statement succeeded: %', p_like, p_sql; end if;
  if v_err not ilike '%' || p_like || '%' then raise exception 'Expected error like "%", got "%"', p_like, v_err; end if;
end $$;

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.headers', '', false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

-- The Worker, for one business.
create function pg_temp.as_worker(p_business int) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', 'service_role', false);
  perform set_config('request.headers', json_build_object('x-business-id', p_business::text)::text, false);
  set role service_role;
end $$;

create function pg_temp.as_editor() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', '', false);
  perform set_config('request.headers', '', false);
end $$;

-- 1. HQ, made once ------------------------------------------------------------------------------
-- Julio's code is looked up at HQ: codes are unique within a business, and a rep made by an earlier test
-- (a random code from their name) can be JULIO27 in another.
select pg_temp.as_editor();
select set_config('test.hq', public.start_hq()::text, false);
do $$
declare v_hq int := current_setting('test.hq')::int;
begin
  assert public.start_hq() = v_hq, 'made once';
  assert (select is_hq and name = 'The Business Agent HQ' from public.business where id = v_hq), 'The Business Agent HQ';
  assert (select pitch like 'Thank you for bringing businesses to The Business Agent.%' from public.rep_settings where business_id = v_hq), 'the reps'' pitch names The Business Agent';
  assert (select complimentary_note = 'The Business Agent HQ: The Business Agent itself' from public.billing where business_id = v_hq), 'its note too';
  assert (select status = 'comped' and plan = 'business' from public.billing where business_id = v_hq), 'complimentary';
  assert (select kind = 'ambassador' and categories = '{cafe}' and email = 'julio.temp@example.com' and active and approved
            from public.sales_reps where business_id = v_hq and code = 'JULIO27'), 'Julio, for cafés, with a temporary email';
  assert (select string_agg(hq_role || ' ' || basis || ' ' || amount, ', ' order by sort) from public.reward_rules where business_id = v_hq)
    = 'first_payment fixed 50.00, payment percent 20.00', '€50 at the first payment, 20% of each';
  assert (select welcome_offer from public.rep_settings where business_id = v_hq) = 'Your first month free, and I''ll set it up with you', 'the cards'' offer';
  assert (select count(*) from public.positions where business_id = v_hq) = 1 and (select count(*) from public.todo_categories where business_id = v_hq) = 10,
    'and what every business starts with';
end $$;
select pg_temp.expect_error($q$insert into public.business (name, is_hq) values ('Second HQ', true)$q$, 'business_one_hq');

-- Its owner, invited to it.
insert into auth.users (email, raw_user_meta_data, invited_at)
values ('hq.owner@test', json_build_object('full_name', 'HQ Owner', 'business_id', current_setting('test.hq'))::jsonb, now());
do $$ begin
  assert (select business_id = current_setting('test.hq')::int and role = 'admin' and can_see_pay from public.profiles where email = 'hq.owner@test'),
    'the first person invited runs it';
end $$;

-- Nobody changes which business is HQ from the app.
select pg_temp.act_as('hq.owner@test');
update public.business set is_hq = false, created_at = now() - interval '1 year';
select pg_temp.act_as('maria@test');
update public.business set is_hq = true;
select pg_temp.as_editor();
do $$ begin
  assert (select is_hq and created_at > now() - interval '1 hour' from public.business where id = current_setting('test.hq')::int), 'HQ stays HQ';
  assert (select count(*) from public.business where is_hq) = 1, 'and is the only one';
end $$;
select pg_temp.act_as('maria@test');
select pg_temp.expect_error($q$select public.start_hq()$q$, 'permission denied');

-- At HQ nobody earns credit: a customer added there is an ambassador.
select pg_temp.act_as('hq.owner@test');
insert into public.sales_reps (name, kind, code, categories) values ('Ana', 'customer', 'ANA10', '{salon,cafe,salon}');
do $$ begin
  assert (select kind = 'ambassador' and categories = '{cafe,salon}' from public.sales_reps where code = 'ANA10'), 'an ambassador, categories once each';
end $$;
-- Ana is in Julio's crew: he gets his share of what she earns.
update public.sales_reps set leader_id = (select id from public.sales_reps where business_id = current_setting('test.hq')::int and code = 'JULIO27') where code = 'ANA10';
select pg_temp.expect_error($q$update public.sales_reps set categories = '{casino}' where code = 'ANA10'$q$, 'sales_reps_categories_check');

-- 2. A café signs up with Julio's code ------------------------------------------------------------
select pg_temp.as_editor();
insert into auth.users (email, raw_user_meta_data) values ('hq.lola@test', '{"full_name":"Lola"}'), ('hq.julio@test', '{"full_name":"Julio"}'),
  ('hq.bea@test', '{"full_name":"Bea"}');

-- The landing page asks who a code is (the Worker): Julio, and the cards' offer. Counted.
select pg_temp.as_worker(1);
do $$
declare v jsonb := public.rep_by_code(' julio27 ');
begin
  assert v->>'name' = 'Julio' and v->'categories' = '["cafe"]'::jsonb and v->>'offer' like 'Your first month free%', 'Julio, cafés, the offer: ' || v;
  assert public.rep_by_code('NOPE99') is null, 'not a rep''s code';
  perform public.rep_by_code('JULIO27', false);
end $$;
select pg_temp.as_editor();
do $$ begin
  assert (select count(*) from public.rep_code_opens where rep_id = (select id from public.sales_reps where business_id = current_setting('test.hq')::int and code = 'JULIO27')) = 1, 'opened once, looked at once';
end $$;
select pg_temp.act_as('hq.lola@test');
select pg_temp.expect_error($q$select public.rep_by_code('JULIO27')$q$, 'permission denied');

do $$
declare v int;
begin
  v := public.create_business('Café Lola', 'cafe', 'Europe/Madrid', ' julio27 ');
  perform set_config('test.lola', v::text, false);
  assert (select introduced_by = 'Julio' and referred_month and referred_by is null from public.billing), 'Julio introduced it: its month free';
  assert (select referred_by is null from public.business), 'no business referred it';
  assert (select string_agg(name, ', ' order by sort) from public.positions) = 'Barista, Kitchen', 'a café, set up as before';
  assert (select count(*) from public.rep_introductions) = 0, 'HQ''s list isn''t hers to see';
end $$;

select pg_temp.act_as('hq.owner@test');
do $$ begin
  assert (select r.name = 'Julio' and i.name = 'Café Lola' and i.kind = 'cafe' and i.code = 'JULIO27' and i.plan = 'free' and i.status = 'none'
            and i.set_up_at is null from public.rep_introductions i join public.sales_reps r on r.id = i.rep_id
           where i.introduced = current_setting('test.lola')::int), 'on HQ''s list';
  assert exists (select 1 from public.notifications where title = 'Café Lola signed up with Julio’s code'), 'and HQ heard about it';
end $$;

-- Julio's own new business doesn't count for him; Ana's code works for any kind of business.
select pg_temp.as_editor();
update public.sales_reps set email = 'hq.julio@test' where business_id = current_setting('test.hq')::int and code = 'JULIO27';
select pg_temp.act_as('hq.julio@test');
do $$ begin
  perform public.create_business('Julio''s Bar', 'pub', null, 'JULIO27');
  assert (select introduced_by is null and not referred_month from public.billing), 'not his own';
end $$;
select pg_temp.act_as('hq.bea@test');
do $$ begin
  perform set_config('test.bea', public.create_business('Bea Hair', 'salon', null, 'ANA10')::text, false);
  assert (select introduced_by = 'Ana' from public.billing), 'Ana introduced a salon';
end $$;

-- 3. HQ's list follows the business --------------------------------------------------------------
select pg_temp.act_as('hq.lola@test');
update public.business set name = 'Café Lola & Co', setup_completed_at = now();
select pg_temp.as_editor();
update public.billing set plan = 'pro', status = 'active', billing_interval = 'month' where business_id = current_setting('test.lola')::int;
do $$ begin
  assert (select name = 'Café Lola & Co' and set_up_at is not null and plan = 'pro' and status = 'active' and billing_interval = 'month'
            from public.rep_introductions where introduced = current_setting('test.lola')::int), 'renamed, set up, paying Pro';
end $$;

-- 4. Commission when it pays --------------------------------------------------------------------
select pg_temp.as_worker(current_setting('test.lola')::int);
do $$ begin
  assert public.record_rep_commission('in_lola1', 79, 1, now()) = 2, 'its first payment: two lines';
  assert public.record_rep_commission('in_lola1', 79, 1, now()) = 0, 'once per invoice';
end $$;
select pg_temp.expect_error($q$select public.record_rep_commission('not-an-invoice', 79, 1, now())$q$, 'Not a Stripe invoice');
select pg_temp.as_worker(1);
do $$ begin
  assert public.record_rep_commission('in_test1', 79, 1, now()) = 0, 'a business nobody introduced earns nothing';
end $$;
select pg_temp.act_as('hq.lola@test');
select pg_temp.expect_error($q$select public.record_rep_commission('in_x', 79, 1, now())$q$, 'permission denied');

select pg_temp.act_as('hq.owner@test');
do $$
declare v_julio uuid := (select id from public.sales_reps where business_id = current_setting('test.hq')::int and code = 'JULIO27');
begin
  assert (select string_agg(label || ' ' || amount || ' ' || status || ' ' || coalesce(months::text, '-') || ' ' || (counts_from - occurred_on), ', ' order by amount)
            from public.rep_rewards where rep_id = v_julio)
    = '20% of a payment 15.80 pending 1 30, A business’s first payment 50.00 pending - 30', 'held 30 days: 20% and the €50';
  assert (select sale_amount = 79 and note = 'Café Lola & Co' and source = 'stripe:in_lola1' from public.rep_rewards where rep_id = v_julio and months = 1),
    'what was paid, and who';
  assert (select first_paid_at is not null from public.rep_introductions where introduced = current_setting('test.lola')::int), 'first paid';
  assert exists (select 1 from public.notifications where title = 'Café Lola & Co paid: €65.80 for Julio'), 'HQ heard';
end $$;

-- Ten more months, then a year: only what's left of the 12 months counts, and no second €50.
select pg_temp.as_worker(current_setting('test.lola')::int);
do $$
declare v_total int := 0;
begin
  for i in 2..11 loop v_total := v_total + public.record_rep_commission('in_lola' || i, 79, 1, now()); end loop;
  assert v_total = 10, 'ten months, one line each';
  assert public.record_rep_commission('in_lolayear', 790, 12, now()) = 1, 'a year: one line';
  assert public.record_rep_commission('in_lolaafter', 790, 12, now()) = 0, 'past the 12 months: nothing';
end $$;
select pg_temp.as_editor();
do $$ begin
  assert (select amount = 13.17 and months = 1 from public.rep_rewards where source = 'stripe:in_lolayear'), 'a twelfth of 20% of the year';
  assert (select sum(months) from public.rep_rewards where introduction_id = (select id from public.rep_introductions where introduced = current_setting('test.lola')::int)) = 12,
    'twelve months in all';
end $$;

-- 5. Thirty days on, it counts by itself; Julio gets his share of what Ana's salon earns ----------
select pg_temp.as_worker(current_setting('test.bea')::int);
select public.record_rep_commission('in_bea1', 39, 1, now());
select pg_temp.as_editor();
update public.rep_rewards set counts_from = current_date - 1 where source in ('stripe:in_lola1', 'stripe:in_lola1:first', 'stripe:in_bea1', 'stripe:in_bea1:first');
do $$ begin
  assert public.each_business('release_rep_commission') = 0, 'the nightly job ran for every business';
  assert (select count(*) from public.rep_rewards where status = 'approved' and source like 'stripe:%') = 4, 'those four count now';
  assert (select count(*) from public.rep_rewards where status = 'pending' and source like 'stripe:in_lola%') = 11, 'the rest still wait';
  assert (select count(*) = 2 and sum(amount) = 5.78 and bool_and(status = 'approved' and label = 'Crew bonus · Ana')
            from public.rep_rewards where rep_id = (select id from public.sales_reps where business_id = current_setting('test.hq')::int and code = 'JULIO27') and bonus_for is not null),
    'Julio''s 10% of Ana''s €57.80';
end $$;

-- 6. Refunds ---------------------------------------------------------------------------------------
select pg_temp.as_worker(current_setting('test.lola')::int);
do $$ begin
  -- Waiting, all given back: turned down.
  assert public.reverse_rep_commission('in_lola2', 1) = 1, 'one line';
  -- Waiting, half given back: half taken back, waiting with it.
  assert public.reverse_rep_commission('in_lola3', 0.5) = 1, 'one line';
  -- Counted already, half and then all given back: taken back, kept up to date.
  assert public.reverse_rep_commission('in_lola1', 0.5) = 2, 'both lines';
  assert public.reverse_rep_commission('in_lola1', 1) = 2, 'again, all of it';
end $$;
select pg_temp.as_worker(current_setting('test.bea')::int);
select public.reverse_rep_commission('in_bea1', 1);
select pg_temp.as_editor();
do $$ begin
  assert (select status = 'rejected' and note like '%Refunded' from public.rep_rewards where source = 'stripe:in_lola2'), 'turned down';
  assert (select amount = -7.90 and status = 'pending' and counts_from is not null from public.rep_rewards
           where reverses = (select id from public.rep_rewards where source = 'stripe:in_lola3')), 'half, waiting with it';
  assert (select string_agg(amount::text, ', ' order by amount) from public.rep_rewards
           where reverses in (select id from public.rep_rewards where source in ('stripe:in_lola1', 'stripe:in_lola1:first')))
    = '-50.00, -15.80', 'all of it taken back, once';
  assert (select count(*) from public.rep_rewards where kind = 'clawback' and status = 'approved'
           and rep_id = (select id from public.sales_reps where business_id = current_setting('test.hq')::int and code = 'JULIO27')) = 4, 'Julio''s crew share of Ana''s refunded lines goes back too';
  assert public.rep_balance((select id from public.sales_reps where business_id = current_setting('test.hq')::int and code = 'JULIO27')) = 0, 'Julio is owed nothing from those';
end $$;
-- A line an admin turns down meanwhile takes its refund with it when its 30 days are up.
update public.rep_rewards set status = 'rejected' where source = 'stripe:in_lola3';
update public.rep_rewards set counts_from = current_date where source = 'refund:' || (select id from public.rep_rewards where source = 'stripe:in_lola3');
select public.each_business('release_rep_commission');
do $$ begin
  assert not exists (select 1 from public.rep_rewards where reverses = (select id from public.rep_rewards where source = 'stripe:in_lola3')), 'gone with it';
end $$;

-- 7. Julio's own page: his businesses; the €50 and the 20% aren't for him to send ------------------
select pg_temp.as_editor();
insert into public.rep_links (business_id, rep_id) select business_id, id from public.sales_reps where business_id = current_setting('test.hq')::int and code = 'JULIO27';
select set_config('test.token', (select token from public.rep_links where rep_id = (select id from public.sales_reps where business_id = current_setting('test.hq')::int and code = 'JULIO27')), false);
select pg_temp.as_worker(current_setting('test.hq')::int);
do $$
declare v jsonb := public.rep_page_businesses(current_setting('test.token'));
begin
  assert jsonb_array_length(v->'businesses') = 1, 'Café Lola: ' || v;
  assert v->'businesses'->0->>'name' = 'Café Lola & Co' and v->'businesses'->0->>'kind' = 'cafe' and v->'businesses'->0->>'plan' = 'pro'
     and (v->'businesses'->0->>'months_paid')::int = 10, 'how it''s doing (two months turned down): ' || v;
  assert jsonb_array_length(v->'automatic') = 2, 'the two rewards that count by themselves';
  assert public.rep_page_businesses('0123456789abcdef0123456789abcdef') is null, 'not a link';
end $$;
select pg_temp.expect_error(format($q$select public.claim_reward(%L, (select id from public.reward_rules where hq_role = 'first_payment'), 'I sold one')$q$,
  current_setting('test.token')), 'counts by itself');

-- 8. A code added on Billing, in the first 30 days -------------------------------------------------
select pg_temp.act_as('colado@test.es');
do $$ begin
  assert public.add_rep_code('julio27') = 'Julio', 'Colado Shop forgot the code';
  assert (select introduced_by = 'Julio' and referred_month from public.billing), 'its month free';
end $$;
select pg_temp.expect_error($q$select public.add_rep_code('JULIO27')$q$, 'already came through');
select pg_temp.act_as('nadie@test.es');
select pg_temp.expect_error($q$select public.add_rep_code('JULIO27')$q$, 'already came through');
select pg_temp.act_as('nuevo@test');
select pg_temp.expect_error($q$select public.add_rep_code('NOPE99')$q$, 'isn’t a rep’s code');
select pg_temp.as_editor();
update public.business set created_at = now() - interval '31 days' where name = 'The Crown';
select pg_temp.act_as('nuevo@test');
select pg_temp.expect_error($q$select public.add_rep_code('JULIO27')$q$, 'first 30 days');
select pg_temp.act_as('hq.julio@test');
select pg_temp.expect_error($q$select public.add_rep_code('JULIO27')$q$, 'your own code');
select pg_temp.as_editor();
do $$ begin
  assert (select count(*) from public.rep_introductions where rep_id = (select id from public.sales_reps where business_id = current_setting('test.hq')::int and code = 'JULIO27')) = 2,
    'Julio: Café Lola and Colado Shop';
end $$;
