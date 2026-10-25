-- Grants: the answers row and the applications, with what's kept tidy, the deadline on the team
-- calendar, and who sees what. Reuses time_tracking.test.sql's people: maria (an admin, given pay
-- access here and put back as she was at the end) and julio (employee).

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
create temp table maria_before as select can_see_pay from public.profiles where email = 'maria@test';
update public.profiles set can_see_pay = true where email = 'maria@test';
insert into auth.users (email, raw_user_meta_data, invited_at) values
  ('grants-gestoria@test', '{"full_name": "Laura", "role": "partner", "partner_company": "Gestoría Ruiz", "partner_access": ["finances"]}', now()),
  ('grants-rota-partner@test', '{"full_name": "Pablo", "role": "partner", "partner_company": "Rotas SL", "partner_access": ["rota"]}', now());

-- 1. The answers: one row, changed by admins with pay access --------------------------------------
select pg_temp.act_as('maria@test');
do $$ begin
  update public.grant_profile set answers = '{"debts": "no", "hiring": "yes"}';
  assert (select answers ->> 'debts' = 'no' and updated_by = auth.uid() and updated_at > now() - interval '1 minute' from public.grant_profile),
    'answers saved, with who and when';
  assert (select count(*) from public.grant_profile) = 1, 'one row';
end $$;
select pg_temp.expect_error($q$insert into public.grant_profile (id) values (false)$q$, 'check constraint');
select pg_temp.expect_error($q$update public.grant_profile set answers = '[1, 2]'$q$, 'check constraint');

-- 2. Applications: tidied, dated when submitted, one open one per grant -------------------------
do $$
declare v uuid;
begin
  insert into public.grant_applications (grant_id, grant_name, stage, expediente, notes, docs_done, deadline, deadline_label)
    values ('talento-joven', ' Hiring grant: Talento Joven ', 'gathering', '  ', '  ', '{contract, contract, cert_aeat, ""}', '2026-12-31', ' Apply ')
    returning id into v;
  assert (select grant_name = 'Hiring grant: Talento Joven' and expediente is null and notes is null and deadline_label = 'Apply'
          and docs_done = '{cert_aeat, contract}' and created_by = auth.uid() and submitted_on is null
          from public.grant_applications where id = v), 'tidied';
  update public.grant_applications set stage = 'submitted', expediente = 'TR-2026-0042', grant_id = 'fundae', created_at = '2020-01-01' where id = v;
  assert (select stage = 'submitted' and submitted_on = current_date and grant_id = 'talento-joven' and created_at > now() - interval '1 minute'
          from public.grant_applications where id = v), 'submitted today; the grant and when it was added stay';
end $$;
select pg_temp.expect_error($q$insert into public.grant_applications (grant_id, grant_name) values ('talento-joven', 'Again')$q$, 'duplicate key');
select pg_temp.expect_error($q$insert into public.grant_applications (grant_id, grant_name, stage) values ('fundae', 'FUNDAE', 'won')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.grant_applications (grant_id, grant_name, amount_awarded) values ('fundae', 'FUNDAE', -1)$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.grant_applications (grant_id, grant_name) values ('Not An Id!', 'x')$q$, 'check constraint');
do $$ begin
  -- A rejected application can be tracked again.
  insert into public.grant_applications (grant_id, grant_name, stage) values ('pymetur', 'PYMETUR', 'rejected');
  insert into public.grant_applications (grant_id, grant_name) values ('pymetur', 'PYMETUR');
  assert (select count(*) from public.grant_applications where grant_id = 'pymetur') = 2, 'tracked again after a rejection';
  assert exists (select 1 from public.audit_log where table_name = 'grant_applications' and action = 'update'), 'changes audited';
end $$;

-- 3. The deadline on the team calendar, for admins, kept in step -------------------------------
do $$
declare v uuid := (select id from public.grant_applications where grant_id = 'talento-joven');
begin
  assert (select starts_on = '2026-12-31' and visibility = 'admins' and category = 'business'
          and title = 'Grant deadline: Hiring grant: Talento Joven (Apply)'
          from public.calendar_events where external_id = 'grant:' || v), 'deadline on the calendar';
  update public.grant_applications set deadline = '2027-01-15', deadline_label = null where id = v;
  assert (select starts_on = '2027-01-15' and title = 'Grant deadline: Hiring grant: Talento Joven'
          from public.calendar_events where external_id = 'grant:' || v), 'moved with it';
  assert (select count(*) from public.calendar_events where external_id = 'grant:' || v) = 1, 'one event per application';
  update public.grant_applications set stage = 'rejected' where id = v;
  assert not exists (select 1 from public.calendar_events where external_id = 'grant:' || v), 'gone when it''s finished';
  update public.grant_applications set stage = 'awarded' where id = v;
  assert exists (select 1 from public.calendar_events where external_id = 'grant:' || v), 'back when it isn''t';
  delete from public.grant_applications where id = v;
  assert not exists (select 1 from public.calendar_events where external_id = 'grant:' || v), 'gone with the application';
  insert into public.grant_applications (grant_id, grant_name, stage, deadline) values ('talento-joven', 'Hiring grant: Talento Joven', 'gathering', '2026-12-31');
end $$;

-- 4. Staff, admins without pay access and other partners see nothing and change nothing ---------
select pg_temp.act_as('julio@test');
do $$ declare n int; begin
  assert (select count(*) from public.grant_applications) = 0, 'employees see no applications';
  assert (select count(*) from public.grant_profile) = 0, 'or the answers';
  update public.grant_applications set notes = 'x'; get diagnostics n = row_count;
  assert n = 0, 'employees change nothing';
end $$;
select pg_temp.expect_error($q$insert into public.grant_applications (grant_id, grant_name) values ('fundae', 'FUNDAE')$q$, 'row-level security');

reset role; select set_config('request.jwt.claim.sub', '', false);
update public.profiles set can_see_pay = false where email = 'maria@test';
select pg_temp.act_as('maria@test');
do $$ begin
  assert public.is_admin() and not public.can_see_pay(), 'an admin without pay access';
  assert (select count(*) from public.grant_applications) = 0, 'sees no applications';
end $$;

select pg_temp.act_as('grants-rota-partner@test');
do $$ begin
  assert (select count(*) from public.grant_applications) = 0, 'a rota partner sees no applications';
end $$;

-- 5. The gestoría (finances partner) reads, never writes -------------------------------------
select pg_temp.act_as('grants-gestoria@test');
do $$ declare n int; begin
  assert (select count(*) from public.grant_applications) = 3, 'finance partner reads the applications';
  assert (select answers ->> 'hiring' from public.grant_profile) = 'yes', 'and the answers';
  update public.grant_applications set notes = 'x'; get diagnostics n = row_count;
  assert n = 0, 'but changes nothing';
  update public.grant_profile set answers = '{}'; get diagnostics n = row_count;
  assert n = 0, 'not even the answers';
  delete from public.grant_applications; get diagnostics n = row_count;
  assert n = 0, 'or deletes';
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
update public.profiles set can_see_pay = (select can_see_pay from maria_before) where email = 'maria@test';
