-- Staff benefits: the business's own amounts and benefits (the team reads, admins change), each
-- person's holiday for a year (checked when they ask for holiday), the new kinds of leave, and
-- admins recording leave for someone.
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

-- Benefits: the business's amount for one of the law's, and one of its own.
select pg_temp.act_as('maria@test');
do $$ begin
  insert into public.benefits (law_key, amount, details) values ('marriage', 16, '  Convenio de hostelería: one more day ');
  insert into public.benefits (name, details) values ('  Staff meal on every shift ', '');
  assert (select details = 'Convenio de hostelería: one more day' and updated_by = auth.uid() from public.benefits where law_key = 'marriage'), 'tidied and stamped';
  assert (select name = 'Staff meal on every shift' and details is null from public.benefits where law_key is null), 'own benefit tidied';
end $$;
select pg_temp.expect_error($q$insert into public.benefits (law_key) values ('marriage')$q$, 'duplicate key');
select pg_temp.expect_error($q$insert into public.benefits (law_key) values ('Not A Key!')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.benefits (details) values ('nameless')$q$, 'benefits_named');
select pg_temp.expect_error($q$insert into public.benefits (law_key, amount) values ('moving', -1)$q$, 'check constraint');

select pg_temp.act_as('julio@test');
do $$ declare n int; begin
  assert (select count(*) from public.benefits) = 2, 'the team reads the benefits';
  update public.benefits set amount = 99; get diagnostics n = row_count;
  assert n = 0, 'and changes none';
end $$;
select pg_temp.expect_error($q$insert into public.benefits (name) values ('A pony')$q$, 'row-level security');
reset role;
insert into auth.users (email, raw_user_meta_data, invited_at) values
  ('benefits-gestoria@test', '{"full_name": "Lola", "role": "partner", "partner_company": "Gestoría Sur", "partner_access": ["payroll"]}', now()),
  ('benefits-rota-partner@test', '{"full_name": "Iván", "role": "partner", "partner_company": "Turnos SL", "partner_access": ["rota"]}', now());
select pg_temp.act_as('benefits-gestoria@test');
do $$ begin assert (select count(*) from public.benefits) = 2, 'the payroll gestoría reads them'; end $$;
select pg_temp.act_as('benefits-rota-partner@test');
do $$ begin assert (select count(*) from public.benefits) = 0, 'a rota-only partner doesn’t'; end $$;

-- Julio's holiday this coming year is 10 days (he started part-way through): requests are held to it.
select pg_temp.act_as('maria@test');
insert into public.leave_allowances (profile_id, year, holiday_days, note)
select id, extract(year from current_date + 30)::int, 10, 'Started in the autumn' from public.profiles where email = 'julio@test';
select pg_temp.expect_error($q$select public.holiday_allowance(auth.uid(), 2026)$q$, 'permission denied');

select pg_temp.act_as('julio@test');
do $$ begin
  assert (select count(*) from public.leave_allowances) = 1, 'he sees his own allowance';
end $$;
select pg_temp.expect_error($q$select public.request_time_off(current_date + 30, current_date + 41)$q$, 'more than your 10 holiday days');
select pg_temp.expect_error($q$insert into public.leave_allowances (profile_id, year, holiday_days) values (auth.uid(), 2030, 99)$q$, 'row-level security');
select pg_temp.act_as('aron@test');
do $$ begin assert (select count(*) from public.leave_allowances) = 0, 'not someone else’s'; end $$;

-- The new kinds: sickness and family emergencies can be recorded after the fact; a move can't.
select pg_temp.act_as('julio@test');
select public.request_time_off(current_date - 3, current_date - 2, 'sick', 'Flu');
select public.request_time_off(current_date - 1, current_date - 1, 'bereavement');
select pg_temp.expect_error($q$select public.request_time_off(current_date - 10, current_date - 10, 'moving')$q$, 'today or later');
select pg_temp.expect_error($q$select public.request_time_off(current_date + 60, current_date + 60, 'magic')$q$, 'time_off_kind_check');
select public.request_time_off(current_date + 60, current_date + 60, 'moving');

-- Admins record leave for someone: approved already, and their shifts become open shifts.
select pg_temp.expect_error($q$select public.record_time_off(auth.uid(), current_date + 70, current_date + 71, 'sick')$q$, 'Only an admin');
reset role;
insert into public.shifts (profile_id, position_id, starts_at, ends_at)
select id, 1, (current_date + 81)::timestamp + interval '8 hours', (current_date + 81)::timestamp + interval '14 hours'
  from public.profiles where email = 'aron@test';
select pg_temp.act_as('maria@test');
do $$
declare v_aron uuid := (select id from public.profiles where email = 'aron@test');
begin
  assert public.record_time_off(v_aron, current_date + 80, current_date + 80 + 132, 'birth', 'Baby due in the new year') = 1, 'one shift released';
  assert (select status = 'approved' and decided_by = auth.uid() from public.time_off where profile_id = v_aron and kind = 'birth'), 'approved straight away';
  assert exists (select 1 from public.shifts where profile_id is null and note like '%Released: Aron off%'), 'the shift is open';
end $$;
select pg_temp.expect_error($q$select public.record_time_off((select id from public.profiles where email = 'aron@test'), current_date + 100, current_date + 101, 'sick')$q$,
  'already has time off');
select pg_temp.expect_error($q$select public.record_time_off((select id from public.profiles where email = 'julio@test'), current_date + 30, current_date + 41, 'vacation')$q$,
  'more than their 10 holiday days');
select pg_temp.expect_error($q$select public.record_time_off((select id from public.profiles where email = 'benefits-gestoria@test'), current_date + 30, current_date + 31, 'sick')$q$,
  'Person not found');
select pg_temp.expect_error($q$select public.record_time_off((select id from public.profiles where email = 'julio@test'), current_date + 5, current_date + 3, 'sick')$q$,
  'on or after');

-- Without his own allowance, the business's 30 days apply again.
delete from public.leave_allowances;
select pg_temp.act_as('julio@test');
select public.request_time_off(current_date + 30, current_date + 41);

reset role;
select set_config('request.jwt.claim.sub', '', false);
