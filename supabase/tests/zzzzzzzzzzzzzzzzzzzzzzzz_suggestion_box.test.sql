-- The suggestion box (the `suggestion_box` migration): Easy Beans has its Suggestion box code on the
-- tables; an idea a customer sends (the Worker, for one business, with nobody signed in) is on the team's
-- Suggestions page, not sorted yet; the record of who sent it for the limits (an HMAC, never the address)
-- is the Worker's alone, and each business's own. Its own rows, removed at the end.
-- People from the tests before it: maria (admin), julio (employee).

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

-- 1. Easy Beans' Suggestion box code: a link to its box, on the tables, after its other codes.
select pg_temp.act_as('julio@test');
do $$ begin
  assert (select url = 'https://businesssagent.com/api/site/1/suggest' and kind = 'link' and used_where = 'On the tables'
            and caption = 'Got an idea for us? Scan to tell us' from public.qr_codes where name = 'Suggestion box'), 'the code';
  assert (select sort from public.qr_codes where name = 'Suggestion box') > (select max(sort) from public.qr_codes where name <> 'Suggestion box'), 'after the others';
end $$;

-- 2. A customer's idea, saved by the Worker for Easy Beans with nobody signed in: tidied, not sorted yet,
--    from the suggestion box, and the send counted.
select pg_temp.as_worker(1);
do $$ declare v public.customer_suggestions; begin
  insert into public.customer_suggestions (text, customer, source, heard_on)
  values ('  Oat milk   at no extra cost ', ' Lucía ', 'Suggestion box', date '2026-11-27') returning * into v;
  assert v.business_id = 1 and v.text = 'Oat milk at no extra cost' and v.customer = 'Lucía' and v.group_id is null and v.updated_by is null, 'saved';
  insert into public.suggestion_box_sends (ip_hash) values (repeat('ab', 32));
  assert (select count(*) from public.suggestion_box_sends where business_id = 1) = 1, 'counted, for Easy Beans';
end $$;
select pg_temp.expect_error($q$insert into public.suggestion_box_sends (ip_hash) values ('203.0.113.7')$q$, 'suggestion_box_sends_ip_hash_check');

-- 3. The team sees the idea on Suggestions; nobody signed in reads, adds to or clears the record of sends.
select pg_temp.act_as('julio@test');
do $$ begin
  assert (select source = 'Suggestion box' and customer = 'Lucía' from public.customer_suggestions where text = 'Oat milk at no extra cost'), 'on Suggestions';
end $$;
select pg_temp.expect_error($q$select count(*) from public.suggestion_box_sends$q$, 'permission denied');
select pg_temp.act_as('maria@test');
select pg_temp.expect_error($q$select count(*) from public.suggestion_box_sends$q$, 'permission denied');
select pg_temp.expect_error($q$insert into public.suggestion_box_sends (ip_hash) values (repeat('cd', 32))$q$, 'permission denied');
select pg_temp.expect_error($q$delete from public.suggestion_box_sends$q$, 'permission denied');

-- 4. Another business's sends are its own: it doesn't see Easy Beans', nor Easy Beans its.
--    (Made and undone in one transaction, by its own number, so the businesses later tests make keep theirs.)
reset role; select set_config('request.jwt.claim.sub', '', false);
begin;
select set_config('app.business_id', '91', true);
insert into public.business (id, name, timezone, opening_hours) values (91, 'Bar Noventa y Uno', 'Europe/Madrid', '{}');
insert into public.settings default values;
insert into public.business_admin_notes default values;
insert into public.billing default values;
select set_config('app.business_id', '91', false);
set local role service_role;
do $$ begin
  insert into public.suggestion_box_sends (ip_hash) values (repeat('ef', 32));
  assert (select business_id from public.suggestion_box_sends where ip_hash = repeat('ef', 32)) = 91, 'Bar Noventa y Uno''s own';
  assert not exists (select 1 from public.qr_codes where business_id = 91), 'no code of Easy Beans'' there';
end $$;
rollback;

-- Tidy up: this test's rows.
reset role; select set_config('request.jwt.claim.sub', '', false); select set_config('app.business_id', '', false);
delete from public.customer_suggestions where business_id = 1 and source = 'Suggestion box' and text = 'Oat milk at no extra cost';
delete from public.suggestion_box_sends where business_id = 1;
