-- Outsourcing: the catalogue and the jobs are tidied, admins only (a gestoría with finances access
-- reads), names are one each, a job's hours or visits only count for a price charged that way, and
-- someone who has done a job is archived, never deleted.
-- People from the tests before it: maria (admin), julio (employee).

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

select pg_temp.act_as('maria@test');
do $$
declare lucia uuid; costa uuid; job uuid;
begin
  insert into public.contractors (name, kind, services, email, whatsapp, rate, rate_unit, rating, notes)
    values ('  Lucía Marín ', 'freelancer', array[' Social media management ', 'Photography & video', 'social media MANAGEMENT', '  '],
            ' Hola@LuciaMarin.example ', true, 350, 'month', 5, '  ')
    returning id into lucia;
  assert (select name = 'Lucía Marín' and services = array['Social media management', 'Photography & video'] and email = 'hola@luciamarin.example'
            and notes is null and not whatsapp and updated_by = auth.uid() from public.contractors where id = lucia),
    'tidied: each job once in the order given, the email in small letters, no WhatsApp without a phone';
  insert into public.contractors (name, kind, services, phone, whatsapp) values ('Costa Social Studio', 'agency', array['Social media management'], '+34 952 00 11 22', true)
    returning id into costa;
  assert (select whatsapp from public.contractors where id = costa), 'WhatsApp with a phone';

  insert into public.outsourced_jobs (service, contractor_id, price, price_unit, quantity, quantity_per, starts_on, scope)
    values (' Social media management ', lucia, 350, 'month', 3, 'week', '2026-04-01', ' 3 posts a week ')
    returning id into job;
  assert (select service = 'Social media management' and scope = '3 posts a week' and quantity is null and quantity_per is null
          from public.outsourced_jobs where id = job), 'a monthly price has no hours or visits';
  insert into public.outsourced_jobs (service, contractor_id, price, price_unit, quantity, quantity_per)
    values ('Window cleaning', costa, 35, 'visit', 2, 'month');
  assert (select quantity = 2 and quantity_per = 'month' from public.outsourced_jobs where service = 'Window cleaning'), 'visits a month kept';
  update public.outsourced_jobs set active = false, ends_on = '2026-09-30' where id = job;
  assert (select not active from public.outsourced_jobs where id = job), 'a job ends';
end $$;
select pg_temp.expect_error($q$insert into public.contractors (name) values ('lucía marín')$q$, 'already someone called lucía marín');
select pg_temp.expect_error($q$insert into public.contractors (name, kind) values ('X', 'magician')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.contractors (name, rating) values ('X', 6)$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.contractors (name, website) values ('X', 'not a link')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.contractors (name, services) values ('X', array[repeat('a', 81)])$q$, 'Keep each job to 80 characters');
select pg_temp.expect_error($q$insert into public.outsourced_jobs (service, contractor_id, price_unit, quantity) select 'Cleaning', id, 'hour', 6 from public.contractors limit 1$q$, 'outsourced_jobs_quantity');
select pg_temp.expect_error($q$insert into public.outsourced_jobs (service, contractor_id, starts_on, ends_on) select 'Cleaning', id, '2026-05-01', '2026-04-01' from public.contractors limit 1$q$, 'outsourced_jobs_dates');
select pg_temp.expect_error($q$insert into public.outsourced_jobs (service) values ('Nobody does it')$q$, 'contractor_id');
-- Someone who has done a job stays (archived); someone who hasn't can go.
select pg_temp.expect_error($q$delete from public.contractors where name = 'Lucía Marín'$q$, 'has done jobs for the business: archive them instead');
do $$ declare n int; begin
  insert into public.contractors (name) values ('Just asked for a quote');
  delete from public.contractors where name = 'Just asked for a quote'; get diagnostics n = row_count;
  assert n = 1, 'nobody who never did a job can be deleted';
  update public.contractors set active = false where name = 'Lucía Marín'; get diagnostics n = row_count;
  assert n = 1, 'archived instead';
end $$;

select pg_temp.act_as('julio@test');
do $$ declare n int; begin
  assert (select count(*) from public.contractors) = 0 and (select count(*) from public.outsourced_jobs) = 0, 'employees see no outsourcing';
  update public.contractors set rate = 0; get diagnostics n = row_count;
  assert n = 0, 'and change none';
end $$;
select pg_temp.expect_error($q$insert into public.contractors (name) values ('Sneaky')$q$, 'row-level security');

reset role;
insert into auth.users (email, raw_user_meta_data, invited_at) values
  ('outsourcing-gestoria@test', '{"full_name": "Lola", "role": "partner", "partner_company": "Gestoría Sur", "partner_access": ["finances"]}', now()),
  ('outsourcing-rota@test', '{"full_name": "Rafa", "role": "partner", "partner_company": "Turnos SL", "partner_access": ["rota"]}', now());
select pg_temp.act_as('outsourcing-gestoria@test');
do $$ declare n int; begin
  assert (select count(*) from public.contractors) = 2 and (select count(*) from public.outsourced_jobs) = 2, 'the gestoría reads';
  delete from public.outsourced_jobs; get diagnostics n = row_count;
  assert n = 0, 'and deletes nothing';
end $$;
select pg_temp.expect_error($q$insert into public.contractors (name) values ('Sneaky')$q$, 'row-level security');
select pg_temp.act_as('outsourcing-rota@test');
do $$ begin
  assert (select count(*) from public.contractors) = 0 and (select count(*) from public.outsourced_jobs) = 0, 'other partners see none';
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
