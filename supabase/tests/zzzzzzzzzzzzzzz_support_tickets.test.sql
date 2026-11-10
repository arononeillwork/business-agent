-- Support tickets (the support_tickets migration): someone signed in sends one from Help or the error screen,
-- five a day at most, at least 10 characters, the same words twice in a day being the one they sent. HQ's
-- admins hear about "Something isn't working" at most once every 15 minutes, with how many came in; questions
-- and ideas tell nobody. The person reads their own; HQ's active admins read and answer them all, and the
-- person hears about a reply or their ticket closing. Nobody else reads them, not a business's own admin;
-- nobody writes them but through the functions; owners don't export them; they go with their business.
-- Runs after the HQ tests: HQ exists, run by hq.owner@test; Bar Dos (business 2) has Lola, its admin, and Pepe.

begin;

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

-- The Worker's minute job: the service role, naming no business.
create function pg_temp.as_worker() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', 'service_role', false);
  perform set_config('request.headers', '', false);
  set role service_role;
end $$;

create function pg_temp.as_editor() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', '', false);
  perform set_config('request.headers', '', false);
end $$;

-- HQ's owner's notifications about problem reports, and someone's about their own tickets (whoever asks: as the
-- database's owner, past row security).
create function pg_temp.hq_told() returns bigint language sql security definer as $$
  select count(*) from public.notifications n join public.profiles p on p.id = n.profile_id
   where p.email = 'hq.owner@test' and n.title like '% new problem report%'
$$;
create function pg_temp.told(p_email text) returns bigint language sql security definer as $$
  select count(*) from public.notifications n join public.profiles p on p.id = n.profile_id
   where p.email = p_email and n.link = '/?help=requests'
$$;
-- Time passing within this one transaction (now() stays put): every ticket made and told about earlier.
create function pg_temp.later(p_by interval) returns void language sql as $$
  update public.support_tickets set created_at = created_at - p_by, alerted_at = alerted_at - p_by
$$;
create function pg_temp.send(p_kind text, p_message text) returns jsonb language sql as $$
  select public.create_support_ticket(p_kind, p_message, '/rota', 'index-abc123', 'Mozilla/5.0 (iPhone)')
$$;

select pg_temp.as_editor();
-- From none (the delete_business test leaves the tickets of the businesses it keeps).
delete from public.support_tickets;
do $$ begin
  assert (select relrowsecurity from pg_class where oid = 'public.support_tickets'::regclass), 'row security is on';
end $$;
-- Someone at HQ who isn't an admin, and an admin of HQ who has been switched off.
insert into auth.users (email, raw_user_meta_data, invited_at)
select e, json_build_object('full_name', n, 'role', r, 'business_id', (select id from public.business where is_hq)), now()
  from (values ('hq.staff@test', 'HQ Staff', 'employee'), ('hq.former@test', 'HQ Former', 'admin')) v(e, n, r);
select set_config('app.business_id', (select id::text from public.business where is_hq), true);
update public.profiles set active = false where email = 'hq.former@test';
select set_config('app.business_id', '', true);

-- 1. Maria (an admin of the first business) asks a question; the limits ----------------------------------
select pg_temp.act_as('maria@test');
do $$
declare
  v jsonb;
  v_hq bigint := pg_temp.hq_told();
begin
  v := public.create_support_ticket('question', '  How do I add a second café to my account?  ', 'business', 'index-abc123', 'Mozilla/5.0 (iPhone)');
  assert not (v ->> 'duplicate')::boolean and (v ->> 'id') is not null, 'sent: ' || v;
  perform set_config('test.question', v ->> 'id', false);
  assert (select count(*) from public.support_tickets) = 1, 'she reads her own';
  assert (select message = 'How do I add a second café to my account?' and kind = 'question' and status = 'open' and business_id = 1
            and page is null and app_version = 'index-abc123' and browser = 'Mozilla/5.0 (iPhone)' and not alert_due
            and user_id = auth.uid() from public.support_tickets), 'as she wrote it, trimmed; a page that isn''t a path is left out';
  assert pg_temp.hq_told() = v_hq, 'a question tells HQ nobody';

  -- The same words again, with other spaces and capitals: the one she sent.
  v := public.create_support_ticket('question', E'how do I add a second  café\nto my account?');
  assert (v ->> 'duplicate')::boolean and (v ->> 'id') = current_setting('test.question'), 'the same one: ' || v;
  assert (select count(*) from public.support_tickets) = 1, 'not a second';

  perform pg_temp.send('idea', 'Show the weather on the rota, please.');
  perform pg_temp.send('idea', 'A dark mode for the café tablet.');
  perform pg_temp.send('question', 'Can two people share one shift?');
  perform pg_temp.send('question', 'Where do I see last month''s tips?');
  assert (select count(*) from public.support_tickets) = 5, 'five in a day';
end $$;
select pg_temp.expect_error($q$select pg_temp.send('idea', 'One more idea for the menu page.')$q$, 'You’ve sent us 5 requests today');
do $$ begin
  assert (select (pg_temp.send('idea', 'Show the weather on the rota, please.') ->> 'duplicate')::boolean), 'one she already sent is still that one';
end $$;
select pg_temp.expect_error($q$select pg_temp.send('question', '   Too short ')$q$, 'Say a little more: at least 10 characters');
select pg_temp.expect_error($q$select pg_temp.send('question', repeat('x', 2001))$q$, 'Keep it to 2,000 characters');
select pg_temp.expect_error($q$select pg_temp.send('complaint', 'Not a kind there is.')$q$, 'Say whether something isn''t working');
select pg_temp.expect_error($q$select public.create_support_ticket('not_working', 'It went blank on me.', null, null, null, 'not-a-fingerprint')$q$,
  'Not an error''s fingerprint');

-- A day later: five more, and the same words again are a new one.
select pg_temp.as_editor();
select pg_temp.later(interval '25 hours');
select pg_temp.act_as('maria@test');
do $$ begin
  assert not (pg_temp.send('question', 'How do I add a second café to my account?') ->> 'duplicate')::boolean, 'a day later, a new one';
  assert (select count(*) from public.support_tickets) = 6, 'six in all';
end $$;

-- 2. Something isn't working: HQ hears about it, once every 15 minutes at most -------------------------------
select pg_temp.as_editor();
-- Nothing told about in the last 15 minutes, from the tests above.
update public.support_tickets set alerted_at = null;
select pg_temp.act_as('pepe@dos');
do $$
declare
  v jsonb;
  v_hq bigint := pg_temp.hq_told();
begin
  v := public.create_support_ticket('not_working', 'The rota went blank when I opened next week.', '/rota', 'index-abc123', 'Mozilla/5.0 (Android)',
    md5('the rota error'));
  perform set_config('test.pepe', v ->> 'id', false);
  assert pg_temp.hq_told() = v_hq + 1, 'HQ''s owner is told straight away';
  assert (select count(*) from public.support_tickets) = 1, 'Pepe reads his own only';
  assert (select error_fingerprint = md5('the rota error') and business_id = 2 and page = '/rota' and alerted_at is not null and not alert_due
            from public.support_tickets), 'linked to its error, and told about';
end $$;
select pg_temp.as_editor();
do $$ begin
  assert exists (select 1 from public.notifications n join public.profiles p on p.id = n.profile_id
                  where p.email = 'hq.owner@test' and n.title = '1 new problem report' and n.link = '/hq/businesses#support'
                    and n.body = 'Latest: “The rota went blank when I opened next week.”. On Businesses, under Support.'),
    'how many, the latest one''s words and where to look';
  assert not exists (select 1 from public.notifications n join public.profiles p on p.id = n.profile_id
                      where p.email in ('hq.staff@test', 'hq.former@test') and n.title like '% new problem report%'),
    'HQ''s active admins only';
end $$;

-- Two more within the 15 minutes (Lola, Bar Dos's admin): held back. A question on the error screen's link: no.
select pg_temp.act_as('lola@dos');
do $$
declare v_hq bigint := pg_temp.hq_told();
begin
  perform pg_temp.send('not_working', 'Clocking in says I am not on the rota.');
  perform pg_temp.send('not_working', 'The till total does not match the report.');
  perform public.create_support_ticket('question', 'Is the rota error from earlier fixed?', null, null, null, md5('the rota error'));
  assert pg_temp.hq_told() = v_hq, 'within 15 minutes of the last: not yet';
  assert (select count(*) from public.support_tickets where alert_due) = 2, 'two waiting to be told about';
  assert (select error_fingerprint is null from public.support_tickets where kind = 'question'), 'only a problem report is linked to an error';
end $$;
select pg_temp.as_worker();
do $$ begin
  assert public.alert_support_tickets() = 0, 'the minute job: not yet either';
end $$;
select pg_temp.as_editor();
select pg_temp.later(interval '16 minutes');
select pg_temp.as_worker();
do $$
declare v_hq bigint := pg_temp.hq_told();
begin
  assert public.alert_support_tickets() = 2, 'once 15 minutes have gone, both in one';
  assert pg_temp.hq_told() = v_hq + 1, 'one notification';
  assert exists (select 1 from public.notifications where title = '2 new problem reports'
                  and body = 'Latest: “The till total does not match the report.”. On Businesses, under Support.'), 'saying how many';
  assert public.alert_support_tickets() = 0, 'nothing more to tell';
end $$;

-- 3. Who reads them -------------------------------------------------------------------------------------
select pg_temp.act_as('lola@dos');
do $$ begin
  assert public.is_admin() and not public.is_hq_admin(), 'Lola runs Bar Dos, not HQ';
  assert (select count(*) from public.support_tickets) = 3, 'her own three: ' || (select count(*) from public.support_tickets);
  assert not exists (select 1 from public.support_tickets where user_id <> auth.uid()), 'not Pepe''s, though he''s in her business';
  assert not exists (select 1 from public.support_tickets where business_id <> 2), 'never another business''s';
  assert not exists (select 1 from public.hq_support_tickets()), 'HQ''s list: none for her';
end $$;
select pg_temp.expect_error($q$select public.hq_answer_support_ticket(current_setting('test.pepe')::bigint, 'closed')$q$, 'Only The Business Agent HQ''s admins');
select pg_temp.expect_error($q$insert into public.support_tickets (business_id, user_id, kind, message) values (2, auth.uid(), 'idea', 'Straight into the table')$q$,
  'permission denied');
select pg_temp.expect_error($q$update public.support_tickets set status = 'closed'$q$, 'permission denied');
select pg_temp.expect_error($q$delete from public.support_tickets$q$, 'permission denied');
select pg_temp.expect_error($q$select public.alert_support_tickets()$q$, 'permission denied');

select pg_temp.act_as('maria@test');
do $$ begin
  assert (select count(*) from public.support_tickets) = 6 and not exists (select 1 from public.support_tickets where business_id <> 1),
    'Maria: her own six, none of Bar Dos''s';
end $$;

select pg_temp.act_as('hq.staff@test');
do $$ begin
  assert not public.is_hq_admin(), 'at HQ, not an admin';
  assert (select count(*) from public.support_tickets) = 0 and not exists (select 1 from public.hq_support_tickets()), 'none of them';
end $$;
select pg_temp.expect_error($q$select public.hq_answer_support_ticket(current_setting('test.pepe')::bigint, 'closed')$q$, 'Only The Business Agent HQ''s admins');
select pg_temp.act_as('hq.former@test');
do $$ begin
  assert (select count(*) from public.support_tickets) = 0 and not exists (select 1 from public.hq_support_tickets()), 'a switched-off admin: none';
end $$;

select pg_temp.act_as('hq.owner@test');
do $$
declare v record;
begin
  assert (select count(*) from public.support_tickets) = 10, 'HQ''s owner reads every one: ' || (select count(*) from public.support_tickets);
  assert (select count(*) from public.hq_support_tickets()) = 10, 'and lists them';
  assert (select status from public.hq_support_tickets() limit 1) = 'open', 'open ones first';
  select * into v from public.hq_support_tickets() where id = current_setting('test.pepe')::bigint;
  assert v.business_name = 'Bar Dos' and v.person = 'Pepe' and v.email = 'pepe@dos' and v.kind = 'not_working'
     and v.page = '/rota' and v.error_fingerprint = md5('the rota error') and v.browser = 'Mozilla/5.0 (Android)', 'whose, from where: ' || row_to_json(v);
end $$;
select pg_temp.expect_error($q$update public.support_tickets set status = 'closed'$q$, 'permission denied');
select pg_temp.expect_error($q$insert into public.support_tickets (business_id, user_id, kind, message) values (1, auth.uid(), 'idea', 'Straight into the table')$q$,
  'permission denied');

reset role;
set role anon;
select pg_temp.expect_error($q$select count(*) from public.support_tickets$q$, 'permission denied');
select pg_temp.expect_error($q$select public.create_support_ticket('question', 'Signed out, asking anyway.')$q$, 'permission denied');
select pg_temp.expect_error($q$select public.hq_support_tickets()$q$, 'permission denied');

-- 4. HQ answers; the person hears about a reply, or their ticket closing --------------------------------------
select pg_temp.act_as('hq.owner@test');
do $$
declare
  v_pepe bigint := current_setting('test.pepe')::bigint;
  v_told bigint := pg_temp.told('pepe@dos');
begin
  perform public.hq_answer_support_ticket(v_pepe, 'looking');
  assert (select status from public.support_tickets where id = v_pepe) = 'looking', 'being looked at';
  assert pg_temp.told('pepe@dos') = v_told, 'which tells him nothing';

  perform public.hq_answer_support_ticket(v_pepe, 'answered', '  Fixed now: reload the app and the rota opens again.  ');
  assert (select status = 'answered' and reply = 'Fixed now: reload the app and the rota opens again.' and replied_at is not null
            and replied_by = auth.uid() from public.support_tickets where id = v_pepe), 'answered, with the reply';
  assert pg_temp.told('pepe@dos') = v_told + 1, 'Pepe hears about it';

  -- Closing it after: one more; saving it again as it is: nothing.
  perform public.hq_answer_support_ticket(v_pepe, 'closed');
  assert (select status = 'closed' and reply = 'Fixed now: reload the app and the rota opens again.' from public.support_tickets where id = v_pepe),
    'closed, the reply kept';
  assert pg_temp.told('pepe@dos') = v_told + 2, 'and hears it''s closed';
  perform public.hq_answer_support_ticket(v_pepe, 'closed', 'Fixed now: reload the app and the rota opens again.');
  assert pg_temp.told('pepe@dos') = v_told + 2, 'nothing new: nothing said';
end $$;
select pg_temp.expect_error($q$select public.hq_answer_support_ticket(current_setting('test.question')::bigint, 'answered')$q$,
  'Write a reply before marking it answered');
select pg_temp.expect_error($q$select public.hq_answer_support_ticket(current_setting('test.question')::bigint, 'done')$q$, 'Status must be');
select pg_temp.expect_error($q$select public.hq_answer_support_ticket(current_setting('test.question')::bigint, 'answered', repeat('x', 4001))$q$,
  'Keep the reply to 4,000 characters');
select pg_temp.expect_error($q$select public.hq_answer_support_ticket(-1, 'closed')$q$, 'No such request');
do $$ begin
  -- Maria's question, closed without a reply.
  perform public.hq_answer_support_ticket(current_setting('test.question')::bigint, 'closed');
end $$;

select pg_temp.act_as('pepe@dos');
do $$ begin
  assert (select status = 'closed' and reply like 'Fixed now%' from public.support_tickets where id = current_setting('test.pepe')::bigint),
    'Pepe reads the reply on his own ticket';
  assert exists (select 1 from public.notifications where title = 'The Business Agent answered your request'
                  and body = 'Fixed now: reload the app and the rota opens again.' and link = '/?help=requests' and business_id = 2),
    'his notification, in his business, with the reply';
  assert exists (select 1 from public.notifications where title = 'Your request is closed'
                  and body = 'You wrote: “The rota went blank when I opened next week.”'), 'and that it''s closed, with what he wrote';
end $$;
select pg_temp.act_as('maria@test');
do $$ begin
  assert exists (select 1 from public.notifications where title = 'Your request is closed' and business_id = 1
                  and body = 'You wrote: “How do I add a second café to my account?”'), 'Maria hears hers is closed';
  assert public.current_business_id() = 1, 'and still works in her own business';
end $$;
select pg_temp.act_as('hq.owner@test');
do $$ begin
  assert public.current_business_id() = (select id from public.business where is_hq), 'HQ''s owner is back in HQ after telling them';
  assert not exists (select 1 from public.notifications where title in ('The Business Agent answered your request', 'Your request is closed')),
    'their notifications aren''t HQ''s';
end $$;

-- 5. Not in an owner's export; gone with their business, and with their person ------------------------------
select pg_temp.as_editor();
do $$ begin
  assert not exists (select 1 from public.export_tables() where name = 'support_tickets'), 'not in an owner''s export';
  assert not exists (select 1 from public.export_tables() where name = 'app_errors'), 'nor the error log, as before';
  assert (select array_agg(name order by name) from public.export_tables()) @> array['business', 'profiles', 'shifts', 'time_entries', 'notifications'],
    'the export as it was';
  assert (select confdeltype from pg_constraint where conrelid = 'public.support_tickets'::regclass and confrelid = 'public.business'::regclass) = 'c',
    'deleted with their business';
  assert (select confdeltype from pg_constraint where conrelid = 'public.support_tickets'::regclass and conname = 'support_tickets_user_id_fkey') = 'c',
    'and with their person';
  assert has_function_privilege('service_role', 'public.alert_support_tickets()', 'execute'), 'the Worker''s minute job';
  assert not has_function_privilege('authenticated', 'public.alert_support_tickets()', 'execute'), 'nobody signed in';
end $$;
-- Nothing made here stays.
rollback;
