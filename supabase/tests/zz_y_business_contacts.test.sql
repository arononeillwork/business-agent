-- Contacts: Easy Beans starts with its lawyer, bank advisor and plumber & electrician; only the owners
-- (admins with pay access) see and change them: not shop managers, employees, partners or the café tablet.
-- Its own people, removed at the end.

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
  ('bc-owner@test', '{"full_name": "Olga"}', now()),
  ('bc-manager@test', '{"full_name": "Manu"}', now()),
  ('bc-staff@test', '{"full_name": "Ana"}', now()),
  ('bc-tablet@test', '{"full_name": "Tablet"}', now()),
  ('bc-gestoria@test', '{"full_name": "Lola", "role": "partner", "partner_company": "Gestoría Sur", "partner_access": ["finances", "payroll"]}', now());
update public.profiles set role = 'admin', can_see_pay = true where email = 'bc-owner@test';
update public.profiles set role = 'admin', can_see_pay = false where email = 'bc-manager@test';
update public.profiles set role = 'kiosk' where email = 'bc-tablet@test';

-- 1. Easy Beans' own: the owner sees all three, as the owners gave them.
select pg_temp.act_as('bc-owner@test');
do $$ begin
  assert (select array_agg(name order by name) from public.business_contacts) = array['Daniel Cruz Luna', 'Eduardo Torquino', 'Miguel'], 'all three';
  assert (select row(job, company, phone, whatsapp, email, website)::text from public.business_contacts where name = 'Daniel Cruz Luna')
    = row('Bank advisor', 'BBVA', '+34 955 677 963', false, 'daniel.cruz.luna@bbva.com', 'https://www.bbva.es')::text, 'the bank advisor';
  assert (select row(job, phone, whatsapp)::text from public.business_contacts where name = 'Eduardo Torquino')
    = row('Lawyer', '+34 747 758 327', false)::text, 'the lawyer';
  assert (select row(job, phone, whatsapp)::text from public.business_contacts where name = 'Miguel')
    = row('Plumber & electrician', '+34 632 042 132', true)::text, 'the plumber, on WhatsApp';
end $$;

-- 2. Nobody else sees any: a shop manager, an employee, a partner (even with finances and payroll), the tablet.
select pg_temp.act_as('bc-manager@test');
do $$ begin assert (select count(*) from public.business_contacts) = 0, 'a shop manager sees none'; end $$;
select pg_temp.act_as('bc-staff@test');
do $$ begin assert (select count(*) from public.business_contacts) = 0, 'an employee sees none'; end $$;
select pg_temp.act_as('bc-gestoria@test');
do $$ begin assert (select count(*) from public.business_contacts) = 0, 'a partner sees none'; end $$;
select pg_temp.act_as('bc-tablet@test');
do $$ begin assert (select count(*) from public.business_contacts) = 0, 'the tablet sees none'; end $$;

-- 3. Nor changes any: a shop manager or an employee adds none, and changes or deletes nothing.
select pg_temp.act_as('bc-manager@test');
select pg_temp.expect_error($q$insert into public.business_contacts (name) values ('Pepe')$q$, 'row-level security');
do $$ begin
  update public.business_contacts set phone = '+34 600 000 000';
  delete from public.business_contacts;
end $$;
select pg_temp.act_as('bc-staff@test');
select pg_temp.expect_error($q$insert into public.business_contacts (name) values ('Pepe')$q$, 'row-level security');
do $$ begin
  update public.business_contacts set phone = '+34 600 000 000';
  delete from public.business_contacts;
end $$;
select pg_temp.act_as('bc-owner@test');
do $$ begin
  assert (select count(*) from public.business_contacts) = 3, 'nothing deleted';
  assert not exists (select 1 from public.business_contacts where phone = '+34 600 000 000'), 'nothing changed';
end $$;

-- 4. An owner adds one (tidied: blanks are none, no WhatsApp without a phone), changes it and deletes it.
do $$
declare v public.business_contacts;
begin
  insert into public.business_contacts (name, job, company, email, notes, whatsapp)
  values ('  Cerrajería Rápida ', ' Locksmith ', '  ', ' llaves@example.com ', ' ', true) returning * into v;
  assert v.name = 'Cerrajería Rápida' and v.job = 'Locksmith' and v.company is null and v.email = 'llaves@example.com' and v.notes is null, 'tidied';
  assert not v.whatsapp and v.updated_by = auth.uid(), 'no WhatsApp without a phone; stamped';
  update public.business_contacts set phone = '+34 600 123 456', whatsapp = true where id = v.id returning * into v;
  assert v.whatsapp, 'WhatsApp with a phone';
  delete from public.business_contacts where id = v.id;
  assert (select count(*) from public.business_contacts) = 3, 'back to Easy Beans'' own';
end $$;

-- 5. The checks: a name, a phone with its country code, a full email, a web link, short enough.
select pg_temp.expect_error($q$insert into public.business_contacts (name) values ('  ')$q$, 'Give them a name');
select pg_temp.expect_error($q$insert into public.business_contacts (name, phone) values ('Pepe', '600 000 000')$q$, 'business_contacts_phone_check');
select pg_temp.expect_error($q$insert into public.business_contacts (name, email) values ('Pepe', 'pepe@')$q$, 'business_contacts_email_check');
select pg_temp.expect_error($q$insert into public.business_contacts (name, website) values ('Pepe', 'pepe.es')$q$, 'business_contacts_website_check');
select pg_temp.expect_error($q$insert into public.business_contacts (name, job) values ('Pepe', repeat('x', 81))$q$, 'business_contacts_job_check');

reset role; select set_config('request.jwt.claim.sub', '', false);
delete from auth.users where email like 'bc-%@test';
