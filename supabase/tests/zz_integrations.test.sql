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
