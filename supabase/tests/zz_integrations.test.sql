-- Outbox, WhatsApp consent and alerts, Google sync triggers. Runs after time_tracking.test.sql
-- and reuses its people: maria (admin), aron and julio (employees).

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
select set_config('request.jwt.claim.sub', '', false);

-- 1. WhatsApp needs consent and a number --------------------------------------------
update public.profiles set phone = '+34 600 111 222' where email = 'julio@test';
do $$ begin
  assert public._enqueue_whatsapp((select id from public.profiles where email = 'julio@test'), 'shift_reminder', array['Julio']) is null,
    'no message without opt-in';
end $$;
update public.profiles set whatsapp_opt_in = true where email = 'julio@test';
do $$
declare v bigint;
begin
  v := public._enqueue_whatsapp((select id from public.profiles where email = 'julio@test'), 'shift_reminder', array['Julio'], 'test-1');
  assert v is not null, 'queued once opted in';
  assert (select payload->>'to' from public.outbox where id = v) = '34600111222', 'number normalised to digits';
  assert public._enqueue_whatsapp((select id from public.profiles where email = 'julio@test'), 'shift_reminder', array['Julio'], 'test-1') is null,
    'duplicate dedupe key ignored';
end $$;

-- 2. Claim / retry with backoff / give up ------------------------------------------
do $$
declare v_id bigint; r record;
begin
  select id into v_id from public.outbox where dedupe_key = 'test-1';
  select * into r from public.claim_outbox(10) where id = v_id;
  assert r.status = 'sending' and r.attempts = 1, 'claimed';
  assert not exists (select 1 from public.claim_outbox(10) where id = v_id), 'not claimed twice';
  perform public.complete_outbox(v_id, false, 'Meta said no');
  assert (select status = 'failed' and next_attempt_at > now() + interval '50 seconds' from public.outbox where id = v_id), 'retry later';
  update public.outbox set attempts = 6, next_attempt_at = now() where id = v_id;
  perform public.complete_outbox(v_id, false, 'still no');
  assert (select status from public.outbox where id = v_id) = 'dead', 'gives up after 6 attempts';
end $$;

-- 3. Employees cannot read or write the outbox or secrets ----------------------------
select pg_temp.act_as('julio@test');
do $$ begin
  assert (select count(*) from public.outbox) = 0, 'employees see no outbox';
  assert (select count(*) from public.integrations) = 0, 'employees see no integrations';
end $$;
select pg_temp.expect_error($q$select * from public.integration_secrets$q$, 'permission denied');
select pg_temp.expect_error($q$insert into public.outbox (kind, payload) values ('whatsapp', '{}')$q$, 'permission denied');
select pg_temp.expect_error($q$select public.claim_outbox(1)$q$, 'permission denied');
select pg_temp.expect_error($q$select public.send_rota(current_date)$q$, 'Only an admin');
reset role;

-- 4. Google hours sync is queued only when Google is connected ------------------------
select set_config('request.jwt.claim.sub', '', false);
update public.business set opening_hours = opening_hours || '{"sun": null}';
do $$ begin
  assert not exists (select 1 from public.outbox where kind = 'google_sync'), 'no sync while disconnected';
end $$;
update public.integrations set status = 'connected' where provider = 'google_business';
update public.business set opening_hours = opening_hours || '{"sun": {"open": "09:00", "close": "16:00"}}';
insert into public.calendar_events (starts_on, title, category) values (current_date + 10, 'Closed for training', 'business');
do $$ begin
  assert (select count(*) from public.outbox where kind = 'google_sync' and status = 'pending') = 1, 'one pending sync';
end $$;

-- 5. Admin sends the rota; posts need a caption (and a photo for Instagram) --------------
insert into public.shifts (profile_id, position_id, starts_at, ends_at)
select id, 1, date_trunc('week', now()) + interval '7 days 8 hours', date_trunc('week', now()) + interval '7 days 14 hours'
  from public.profiles where email = 'julio@test';
select pg_temp.act_as('maria@test');
do $$ begin
  assert public.send_rota((date_trunc('week', now()) + interval '7 days')::date) = 1, 'rota sent to the one opted-in person';
end $$;
select pg_temp.expect_error($q$select public.queue_share('', null, array['google'])$q$, 'caption');
select pg_temp.expect_error($q$select public.queue_share('Feria!', null, array['instagram'])$q$, 'photo');
do $$ begin
  assert public.queue_share('Feria this weekend', 'https://example.com/a.jpg', array['instagram', 'google']) = 2, 'two posts queued';
end $$;
reset role;

-- 6. Missed clock-in alerts go to the person and to admins who opted in -----------------
select set_config('request.jwt.claim.sub', '', false);
update public.profiles set whatsapp_opt_in = true, phone = '+34 600 999 000' where email = 'maria@test';
insert into public.shifts (profile_id, position_id, starts_at, ends_at)
select id, 1, now() - interval '20 minutes', now() + interval '4 hours' from public.profiles where email = 'julio@test';
do $$
declare n int;
begin
  n := public.queue_shift_alerts();
  assert exists (select 1 from public.outbox where payload->>'template' = 'missed_clock_in'), 'employee nudged';
  assert exists (select 1 from public.outbox where payload->>'template' = 'missed_clock_in_admin'), 'admin told';
  perform public.queue_shift_alerts();
  assert (select count(*) from public.outbox where payload->>'template' = 'missed_clock_in') = 1, 'only once per shift';
end $$;

-- 7. Time off ------------------------------------------------------------------------
select pg_temp.act_as('julio@test');
select pg_temp.expect_error($q$select public.request_time_off(current_date + 5, current_date + 3)$q$, 'on or after');
select pg_temp.expect_error($q$select public.request_time_off(current_date - 3, current_date - 1)$q$, 'today or later');
select pg_temp.expect_error($q$select public.request_time_off(current_date + 1, current_date + 40)$q$, 'more than your 30');
select public.request_time_off(current_date + 20, current_date + 24, 'vacation', 'Family visit');
select pg_temp.expect_error($q$select public.request_time_off(current_date + 22, current_date + 22)$q$, 'already have time off');
select pg_temp.expect_error($q$select public.decide_time_off((select id from public.time_off limit 1), true)$q$, 'Only an admin');
select pg_temp.act_as('aron@test'); -- another employee
do $$ begin
  assert (select count(*) from public.time_off) = 0, 'pending requests are private';
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.outbox where payload->>'template' = 'time_off_requested'), 'admins told on WhatsApp';
end $$;
-- Julio has a shift in that period; approving releases it to open shifts, then blocks new ones.
insert into public.shifts (profile_id, position_id, starts_at, ends_at)
select id, 1, (current_date + 21)::timestamp + interval '8 hours', (current_date + 21)::timestamp + interval '14 hours'
  from public.profiles where email = 'julio@test';
select pg_temp.act_as('maria@test');
do $$ begin
  assert public.decide_time_off((select id from public.time_off limit 1), true, 'Enjoy', true) = 1, 'one shift released';
  assert exists (select 1 from public.shifts where profile_id is null and note like '%Released: Julio off%'), 'shift now open';
end $$;
select pg_temp.expect_error($q$insert into public.shifts (profile_id, position_id, starts_at, ends_at)
  select id, 1, (current_date + 22)::timestamp + interval '8 hours', (current_date + 22)::timestamp + interval '12 hours'
    from public.profiles where email = 'julio@test'$q$, 'approved time off');
select pg_temp.act_as('aron@test');
do $$ begin
  assert (select count(*) from public.time_off where status = 'approved') = 1, 'approved time off is visible to the team';
end $$;
select pg_temp.act_as('julio@test');
do $$ begin
  assert public.vacation_days_used(auth.uid(), extract(year from current_date + 20)::int) >= 5, 'days counted';
end $$;
select public.cancel_time_off((select id from public.time_off limit 1));
do $$ begin
  assert (select status from public.time_off limit 1) = 'cancelled', 'cancelled by the employee before it starts';
end $$;
reset role;

-- 8. Spotify approved playlist is visible to staff only while connected ---------------
reset role;
update public.integrations set status = 'connected',
  external = '{"playlist": {"id": "37i9dQ", "name": "Easy Beans mornings"}}' where provider = 'spotify';
select pg_temp.act_as('julio@test');
do $$ begin
  assert public.approved_playlist() ->> 'name' = 'Easy Beans mornings', 'staff see the approved playlist';
  assert (select count(*) from public.integrations) = 0, 'but not the integration record';
end $$;
reset role;
update public.integrations set status = 'disconnected' where provider = 'spotify';
select pg_temp.act_as('julio@test');
do $$ begin
  assert public.approved_playlist() is null, 'nothing when disconnected';
end $$;
reset role;

-- 9. Finances: only admins with pay access; alerts can be switched off ------------------
reset role;
insert into public.expenses (name, amount, source) values ('Rent', 1530, 'sheet'), ('Loan', 641.53, 'sheet');
select pg_temp.act_as('julio@test');
do $$ begin
  assert (select count(*) from public.expenses) = 0, 'employees cannot see expenses';
end $$;
select pg_temp.expect_error($q$insert into public.expenses (name, amount) values ('x', 1)$q$, 'row-level security');
select pg_temp.act_as('maria@test'); -- admin, but without pay access
reset role; update public.profiles set can_see_pay = false where email = 'maria@test';
select pg_temp.act_as('maria@test');
do $$ begin
  assert (select count(*) from public.expenses) = 0, 'admins without pay access cannot see expenses';
end $$;
reset role; update public.profiles set can_see_pay = true where email = 'maria@test';
select pg_temp.act_as('maria@test');
do $$ begin
  assert (select sum(amount) from public.expenses) = 2171.53, 'admin with pay access sees them';
end $$;
update public.expenses set amount = 1600 where name = 'Rent';
select pg_temp.expect_error($q$insert into public.expenses (name, amount) values ('Bad', -5)$q$, 'check');
reset role;
do $$ begin
  assert exists (select 1 from public.audit_log where table_name = 'expenses' and action = 'update'), 'expense changes audited';
end $$;
update public.settings set alert_shift_reminders = false;
do $$ begin
  assert public._enqueue_whatsapp((select id from public.profiles where email = 'julio@test'), 'shift_reminder', array['x'], 'off-test') is null,
    'switched-off alerts are not queued';
  assert public._enqueue_whatsapp((select id from public.profiles where email = 'julio@test'), 'rota_published', array['x'], 'on-test') is not null,
    'other alerts still go out';
end $$;
update public.settings set alert_shift_reminders = true;

-- 10. Partners: read-only, only the areas an admin gave them ----------------------------
reset role;
insert into public.calendar_events (title, category, starts_on, visibility) values
  ('Partner-visible holiday', 'national', '2026-12-08', 'all'), ('Admin-only note', 'business', '2026-12-09', 'admins');
insert into auth.users (email, raw_user_meta_data, invited_at) values
  ('gestoria@test', '{"full_name": "Laura", "role": "partner", "partner_company": "Gestoría Marbella",
                     "partner_access": ["payroll", "finances", "superpowers"]}', now()),
  ('supplier@test', '{"full_name": "Pedro", "role": "partner", "partner_company": "Café Supplies SL",
                      "partner_access": ["calendar"]}', now()),
  ('sneaky@test', '{"full_name": "Sneaky", "role": "partner", "partner_access": ["finances"]}', null);
do $$ begin
  assert (select role from public.profiles where email = 'gestoria@test') = 'partner', 'invited partner gets the partner role';
  assert (select partner_access from public.profiles where email = 'gestoria@test') = array['payroll', 'finances'],
    'unknown areas are dropped';
  assert (select partner_company from public.profiles where email = 'gestoria@test') = 'Gestoría Marbella', 'company stored';
  assert (select role = 'employee' and not active and partner_access = '{}' from public.profiles where email = 'sneaky@test'),
    'self sign-ups cannot make themselves partners';
end $$;

-- Payroll + finances partner (the gestoría)
select pg_temp.act_as('gestoria@test');
do $$ begin
  assert public.is_partner() and not public.is_staff() and not public.is_admin() and not public.can_see_pay(), 'partner is not staff';
  assert (select count(*) from public.expenses) > 0, 'finances partner sees expenses';
  assert (select count(*) from public.time_entries) > 0, 'payroll partner sees timecards';
  assert (select count(*) from public.pay_rates) > 0, 'payroll partner sees pay rates';
  assert (select count(*) from public.calendar_events) = 0, 'no calendar without calendar access';
  assert (select count(*) from public.profiles) = 1, 'partner sees only their own profile row';
  assert (select count(*) from public.partner_team()) > 0, 'payroll partner sees team names';
  assert (select count(*) from public.business) = 1, 'every partner sees the business details';
  assert (select count(*) from public.business_admin_notes) = 0, 'but never admin notes';
  assert (select count(*) from public.outbox) = 0 and (select count(*) from public.audit_log) = 0, 'no outbox or audit log';
  assert (select count(*) from public.shifts where status <> 'published') = 0, 'no draft shifts';
end $$;
select pg_temp.expect_error($q$insert into public.expenses (name, amount) values ('Hack', 1)$q$, 'row-level security');
do $$ declare n int; begin
  update public.expenses set amount = 0; get diagnostics n = row_count;
  assert n = 0, 'partner cannot change expenses';
  update public.business set phone = '1' where id = 1; get diagnostics n = row_count;
  assert n = 0, 'partner cannot change the business';
end $$;
select pg_temp.expect_error($q$delete from public.time_entries$q$, 'permission denied');
select pg_temp.expect_error($q$select public.set_partner_access(auth.uid(), 'x', array['rota'])$q$, 'Only an admin');
select pg_temp.expect_error($q$update public.profiles set partner_access = array['rota'] where id = auth.uid()$q$, 'permission denied');
select pg_temp.expect_error($q$update public.profiles set role = 'admin' where id = auth.uid()$q$, 'admin');
select pg_temp.expect_error($q$select public.clock_in()$q$, '');

-- Calendar-only partner (a supplier)
select pg_temp.act_as('supplier@test');
do $$ begin
  assert (select count(*) from public.calendar_events where title = 'Partner-visible holiday') = 1, 'calendar partner sees public events';
  assert (select count(*) from public.calendar_events where visibility = 'admins') = 0, 'but not admin-only ones';
  assert (select count(*) from public.expenses) = 0, 'no finances without finance access';
  assert (select count(*) from public.time_entries) = 0 and (select count(*) from public.pay_rates) = 0, 'no payroll';
  assert (select count(*) from public.shifts) = 0, 'no rota without rota access';
  assert (select count(*) from public.partner_team()) = 0, 'no team list without rota or payroll';
end $$;

-- Admin changes access; a deactivated partner sees nothing
select pg_temp.act_as('maria@test');
select public.set_partner_access((select id from public.profiles where email = 'supplier@test'), 'Café Supplies SL', array['rota']);
select pg_temp.expect_error($q$select public.set_partner_access((select id from public.profiles where email = 'julio@test'), 'x', array['rota'])$q$, 'not a partner');
select pg_temp.expect_error($q$select public.set_partner_access((select id from public.profiles where email = 'supplier@test'), 'x', array['everything'])$q$, 'check');
select pg_temp.act_as('supplier@test');
do $$ begin
  assert (select count(*) from public.calendar_events) = 0, 'calendar access removed';
  assert (select count(*) from public.shifts) > 0, 'rota access granted';
  assert (select count(*) from public.time_entries) = 0, 'rota access is not payroll access';
end $$;
select pg_temp.act_as('maria@test');
update public.profiles set active = false where email = 'gestoria@test';
select pg_temp.act_as('gestoria@test');
do $$ begin
  assert (select count(*) from public.expenses) = 0 and (select count(*) from public.business) = 0, 'deactivated partner sees nothing';
end $$;
reset role;

-- 11. No self-lockout; the business keeps a name -------------------------------------------
select pg_temp.act_as('maria@test');
select pg_temp.expect_error($q$update public.profiles set active = false where id = auth.uid()$q$, 'your own account');
select pg_temp.expect_error($q$update public.business set name = '  ' where id = 1$q$, 'business_name_not_blank');
do $$ begin
  assert (select active from public.profiles where email = 'maria@test'), 'still active';
end $$;
reset role;

-- 12. Accounts an admin creates with a temporary password ---------------------------------
reset role;
insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values
  ('made-emp@test', '{"full_name": "Made Employee"}', '{"created_by_admin": true, "role": "kiosk"}'),
  ('made-partner@test', '{"full_name": "Made Partner"}',
   '{"created_by_admin": true, "role": "partner", "partner_company": "Acme", "partner_access": ["rota", "bogus"]}'),
  ('selfmade@test', '{"full_name": "Self", "role": "admin", "created_by_admin": true}', '{}');
do $$ begin
  assert (select role = 'kiosk' and active from public.profiles where email = 'made-emp@test'), 'admin-made account active with its role';
  assert (select role = 'partner' and active and partner_company = 'Acme' and partner_access = array['rota']
            from public.profiles where email = 'made-partner@test'), 'admin-made partner keeps company and valid areas';
  assert (select role = 'employee' and not active from public.profiles where email = 'selfmade@test'),
    'user metadata alone (self sign-up) never grants a role or access';
end $$;

-- 13. Sports: staff read, admins choose what to follow, nobody else writes -------------------
reset role;
insert into public.sports_events (id, competition, sport, starts_at, title, big)
  values ('t:1', 'es-laliga', 'football', now() + interval '1 day', 'Barcelona vs Real Madrid', true);
select pg_temp.act_as('julio@test');
do $$ begin
  assert (select count(*) from public.sports_competitions) >= 20, 'staff see the catalogue';
  assert (select count(*) from public.sports_events) = 1, 'staff see fixtures';
end $$;
update public.sports_competitions set followed = false where code = 'es-laliga';
select pg_temp.expect_error($q$insert into public.sports_events (id, competition, sport, starts_at, title) values ('t:2', 'ufc', 'ufc', now(), 'x')$q$, 'permission denied');
select pg_temp.act_as('supplier@test');
do $$ begin
  assert (select count(*) from public.sports_events) = 0, 'partners do not see sports';
end $$;
select pg_temp.act_as('maria@test');
do $$ begin
  assert (select followed from public.sports_competitions where code = 'es-laliga'), 'an employee cannot unfollow';
end $$;
update public.sports_competitions set followed = false where code = 'es-laliga';
select pg_temp.expect_error($q$update public.sports_competitions set source_id = 'x' where code = 'es-laliga'$q$, 'permission denied');
do $$ begin
  assert not (select followed from public.sports_competitions where code = 'es-laliga'), 'an admin can unfollow';
end $$;
reset role;

-- 14. Personal music accounts: only the Worker (service key) reads or writes them ----------
reset role;
insert into public.music_accounts (profile_id, provider, account_label, ciphertext)
  values ((select id from public.profiles where email = 'julio@test'), 'spotify', 'Julio', 'sealed');
select pg_temp.act_as('julio@test');
select pg_temp.expect_error($q$select * from public.music_accounts$q$, 'permission denied');
select pg_temp.act_as('maria@test');
select pg_temp.expect_error($q$select * from public.music_accounts$q$, 'permission denied');
select pg_temp.expect_error($q$delete from public.music_accounts$q$, 'permission denied');
reset role;

-- 15. Preferences, event alerts, notifications, brand ----------------------------------------
select pg_temp.act_as('julio@test');
update public.profiles set preferences = '{"theme": "dark", "textSize": "large"}' where id = auth.uid();
do $$ begin
  assert (select preferences ->> 'theme' from public.profiles where email = 'julio@test') = 'dark', 'anyone saves their own look';
end $$;
select pg_temp.expect_error($q$select public.set_event_alert('sports', 't:1', true)$q$, 'Only an admin');
update public.brand set heading_font = 'Comic Neue' where id = 1;  -- silently refused by row security
do $$ begin
  assert (select heading_font from public.brand) = 'Poppins', 'staff read the brand but cannot change it';
end $$;
select pg_temp.act_as('maria@test');
select pg_temp.expect_error($q$update public.profiles set preferences = '{"theme": "light"}' where email = 'julio@test'$q$, 'Only the person themselves');
do $$ begin
  assert (select preferences ->> 'theme' from public.profiles where email = 'julio@test') = 'dark', 'nobody changes someone else''s look';
  assert public.set_event_alert('sports', 't:1', true), 'admin switches an alert on';
end $$;
update public.brand set heading_font = 'Fraunces' where id = 1;
reset role;
update public.event_alerts set remind_at = now() - interval '1 minute';
do $$ begin
  assert public.deliver_event_alerts() = 1, 'due alert delivered once';
  assert public.deliver_event_alerts() = 0, 'and not again';
  assert exists (select 1 from public.notifications n join public.profiles p on p.id = n.profile_id
                 where p.email = 'maria@test' and n.title = 'Barcelona vs Real Madrid'), 'admins get a notification';
  assert not exists (select 1 from public.notifications n join public.profiles p on p.id = n.profile_id where p.email = 'julio@test'),
    'employees do not';
  assert (select heading_font from public.brand) = 'Fraunces', 'admins change the brand';
end $$;
select pg_temp.act_as('julio@test');
do $$ begin
  assert (select count(*) from public.notifications) = 0, 'people only see their own notifications';
end $$;
reset role;

-- 16. Team crests: found once, stamped onto fixtures (old and new); only the server writes them --
insert into public.sports_events (id, competition, sport, starts_at, title, home, away)
  values ('t:3', 'en-premier', 'football', now() + interval '2 days', 'Man Utd vs Spurs', 'Man Utd', 'Spurs');
insert into public.sports_teams (name, badge, source) values ('Man Utd', 'https://example.test/mu.png', 'thesportsdb');
do $$ begin
  assert (select home_badge from public.sports_events where id = 't:3') = 'https://example.test/mu.png', 'a found crest reaches saved fixtures';
  assert (select away_badge from public.sports_events where id = 't:3') is null, 'teams without a crest stay empty';
end $$;
insert into public.sports_teams (name, badge, source) values ('Spurs', 'https://example.test/spurs.png', 'thesportsdb');
-- A source that has no crests re-saves the fixture with empty ones: the crests stay.
update public.sports_events set home_badge = null, away_badge = null where id = 't:3';
insert into public.sports_events (id, competition, sport, starts_at, title, home, away)
  values ('t:4', 'en-premier', 'football', now() + interval '9 days', 'Spurs vs Man Utd', 'Spurs', 'Man Utd');
do $$ begin
  assert (select home_badge = 'https://example.test/mu.png' and away_badge = 'https://example.test/spurs.png'
            from public.sports_events where id = 't:3'), 'crests survive a re-save without them';
  assert (select home_badge = 'https://example.test/spurs.png' from public.sports_events where id = 't:4'), 'new fixtures get crests';
end $$;
select pg_temp.act_as('maria@test');
do $$ begin
  assert (select count(*) from public.sports_teams) = 2, 'staff can read crests';
end $$;
select pg_temp.expect_error($q$insert into public.sports_teams (name, badge, source) values ('X', 'y', 'flag')$q$, 'permission denied');
reset role;

-- 17. Tax number and preferred contact: tidy values only; people set their own, admins anyone's --
select pg_temp.act_as('maria@test');
update public.business set tax_id = 'B12345678' where id = 1;
select pg_temp.expect_error($q$update public.business set tax_id = 'b-123 456' where id = 1$q$, 'violates check constraint');
update public.profiles set contact_method = 'sms' where email = 'julio@test';
select pg_temp.act_as('julio@test');
update public.profiles set contact_method = 'whatsapp' where email = 'julio@test';
select pg_temp.expect_error($q$update public.profiles set contact_method = 'pigeon' where email = 'julio@test'$q$, 'violates check constraint');
update public.profiles set contact_method = 'email' where email = 'maria@test';  -- someone else's: silently refused
reset role;
do $$ begin
  assert (select tax_id from public.business) = 'B12345678', 'admins save the tax number';
  assert (select contact_method from public.profiles where email = 'julio@test') = 'whatsapp', 'people choose their own contact method';
  assert (select contact_method from public.profiles where email = 'maria@test') is null, 'but not someone else''s';
end $$;

-- 18. Sports favourites: each person's own, invisible to others; partners have none -------------
select pg_temp.act_as('julio@test');
insert into public.sports_favourites (kind, ref) values ('team', 'Real Madrid'), ('competition', 'ufc');
select pg_temp.expect_error($q$insert into public.sports_favourites (kind, ref) values ('player', 'x')$q$, 'violates check constraint');
select pg_temp.act_as('aron@test');
insert into public.sports_favourites (kind, ref) values ('team', 'Barcelona');
do $$ begin
  assert (select count(*) from public.sports_favourites) = 1, 'people only see their own favourites';
end $$;
delete from public.sports_favourites where ref = 'Real Madrid';  -- someone else's: nothing happens
select pg_temp.act_as('supplier@test');
select pg_temp.expect_error($q$insert into public.sports_favourites (kind, ref) values ('team', 'x')$q$, 'row-level security');
reset role;
do $$ begin
  assert (select count(*) from public.sports_favourites) = 3, 'favourites kept';
end $$;
