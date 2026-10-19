-- Customers and leads: the rules on what's saved, consent stamped by the database, and admins
-- only. Reuses time_tracking.test.sql's people: maria (admin), julio (employee).

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

-- 1. An admin adds people; what's typed is tidied ---------------------------------------------
select pg_temp.act_as('maria@test');
do $$
declare v uuid;
begin
  insert into public.customers (first_name, last_name, email, phone, instagram, tags, notes)
    values ('  Lucía ', ' ', ' Lucia@Example.COM ', '+34  600  111 222', '@lucia.mbl', '{" vip", "oat milk", "vip", ""}', '  ')
    returning id into v;
  assert (select first_name = 'Lucía' and last_name is null and email = 'lucia@example.com' and phone = '+34 600 111 222'
          and instagram = 'lucia.mbl' and tags = '{"oat milk", vip}' and notes is null from public.customers where id = v), 'tidied';
  assert (select kind = 'lead' and source = 'walk_in' and not marketing_consent and consent_at is null
          and created_by = auth.uid() from public.customers where id = v), 'defaults: a walk-in lead, no consent';
  -- A business lead with only a company and an email is fine.
  insert into public.customers (kind, company, email, source) values ('lead', 'Hotel Puente Romano', 'concierge@hotel.test', 'event');
  -- A phone number alone is enough too.
  insert into public.customers (phone, kind) values ('+44 7700 900123', 'customer');
end $$;

-- 2. The rules -----------------------------------------------------------------------------------
select pg_temp.expect_error($q$insert into public.customers (first_name, email, phone) values (' ', '', ' ')$q$, 'customers_someone');
select pg_temp.expect_error($q$insert into public.customers (company) values ('Only a company')$q$, 'customers_someone');
select pg_temp.expect_error($q$insert into public.customers (email) values ('not-an-email')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.customers (first_name, phone) values ('Pepe', '600 111 222')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.customers (first_name, kind) values ('Pepe', 'friend')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.customers (first_name, source) values ('Pepe', 'myspace')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.customers (first_name, instagram) values ('Pepe', 'not a handle!')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.customers (first_name, birthday) values ('Pepe', '1850-01-01')$q$, 'check constraint');

-- 3. Consent: stamped when ticked, kept while it stays ticked, cleared when taken back ----------
do $$
declare v uuid; v_at timestamptz;
begin
  insert into public.customers (first_name, marketing_consent, consent_at) values ('Ana', false, '2020-01-01') returning id into v;
  assert (select consent_at is null from public.customers where id = v), 'no consent, no date (whatever was sent)';
  update public.customers set marketing_consent = true, consent_at = '2020-01-01' where id = v;
  select consent_at into v_at from public.customers where id = v;
  assert v_at > now() - interval '1 minute', 'consent dated now, not when the writer says';
  update public.customers set notes = 'Likes flat whites', consent_at = '2021-01-01' where id = v;
  assert (select consent_at = v_at from public.customers where id = v), 'kept while consent stands';
  update public.customers set marketing_consent = false where id = v;
  assert (select consent_at is null from public.customers where id = v), 'taken back: cleared';
  update public.customers set kind = 'customer', created_at = '2020-01-01', created_by = null where id = v;
  assert (select kind = 'customer' and created_at > now() - interval '1 minute' and created_by = auth.uid()
          from public.customers where id = v), 'lead becomes a customer; when and who added stay';
end $$;
do $$ begin
  assert exists (select 1 from public.audit_log where table_name = 'customers' and action = 'update'), 'customer changes audited';
end $$;

-- 4. Staff and partners see nothing and change nothing ----------------------------------------
select pg_temp.act_as('julio@test');
do $$ declare n int; begin
  assert (select count(*) from public.customers) = 0, 'employees see no customers';
  update public.customers set notes = 'x'; get diagnostics n = row_count;
  assert n = 0, 'employees change nothing';
  delete from public.customers; get diagnostics n = row_count;
  assert n = 0, 'employees delete nothing';
end $$;
select pg_temp.expect_error($q$insert into public.customers (first_name) values ('Sneaky')$q$, 'row-level security');

reset role;
insert into auth.users (email, raw_user_meta_data, invited_at) values
  ('marketing-partner@test', '{"full_name": "Paula", "role": "partner", "partner_company": "Agencia Sol",
                              "partner_access": ["finances", "calendar", "rota", "payroll"]}', now());
select pg_temp.act_as('marketing-partner@test');
do $$ begin
  assert public.is_partner(), 'is a partner';
  assert (select count(*) from public.customers) = 0, 'partners see no customers, whatever their areas';
end $$;
select pg_temp.expect_error($q$insert into public.customers (first_name) values ('Sneaky')$q$, 'row-level security');

-- 5. Admins see everyone and can remove them ---------------------------------------------------
select pg_temp.act_as('maria@test');
do $$ declare n int; begin
  assert (select count(*) from public.customers) = 4, 'admin sees all four';
  delete from public.customers where company = 'Hotel Puente Romano'; get diagnostics n = row_count;
  assert n = 1, 'admin removes one';
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);

-- 6. Square's customers: source 'square', each Square id once -------------------------------
insert into public.customers (first_name, email, source, kind, square_id) values ('Inés', 'ines@example.com', 'square', 'customer', 'SQ-1');
do $$ begin
  assert (select source from public.customers where square_id = 'SQ-1') = 'square', 'square is a source';
end $$;
select pg_temp.expect_error($q$insert into public.customers (first_name, source, square_id) values ('Inés again', 'square', 'SQ-1')$q$, 'duplicate key');
select pg_temp.expect_error($q$insert into public.customers (first_name, source) values ('Nobody', 'myspace')$q$, 'customers_source_check');
