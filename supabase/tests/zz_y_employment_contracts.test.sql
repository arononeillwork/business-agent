-- Employment contracts: admins add, change and end them; the gross salary is kept apart, for admins with
-- pay access (an owner) to set and read, so a shop manager runs the contracts without seeing pay; each
-- person reads their own contract and its pay; a payroll gestoría reads them all; another business
-- sees none. Its own people, removed at the end.

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

reset role; select set_config('request.jwt.claim.sub', '', false);
insert into auth.users (email, raw_user_meta_data, invited_at) values
  ('ec-owner@test', '{"full_name": "Olga"}', now()),
  ('ec-manager@test', '{"full_name": "Manu"}', now()),
  ('ec-ana@test', '{"full_name": "Ana"}', now()),
  ('ec-ben@test', '{"full_name": "Ben"}', now()),
  ('ec-gestoria@test', '{"full_name": "Lola", "role": "partner", "partner_company": "Gestoría Sur", "partner_access": ["payroll"]}', now()),
  ('ec-rota@test', '{"full_name": "Iván", "role": "partner", "partner_company": "Turnos SL", "partner_access": ["rota"]}', now());
update public.profiles set role = 'admin', can_see_pay = true where email = 'ec-owner@test';
update public.profiles set role = 'admin', can_see_pay = false where email = 'ec-manager@test';
-- Their ids, for statements that run as someone who can't look them up.
select set_config('test.ana', (select id::text from public.profiles where email = 'ec-ana@test'), false);
select set_config('test.ben', (select id::text from public.profiles where email = 'ec-ben@test'), false);

-- 1. An owner adds Ana's permanent contract and Ben's temporary one, each with its pay ------------------
select pg_temp.act_as('ec-owner@test');
do $$
declare v public.employment_contracts;
begin
  assert public.is_admin() and public.can_see_pay(), 'an owner';
  insert into public.employment_contracts (profile_id, kind, starts_on, trial_ends_on, hours_per_week, convenio, job_title, document_url, notes)
  values (current_setting('test.ana')::uuid, 'indefinido', current_date - 180, current_date - 120, 35, '  Hostelería de Málaga ', ' Camarera, grupo 2 ',
          ' https://drive.google.com/file/d/ana/view ', '  ')
  returning * into v;
  assert v.convenio = 'Hostelería de Málaga' and v.job_title = 'Camarera, grupo 2' and v.notes is null
     and v.document_url = 'https://drive.google.com/file/d/ana/view' and v.updated_by = auth.uid(), 'tidied and stamped';
  insert into public.employment_contract_pay (contract_id, salary, salary_per) values (v.id, 1320, 'month');
  perform set_config('test.ana_contract', v.id::text, false);

  insert into public.employment_contracts (profile_id, kind, starts_on, ends_on, hours_per_week)
  values (current_setting('test.ben')::uuid, 'temporal_produccion', current_date - 60, current_date + 20, 20)
  returning * into v;
  insert into public.employment_contract_pay (contract_id, salary, salary_per) values (v.id, 9.5, 'hour');

  -- A contract stays its person's.
  update public.employment_contracts set profile_id = current_setting('test.ben')::uuid, hours_per_week = 37.5
   where id = current_setting('test.ana_contract')::uuid returning * into v;
  assert v.profile_id = current_setting('test.ana')::uuid and v.hours_per_week = 37.5, 'changed, and still Ana''s';
  assert (select count(*) from public.employment_contracts) = 2 and (select count(*) from public.employment_contract_pay) = 2, 'the owner reads both, with pay';
end $$;
select pg_temp.expect_error($q$insert into public.employment_contracts (profile_id, kind, starts_on) values (current_setting('test.ana')::uuid, 'basura', current_date)$q$,
  'check constraint');
select pg_temp.expect_error($q$insert into public.employment_contracts (profile_id, kind, starts_on, ends_on) values (current_setting('test.ana')::uuid, 'formativo', current_date, current_date - 1)$q$,
  'employment_contracts_dates');
select pg_temp.expect_error($q$insert into public.employment_contracts (profile_id, kind, starts_on, trial_ends_on) values (current_setting('test.ana')::uuid, 'indefinido', current_date, current_date - 1)$q$,
  'employment_contracts_trial');
select pg_temp.expect_error($q$insert into public.employment_contracts (profile_id, kind, starts_on, hours_per_week) values (current_setting('test.ana')::uuid, 'indefinido', current_date, 0)$q$,
  'check constraint');
select pg_temp.expect_error($q$insert into public.employment_contracts (profile_id, kind, starts_on, document_url) values (current_setting('test.ana')::uuid, 'indefinido', current_date, 'drive.google.com/x')$q$,
  'check constraint');
select pg_temp.expect_error($q$insert into public.employment_contracts (profile_id, kind, starts_on) select id, 'indefinido', current_date from public.profiles where email = 'ec-gestoria@test'$q$,
  'someone on the team');
select pg_temp.expect_error($q$insert into public.employment_contract_pay (contract_id, salary) values (gen_random_uuid(), 1000)$q$, 'Contract not found');
select pg_temp.expect_error($q$update public.employment_contract_pay set salary = -1$q$, 'check constraint');
select pg_temp.expect_error($q$update public.employment_contract_pay set salary_per = 'week'$q$, 'check constraint');

-- 2. A shop manager sees every contract and no one's pay; adds and ends contracts, but sets no pay -----
select pg_temp.act_as('ec-manager@test');
do $$
declare n int;
begin
  assert public.is_admin() and not public.can_see_pay(), 'a shop manager';
  assert (select count(*) from public.employment_contracts) = 2, 'sees every contract';
  assert (select count(*) from public.employment_contract_pay) = 0, 'but no one''s pay';
  insert into public.employment_contracts (profile_id, kind, starts_on, hours_per_week) values (auth.uid(), 'indefinido', current_date, 40);
  update public.employment_contracts set ends_on = current_date where profile_id = current_setting('test.ben')::uuid;
  get diagnostics n = row_count;
  assert n = 1, 'ends Ben''s contract today';
  update public.employment_contract_pay set salary = 99999;
  get diagnostics n = row_count;
  assert n = 0, 'changes no one''s pay';
  delete from public.employment_contract_pay;
  get diagnostics n = row_count;
  assert n = 0, 'nor removes it';
end $$;
select pg_temp.expect_error($q$insert into public.employment_contract_pay (contract_id, salary) select id, 5000 from public.employment_contracts where profile_id = auth.uid()$q$,
  'row-level security');

-- 3. Employees see their own contract and its pay, and change nothing ------------------------------------
select pg_temp.act_as('ec-ana@test');
do $$
declare n int;
begin
  assert (select count(*) from public.employment_contracts) = 1 and (select profile_id from public.employment_contracts) = auth.uid(), 'only her own';
  assert (select salary = 1320 and salary_per = 'month' from public.employment_contract_pay), 'with her pay';
  update public.employment_contracts set hours_per_week = 40;
  get diagnostics n = row_count;
  assert n = 0, 'read-only';
  update public.employment_contract_pay set salary = 5000;
  get diagnostics n = row_count;
  assert n = 0, 'her pay too';
end $$;
select pg_temp.expect_error($q$insert into public.employment_contracts (profile_id, kind, starts_on) values (auth.uid(), 'indefinido', current_date)$q$, 'row-level security');
select pg_temp.expect_error($q$insert into public.employment_contract_pay (contract_id, salary) select id, 5000 from public.employment_contracts$q$, 'row-level security');
select pg_temp.act_as('ec-ben@test');
do $$ begin
  assert (select count(*) from public.employment_contracts) = 1 and (select ends_on = current_date from public.employment_contracts), 'Ben sees his own, ended today';
  assert (select count(*) from public.employment_contract_pay) = 1 and (select salary from public.employment_contract_pay) = 9.5, 'and only his own pay';
end $$;

-- 4. The payroll gestoría reads them all, with pay, and writes nothing; a rota-only partner sees none -----
select pg_temp.act_as('ec-gestoria@test');
do $$
declare n int;
begin
  assert (select count(*) from public.employment_contracts) = 3 and (select count(*) from public.employment_contract_pay) = 2, 'the gestoría reads them all';
  update public.employment_contracts set notes = 'Revisado';
  get diagnostics n = row_count;
  assert n = 0, 'and changes none';
  delete from public.employment_contract_pay;
  get diagnostics n = row_count;
  assert n = 0, 'nor removes any pay';
end $$;
select pg_temp.expect_error($q$insert into public.employment_contract_pay (contract_id, salary) values (current_setting('test.ana_contract')::uuid, 1)$q$, 'row-level security');
select pg_temp.act_as('ec-rota@test');
do $$ begin
  assert (select count(*) from public.employment_contracts) = 0 and (select count(*) from public.employment_contract_pay) = 0, 'a rota-only partner sees none';
end $$;

-- 5. Another business sees none of them, and the first business none of its own ------------------------
-- (Made and undone in one transaction, by its own number, so the businesses later tests make keep theirs.)
reset role; select set_config('request.jwt.claim.sub', '', false);
begin;
select set_config('app.business_id', '90', true);
insert into public.business (id, name, timezone, opening_hours) values (90, 'Bar Noventa', 'Europe/Madrid', '{}');
insert into public.settings default values;
insert into public.business_admin_notes default values;
insert into public.billing default values;
select set_config('app.business_id', '', true);
insert into auth.users (email, raw_user_meta_data, invited_at) values ('ec-other@test', '{"full_name": "Otro", "role": "admin", "business_id": "90"}', now());
select pg_temp.act_as('ec-other@test');
do $$ begin
  assert public.current_business_id() = 90 and public.can_see_pay(), 'the other business''s owner';
  assert (select count(*) from public.employment_contracts) = 0, 'sees none of the first business''s contracts';
  assert (select count(*) from public.employment_contract_pay) = 0, 'nor their pay';
  insert into public.employment_contracts (profile_id, kind, starts_on) values (auth.uid(), 'autonomo', current_date);
end $$;
select pg_temp.expect_error($q$insert into public.employment_contracts (profile_id, kind, starts_on) values (current_setting('test.ana')::uuid, 'indefinido', current_date)$q$,
  'someone on the team');
select pg_temp.expect_error($q$insert into public.employment_contract_pay (contract_id, salary) values (current_setting('test.ana_contract')::uuid, 1)$q$, 'Contract not found');
select pg_temp.act_as('ec-owner@test');
do $$ begin
  assert not exists (select 1 from public.employment_contracts where kind = 'autonomo'), 'the first business sees none of the other''s';
end $$;
rollback;

-- 6. The owner changes pay and removes a contract (its pay goes with it); someone who leaves takes theirs
select pg_temp.act_as('ec-owner@test');
do $$ begin
  update public.employment_contract_pay set salary = 1400 where contract_id = current_setting('test.ana_contract')::uuid;
  assert (select salary from public.employment_contract_pay where contract_id = current_setting('test.ana_contract')::uuid) = 1400, 'a raise';
  delete from public.employment_contracts where id = current_setting('test.ana_contract')::uuid;
  assert not exists (select 1 from public.employment_contract_pay where contract_id = current_setting('test.ana_contract')::uuid), 'pay goes with its contract';
end $$;
reset role; select set_config('request.jwt.claim.sub', '', false);
delete from auth.users where email like 'ec-%@test';
do $$ begin
  assert not exists (select 1 from public.employment_contracts) and not exists (select 1 from public.employment_contract_pay), 'gone with their people';
end $$;
