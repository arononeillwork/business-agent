-- Roles & responsibilities and Staff rules: the team reads them, admins write them; duties and rules
-- are tidied and checked; a role's people are on the team and roles can't answer to each other in a
-- circle; each person confirms they've read the rules, and a change to what they say (not to their
-- order) asks again.
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

-- Roles: tidied, people deduplicated, duties trimmed and blank ones dropped.
select pg_temp.act_as('maria@test');
do $$
declare v_julio uuid := (select id from public.profiles where email = 'julio@test');
begin
  insert into public.job_roles (name, summary, sort) values ('  Shift lead ', '', 1);
  insert into public.job_roles (name, summary, reports_to, position_id, people, duties, sort)
  select 'Barista', 'Makes the coffee', (select id from public.job_roles where name = 'Shift lead'),
         (select id from public.positions where name = 'Barista'), array[v_julio, v_julio],
         '[{"when": "opening", "text": "  Switches on the machine "}, {"when": "closing", "text": "   "}, {"when": "service", "text": "Takes orders"}]', 2;
  assert (select name = 'Shift lead' and summary is null and updated_by = auth.uid() from public.job_roles where sort = 1), 'tidied and stamped';
  assert (select people = array[v_julio] from public.job_roles where name = 'Barista'), 'each person once';
  assert (select duties = '[{"when": "opening", "text": "Switches on the machine"}, {"when": "service", "text": "Takes orders"}]'::jsonb
            from public.job_roles where name = 'Barista'), 'duties trimmed, blank ones dropped';
end $$;
select pg_temp.expect_error($q$insert into public.job_roles (name) values ('barista')$q$, 'job_roles_name_key');
select pg_temp.expect_error($q$insert into public.job_roles (name, duties) values ('Kitchen', '[{"when": "lunchtime", "text": "Cooks"}]')$q$, 'Each duty needs');
select pg_temp.expect_error($q$insert into public.job_roles (name, duties) values ('Kitchen', '[{"when": "service"}]')$q$, 'Each duty needs');
select pg_temp.expect_error($q$insert into public.job_roles (name, duties) values ('Kitchen', '{"when": "service"}')$q$, 'Duties must be a list');
select pg_temp.expect_error(format($q$insert into public.job_roles (name, duties) values ('Kitchen', '[{"when": "service", "text": "%s"}]')$q$, repeat('x', 301)), '300 characters');
select pg_temp.expect_error($q$insert into public.job_roles (name, people) values ('Kitchen', array[gen_random_uuid()])$q$, 'Only people on the team');
select pg_temp.expect_error($q$update public.job_roles set reports_to = id where name = 'Barista'$q$, 'answer to itself');
select pg_temp.expect_error($q$update public.job_roles set reports_to = (select id from public.job_roles where name = 'Barista') where name = 'Shift lead'$q$,
  'answers to it');
-- A role taken away: those who answered to it answer to nobody.
do $$ begin
  insert into public.job_roles (name) values ('Temporary lead');
  update public.job_roles set reports_to = (select id from public.job_roles where name = 'Temporary lead') where name = 'Shift lead';
  delete from public.job_roles where name = 'Temporary lead';
  assert (select reports_to is null from public.job_roles where name = 'Shift lead'), 'reports_to cleared';
end $$;

-- Someone in a role who leaves the team drops out of it; the role can still be moved.
reset role;
insert into auth.users (email, raw_user_meta_data, invited_at) values ('roles-leaver@test', '{"full_name": "Leo"}', now());
select pg_temp.act_as('maria@test');
update public.job_roles set people = people || (select id from public.profiles where email = 'roles-leaver@test') where name = 'Barista';
reset role;
delete from auth.users where email = 'roles-leaver@test';
select pg_temp.act_as('maria@test');
do $$ begin
  update public.job_roles set sort = 3 where name = 'Barista';
  assert (select cardinality(people) = 1 and sort = 3 from public.job_roles where name = 'Barista'), 'the leaver dropped out';
end $$;

select pg_temp.act_as('julio@test');
do $$ declare n int; begin
  assert (select count(*) from public.job_roles) = 2, 'the team reads the roles';
  update public.job_roles set summary = 'Boss of everything'; get diagnostics n = row_count;
  assert n = 0, 'and changes none';
end $$;
select pg_temp.expect_error($q$insert into public.job_roles (name) values ('Chief taster')$q$, 'row-level security');
reset role;
insert into auth.users (email, raw_user_meta_data, invited_at) values
  ('roles-gestoria@test', '{"full_name": "Paula", "role": "partner", "partner_company": "Gestoría Norte", "partner_access": ["payroll", "finances"]}', now());
select pg_temp.act_as('roles-gestoria@test');
do $$ begin
  assert (select count(*) from public.job_roles) = 0, 'partners don’t read the roles';
  assert (select count(*) from public.staff_rules) = 0, 'or the rules';
end $$;
select pg_temp.expect_error($q$select public.read_staff_rules()$q$, 'Not allowed');

-- Staff rules: tidied and checked.
select pg_temp.act_as('maria@test');
do $$ begin
  insert into public.staff_rules (title, intro, rules, sort) values (' Phones ', '  ', '["  Phones stay in your locker ", "", "Use them on your break"]', 1);
  assert (select title = 'Phones' and intro is null and rules = '["Phones stay in your locker", "Use them on your break"]'::jsonb
            from public.staff_rules), 'tidied';
end $$;
select pg_temp.expect_error($q$insert into public.staff_rules (title, rules) values ('Empty', '["  "]')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.staff_rules (title, rules) values ('Numbers', '[1, 2]')$q$, 'list of text');
select pg_temp.expect_error(format($q$insert into public.staff_rules (title, rules) values ('Long', '["%s"]')$q$, repeat('x', 501)), '500 characters');

select pg_temp.act_as('julio@test');
select pg_temp.expect_error($q$insert into public.staff_rules (title, rules) values ('Free coffee', '["Always"]')$q$, 'row-level security');
select pg_temp.expect_error($q$insert into public.staff_rules_read (profile_id) values (auth.uid())$q$, 'permission denied');

-- Julio confirms he's read them: he sees his own, Aron doesn't, the admin sees everyone's.
do $$ begin
  perform public.read_staff_rules();
  assert (select count(*) from public.staff_rules_read) = 1, 'his own';
end $$;
select pg_temp.act_as('aron@test');
do $$ begin assert (select count(*) from public.staff_rules_read) = 0, 'not someone else’s'; end $$;
select pg_temp.act_as('maria@test');
do $$ begin assert (select count(*) from public.staff_rules_read) = 1, 'the admin sees who has read them'; end $$;

-- Moving a section keeps its date; changing what it says moves it on (and asks everyone again).
reset role;
alter table public.staff_rules disable trigger staff_rules_rules;
update public.staff_rules set updated_at = now() - interval '1 day';
alter table public.staff_rules enable trigger staff_rules_rules;
select pg_temp.act_as('maria@test');
do $$
declare v_before timestamptz := (select updated_at from public.staff_rules);
begin
  update public.staff_rules set sort = 5;
  assert (select updated_at = v_before from public.staff_rules), 'a new place isn’t a change';
  update public.staff_rules set rules = rules || '["No calls behind the bar"]';
  assert (select updated_at > v_before from public.staff_rules), 'new rules are';
end $$;
reset role;
