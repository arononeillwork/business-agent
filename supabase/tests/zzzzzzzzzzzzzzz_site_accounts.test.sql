-- Accounts & rewards on the business's own website (the site_accounts migration): the Worker, for one
-- business, finds or makes the customer for someone signed in there (matched as the Square sync matches,
-- never touching their yes to marketing), reads what their account page shows (their credit the same as
-- their rep page's, nobody else's rows), and erases them (blanked where the ledger must stay, deleted
-- where it needn't, unsubscribed, logged as via the website without them). Only while the business has
-- website accounts on; only the Worker. Uses businesses 1 and 2 (from the several businesses test).
-- Nothing made here stays.

begin;

create function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_err text;
begin
  begin execute p_sql; exception when others then v_err := sqlerrm; end;
  if v_err is null then raise exception 'Expected error like "%" but statement succeeded: %', p_like, p_sql; end if;
  if v_err not ilike '%' || p_like || '%' then raise exception 'Expected error like "%", got "%"', p_like, v_err; end if;
end $$;

-- The Worker: the service role naming one business, through the website (x-app-via, as businessDb(…, 'website')).
create function pg_temp.as_worker(p_business int) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('app.business_id', '', false);
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', 'service_role', false);
  perform set_config('request.headers', json_build_object('x-business-id', p_business::text, 'x-app-via', 'website')::text, false);
  set role service_role;
end $$;

-- Setting things up as the database itself, for one business.
create function pg_temp.as_editor(p_business int) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', '', false);
  perform set_config('request.headers', '', false);
  perform set_config('app.business_id', p_business::text, false);
end $$;

create function pg_temp.sync(p_business int, p_email text, p_first text default null, p_last text default null, p_phone text default null,
  p_square text default null, p_code text default null) returns jsonb language sql as $$
  select public.site_account_sync(p_business, p_email, p_first, p_last, p_phone, p_square, 'es', p_code)
$$;
create function pg_temp.customer(p_id text) returns public.customers language sql as $$
  select * from public.customers where id = p_id::uuid
$$;

-- 0. Only the Worker, and only while the business has it on -----------------------------------------------------
select pg_temp.as_editor(1);
do $$ begin
  assert not has_function_privilege('anon', 'public.site_account_summary(int, text)', 'execute'), 'not signed out';
  assert not has_function_privilege('authenticated', 'public.site_account_summary(int, text)', 'execute'), 'not signed in';
  assert not has_function_privilege('authenticated', 'public.site_account_sync(int, text, text, text, text, text, text, text)', 'execute'), 'not signed in';
  assert not has_function_privilege('authenticated', 'public.site_account_erase(int, text)', 'execute'), 'not signed in';
  assert has_function_privilege('service_role', 'public.site_account_erase(int, text)', 'execute'), 'the Worker';
  assert (select not website_accounts from public.settings where business_id = 1), 'off until the business turns it on';
end $$;
select pg_temp.as_worker(1);
select pg_temp.expect_error($q$select public.site_account_summary(1, 'ana@site-accounts.test')$q$, 'Website accounts are off');
select pg_temp.as_editor(1);
update public.settings set website_accounts = true where business_id in (1, 2);
-- Business 2 has its own rows to be told apart from.
insert into public.settings (business_id) select 2 where not exists (select 1 from public.settings where business_id = 2);
update public.settings set website_accounts = true where business_id = 2;
select pg_temp.as_worker(1);
-- The header names the business; the address can't name another.
select pg_temp.expect_error($q$select public.site_account_summary(2, 'ana@site-accounts.test')$q$, 'Not this business');
select pg_temp.expect_error($q$select pg_temp.sync(1, 'not an email')$q$, 'Enter a valid email');

-- 1. Sync: someone new is a customer from the website, once ---------------------------------------------------------
select set_config('test.ana', (pg_temp.sync(1, '  Ana@Site-Accounts.test ', 'Ana', 'García', '+34 600 000 001'))->>'customer_id', false);
do $$
declare c public.customers := pg_temp.customer(current_setting('test.ana'));
begin
  assert c.source = 'website' and c.kind = 'lead' and c.email = 'ana@site-accounts.test', 'a lead from the website, the email lowercased';
  assert c.first_name = 'Ana' and c.last_name = 'García' and c.phone = '+34 600 000 001' and c.lang = 'es', 'what the website said';
  assert not c.marketing_consent, 'signing in isn''t a yes to marketing';
  assert pg_temp.sync(1, 'ana@site-accounts.test', 'Anita', 'Other', '+34 600 999 999') = jsonb_build_object(
    'customer_id', c.id, 'created', false, 'is_rep', false, 'ignored', '[]'::jsonb), 'the second time: the same one, not made again';
  assert (select count(*) from public.customers where business_id = 1 and lower(email) = 'ana@site-accounts.test') = 1, 'one Ana';
  c := pg_temp.customer(current_setting('test.ana'));
  assert c.first_name = 'Ana' and c.last_name = 'García' and c.phone = '+34 600 000 001', 'what''s here already wins';
  assert (select count(*) from public.audit_log where business_id = 1 and table_name = 'customers' and row_id = c.id::text) = 1, 'nothing changed, nothing logged';
  assert (select via from public.audit_log where business_id = 1 and table_name = 'customers' and row_id = c.id::text) = 'website', 'made via the website';
end $$;

-- 2. Someone already here from Square, with that email: linked, not made again; their consent as it was ---------------
select pg_temp.as_editor(1);
insert into public.customers (business_id, kind, source, first_name, email, square_id, marketing_consent)
values (1, 'customer', 'square', 'Lucía', 'lucia@site-accounts.test', 'SQ-LUCIA', true),
       (1, 'customer', 'square', 'Noé', null, 'SQ-NOEMAIL', false);
insert into public.customers (business_id, kind, source, first_name, phone, marketing_consent)
values (1, 'customer', 'walk_in', 'Pepe', '+34 611 222 333', false);
insert into public.customers (business_id, kind, source, first_name, email, square_id)
values (1, 'customer', 'square', 'Other', 'other@site-accounts.test', 'SQ-OTHER');
select pg_temp.as_worker(1);
do $$
declare
  r jsonb;
  v_lucia uuid := (select id from public.customers where business_id = 1 and square_id = 'SQ-LUCIA');
begin
  r := pg_temp.sync(1, 'LUCIA@site-accounts.test', 'Lucía', 'López', null, 'SQ-LUCIA');
  assert r->>'customer_id' = v_lucia::text and not (r->>'created')::boolean, 'linked to who she is in Square';
  assert (select count(*) from public.customers where business_id = 1 and lower(email) = 'lucia@site-accounts.test') = 1, 'not made twice';
  assert (pg_temp.customer(v_lucia::text)).marketing_consent, 'her yes stays a yes';
  assert (pg_temp.customer(v_lucia::text)).last_name = 'López' and (pg_temp.customer(v_lucia::text)).source = 'square', 'an empty field filled; where she came from stays';
  -- Ana gives her Square id: hers had none, so it's set.
  r := pg_temp.sync(1, 'ana@site-accounts.test', null, null, null, 'SQ-ANA');
  assert (pg_temp.customer(current_setting('test.ana'))).square_id = 'SQ-ANA', 'her Square id, now that she has one';
  assert not (pg_temp.customer(current_setting('test.ana'))).marketing_consent, 'her no stays a no';
  -- A Square customer with no email yet: theirs, and the email filled in.
  r := pg_temp.sync(1, 'noemail@site-accounts.test', null, null, null, 'SQ-NOEMAIL');
  assert r->>'customer_id' = (select id::text from public.customers where business_id = 1 and square_id = 'SQ-NOEMAIL'), 'by Square id';
  assert (select email from public.customers where business_id = 1 and square_id = 'SQ-NOEMAIL') = 'noemail@site-accounts.test', 'the email filled in';
  -- By phone, someone with no email.
  r := pg_temp.sync(1, 'pepe@site-accounts.test', 'José', null, '+34611222333');
  assert r->>'customer_id' = (select id::text from public.customers where business_id = 1 and first_name = 'Pepe'), 'by phone';
  -- A Square id on someone with another email isn't theirs: a new customer, without it.
  r := pg_temp.sync(1, 'eve@site-accounts.test', 'Eve', null, null, 'SQ-OTHER');
  assert (r->>'created')::boolean and r->'ignored' = '["square_customer_id"]'::jsonb, 'someone else''s Square id is said back';
  assert (select email from public.customers where square_id = 'SQ-OTHER' and business_id = 1) = 'other@site-accounts.test', 'theirs untouched';
end $$;

-- 3. A rep's code on signing up: the rep introduced them, and the admins hear about it ------------------------------------
select pg_temp.as_editor(1);
insert into public.sales_reps (business_id, name, kind, code, approved, active) values
  (1, 'Natasha', 'customer', 'NATASH15', true, true),
  (1, 'Waiting Wanda', 'customer', 'WANDA22', false, true);
select set_config('test.notes_before', (select count(*) from public.notifications where business_id = 1)::text, false);
select pg_temp.as_worker(1);
do $$
declare r jsonb;
begin
  r := pg_temp.sync(1, 'friend@site-accounts.test', 'Fran', null, null, null, ' natash15 ');
  assert (pg_temp.customer(r->>'customer_id')).introduced_by = (select id from public.sales_reps where business_id = 1 and code = 'NATASH15'), 'Natasha brought her';
  assert (select count(*) from public.notifications where business_id = 1)::int > current_setting('test.notes_before')::int, 'the admins hear about it';
  assert exists (select 1 from public.notifications where business_id = 1 and title = 'Fran signed up on the website with Natasha’s code'), 'what they read';
  assert not exists (select 1 from public.rep_rewards w join public.sales_reps s on s.id = w.rep_id where s.code = 'NATASH15'), 'nothing credited by itself';
  r := pg_temp.sync(1, 'wanda.friend@site-accounts.test', null, null, null, null, 'WANDA22');
  assert (pg_temp.customer(r->>'customer_id')).introduced_by is null, 'a rep still waiting for the OK introduces nobody';
  r := pg_temp.sync(1, 'nocode@site-accounts.test', null, null, null, null, 'NOSUCH99');
  assert (r->>'created')::boolean and (pg_temp.customer(r->>'customer_id')).introduced_by is null, 'an unknown code is ignored';
  r := pg_temp.sync(1, 'ana@site-accounts.test', null, null, null, null, 'NATASH15');
  assert (pg_temp.customer(current_setting('test.ana'))).introduced_by is null, 'someone already here wasn''t introduced';
end $$;

-- 4. Summary: their credit is their rep page's, and only theirs ----------------------------------------------------------
select pg_temp.as_editor(1);
update public.sales_reps set customer_id = current_setting('test.ana')::uuid, square_gift_card_id = 'GC-1'
 where business_id = 1 and code = 'NATASH15';
insert into public.sales_reps (business_id, name, kind, code, leader_id, approved, active)
select 1, 'Crew Carla', 'customer', 'CARLA11', id, true, true from public.sales_reps where business_id = 1 and code = 'NATASH15';
insert into public.rep_rewards (business_id, rep_id, kind, label, amount, status, note, occurred_on, source)
select 1, r.id, x.kind, x.label, x.amount, x.status, x.note, current_date - x.ago, x.source
  from public.sales_reps r,
       (values ('earn', 'Cashback for a post', 0.47, 'approved', '863 views · 20 likes', 2, 'cashback:post-1'),
               ('earn', 'Reposted our story', 2.00, 'approved', 'Her friend Sarah López came too', 3, null),
               ('earn', 'Cashback for a post', 0.40, 'pending', '500 views', 1, 'cashback:post-2'),
               ('earn', 'Brought a group', 5.00, 'rejected', null, 4, null),
               ('redeem', 'Used at the till', -1.22, 'approved', 'Paid with cash too', 1, null)) x(kind, label, amount, status, note, ago, source)
 where r.business_id = 1 and r.code = 'NATASH15';
-- Carla's reward, and Natasha's share of it: a crew bonus, named after Carla.
insert into public.rep_rewards (business_id, rep_id, kind, label, amount, status, occurred_on)
select 1, id, 'earn', 'Reposted our story', 3.00, 'approved', current_date from public.sales_reps where business_id = 1 and code = 'CARLA11';
insert into public.rep_rewards (business_id, rep_id, kind, label, amount, status, occurred_on, bonus_for)
select 1, n.id, 'earn', 'Crew bonus · Crew Carla', 0.30, 'approved', current_date, w.id
  from public.sales_reps n, public.rep_rewards w join public.sales_reps c on c.id = w.rep_id
 where n.business_id = 1 and n.code = 'NATASH15' and c.code = 'CARLA11' and c.business_id = 1;
insert into public.rep_links (business_id, rep_id) select 1, id from public.sales_reps where business_id = 1 and code = 'NATASH15';
select pg_temp.as_worker(1);
do $$
declare
  s     jsonb := public.site_account_summary(1, ' ANA@site-accounts.test ');
  page  jsonb := public.rep_page((select token from public.rep_links l join public.sales_reps r on r.id = l.rep_id where r.business_id = 1 and r.code = 'NATASH15'));
  lines jsonb := s->'credit'->'lines';
begin
  assert s->'customer' = jsonb_build_object('id', current_setting('test.ana'), 'first_name', 'Ana'), 'who she is';
  assert s->>'square_customer_id' = 'SQ-ANA', 'her Square id, for the Worker to read her points';
  assert (s->'credit'->>'balance')::numeric = (page->>'balance')::numeric, 'the same balance as her rep page';
  assert (s->'credit'->>'balance')::numeric = 1.55, 'what''s approved: 0.47 + 2.00 − 1.22 + 0.30';
  assert (s->'credit'->>'pending')::numeric = 0.40, 'only what waits';
  assert (s->'credit'->>'gift_card_linked')::boolean, 'on a gift card at the till too';
  assert jsonb_array_length(lines) = 6, 'every line of hers';
  assert lines->0->>'date' = to_char(current_date, 'YYYY-MM-DD') and lines->0->>'label' = 'Crew bonus', 'newest first; the crew bonus without Carla''s name';
  assert s::text not like '%Carla%' and s::text not like '%Sarah%' and s::text not like '%CARLA11%', 'nobody else in it';
  assert (select x->>'note' from jsonb_array_elements(lines) x where x->>'amount' = '0.47') = '863 views · 20 likes', 'the app''s own note';
  assert (select x->'note' from jsonb_array_elements(lines) x where x->>'amount' = '-1.22') = 'null'::jsonb, 'not the team''s';
  assert (select count(*) from jsonb_array_elements(lines) x where (x->>'amount')::numeric < 0) = 1, 'spending as a negative';
  assert s->'cashback' = '{"on": true, "per_1000_views": 0.5, "per_100_likes": 0.2, "per_follower": 0.1, "max": 15}'::jsonb, 'how cashback is earned';
  assert s->'rep'->>'code' = 'NATASH15' and s->'rep'->>'kind' = 'customer' and (s->'rep'->>'crew_members')::int = 1, 'her code and her crew of one';
  assert (s->'rep'->>'this_month')::numeric = (page->'month'->>'earned')::numeric, 'this month as her page says';
  assert s::text not like '%token%' and s::text not like '%' || (select token from public.rep_links l join public.sales_reps r on r.id = l.rep_id where r.code = 'NATASH15' and r.business_id = 1) || '%', 'never her link';
end $$;

-- 5. Someone with no rep row: no credit, no rep; someone not on the list: nothing --------------------------------------------
do $$
declare s jsonb := public.site_account_summary(1, 'lucia@site-accounts.test');
begin
  assert s->'customer'->>'first_name' = 'Lucía', 'Lucía';
  assert s->'credit' = 'null'::jsonb and s->'rep' = 'null'::jsonb, 'no rep row: no credit, no rep';
  assert s->'cashback' <> 'null'::jsonb, 'how cashback is earned, for anyone';
  assert public.site_account_summary(1, 'nobody@site-accounts.test') = '{"customer": null}'::jsonb, 'not on Customers';
end $$;
select pg_temp.as_editor(1);
update public.rep_settings set cashback_on = false where business_id = 1;
update public.sales_reps set active = false where business_id = 1 and code = 'NATASH15';
select pg_temp.as_worker(1);
do $$
declare s jsonb := public.site_account_summary(1, 'ana@site-accounts.test');
begin
  assert s->'cashback' = 'null'::jsonb, 'cashback off';
  assert s->'rep' = 'null'::jsonb and (s->'credit'->>'balance')::numeric = 1.55, 'no longer a rep, still her credit';
end $$;
select pg_temp.as_editor(1);
update public.sales_reps set active = true where business_id = 1 and code = 'NATASH15';

-- 6. Another business's Worker can't read business 1's customers ----------------------------------------------------------
select pg_temp.as_worker(2);
do $$ begin
  assert public.site_account_summary(2, 'ana@site-accounts.test') = '{"customer": null}'::jsonb, 'Ana is business 1''s';
  assert (pg_temp.sync(2, 'ana@site-accounts.test')->>'created')::boolean, 'business 2 makes its own';
  assert (select count(*) from public.customers where lower(email) = 'ana@site-accounts.test') = 2, 'one each';
end $$;
select pg_temp.expect_error($q$select public.site_account_erase(1, 'ana@site-accounts.test')$q$, 'Not this business');

-- 7. Erase, with ledger lines: blanked, the ledger kept, unsubscribed, logged without her -----------------------------------------
select pg_temp.as_editor(1);
update public.customers set birthday = '1990-05-14', notes = 'Likes oat milk', instagram = 'ana.g', company = 'Ana SL', tags = '{Learning English}',
       marketing_consent = true where id = current_setting('test.ana')::uuid;
insert into public.newsletter_events (business_id, customer_id, action, email, via)
values (1, current_setting('test.ana')::uuid, 'signup', 'ana@site-accounts.test', 'website');
update public.sales_reps set phone = '+34 600 000 001', email = 'ana@site-accounts.test', instagram = 'ana.g' where business_id = 1 and code = 'NATASH15';
select set_config('test.lines', (select count(*) from public.rep_rewards w join public.sales_reps r on r.id = w.rep_id where r.code = 'NATASH15' and r.business_id = 1)::text, false);
select pg_temp.as_worker(1);
do $$
declare
  r jsonb := public.site_account_erase(1, ' Ana@site-accounts.test');
  c public.customers := pg_temp.customer(current_setting('test.ana'));
  v_rep public.sales_reps;
begin
  assert r = '{"found": true, "kept": "ledger", "square_ids": ["SQ-ANA"]}'::jsonb, 'kept for the ledger; her Square id for the Worker to forget';
  assert c.id is not null and c.erased_at is not null, 'the row stays, marked erased';
  assert c.first_name is null and c.last_name is null and c.email is null and c.phone is null and c.birthday is null and c.notes is null
     and c.instagram is null and c.company is null and c.tags = '{}' and c.square_id is null, 'nothing of hers left on it';
  assert not c.marketing_consent, 'unsubscribed';
  assert not exists (select 1 from public.newsletter_events where customer_id = c.id), 'no record of her address';
  select * into v_rep from public.sales_reps where business_id = 1 and code = 'NATASH15';
  assert not v_rep.active and v_rep.name = 'Erased' and v_rep.phone is null and v_rep.email is null and v_rep.instagram is null, 'her rep row off and blanked';
  assert v_rep.customer_id = c.id, 'still hers, for the ledger';
  assert (select count(*) from public.rep_rewards where rep_id = v_rep.id)::text = current_setting('test.lines'), 'every ledger line kept';
  assert (select sum(amount) from public.rep_rewards where rep_id = v_rep.id and status = 'approved') = 1.55, 'and every amount';
  assert not exists (select 1 from public.rep_links where rep_id = v_rep.id), 'her page''s link gone';
  assert (select via from public.audit_log where business_id = 1 and table_name = 'customers' and row_id = c.id::text and action = 'erase') = 'website',
    'logged as erased via the website';
  assert exists (select 1 from public.audit_log where business_id = 1 and row_id = v_rep.id::text), 'her rep row''s history is kept';
  assert not exists (select 1 from public.audit_log where business_id = 1 and row_id in (c.id::text, v_rep.id::text)
                       and concat(old_values::text, new_values::text) ~* '(ana@site-accounts\.test|García|oat milk|ana\.g|600 000 001|1990-05-14|SQ-ANA)'),
    'not even in the audit log';
  assert public.site_account_summary(1, 'ana@site-accounts.test') = '{"customer": null}'::jsonb, 'gone from the website';
  assert (select count(*) from public.customers where lower(email) = 'ana@site-accounts.test') = 1, 'business 2''s Ana is its own';
  assert public.site_account_erase(1, 'ana@site-accounts.test') = '{"found": false, "kept": null, "square_ids": []}'::jsonb, 'erasing again finds nobody';
  -- Back again later: someone new, not the erased row.
  assert (pg_temp.sync(1, 'ana@site-accounts.test', null, null, null, 'SQ-ANA')->>'customer_id') <> c.id::text, 'a fresh start';
end $$;

-- 8. Erase, with no ledger lines: gone, with a rep row that had nothing on it ------------------------------------------------------
select pg_temp.as_editor(1);
insert into public.sales_reps (business_id, name, kind, code, customer_id)
select 1, 'Lucía', 'customer', 'LUCIA77', id from public.customers where business_id = 1 and square_id = 'SQ-LUCIA';
insert into public.newsletter_events (business_id, customer_id, action, email, via)
select 1, id, 'signup', 'lucia@site-accounts.test', 'form' from public.customers where business_id = 1 and square_id = 'SQ-LUCIA';
select set_config('test.lucia', (select id::text from public.customers where business_id = 1 and square_id = 'SQ-LUCIA'), false);
select pg_temp.as_worker(1);
do $$ begin
  assert public.site_account_erase(1, 'lucia@site-accounts.test') = '{"found": true, "kept": null, "square_ids": ["SQ-LUCIA"]}'::jsonb, 'nothing to keep';
  assert not exists (select 1 from public.customers where id = current_setting('test.lucia')::uuid), 'deleted';
  assert not exists (select 1 from public.sales_reps where business_id = 1 and code = 'LUCIA77'), 'her empty rep row too';
  assert not exists (select 1 from public.newsletter_events where customer_id = current_setting('test.lucia')::uuid), 'and her newsletter record';
  assert exists (select 1 from public.audit_log where business_id = 1 and row_id = current_setting('test.lucia') and action = 'erase' and via = 'website'), 'logged';
  assert not exists (select 1 from public.audit_log where business_id = 1 and row_id = current_setting('test.lucia')
                       and concat(old_values::text, new_values::text) ~* '(lucia@site-accounts\.test|SQ-LUCIA|López)'), 'without her';
end $$;

rollback;
