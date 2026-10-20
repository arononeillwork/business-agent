-- Tax page: the switches, returns filed and documents kept. Admins with pay access only; a
-- gestoría with finances access reads; staff see nothing.
-- Reuses the people of the tests before it: maria (by now the admin with pay access), julio (employee).

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

-- 1. The admin with pay access sets what the business files and records a return ---------------
select pg_temp.act_as('maria@test');
do $$
declare v uuid;
begin
  assert (select withholding and rent and not intra_eu and not instalments from public.tax_settings), 'starts with staff and rent';
  update public.tax_settings set rent = false, gestor_email = '  Gestoria@Example.COM ';
  assert (select not rent and gestor_email = 'gestoria@example.com' and updated_by = auth.uid() from public.tax_settings), 'tidied and stamped';

  insert into public.tax_filings (model, year, period, status, amount, reference) values ('303', 2026, '3T', 'filed', 812.40, ' 3030000123456 ')
    returning id into v;
  assert (select filed_on = current_date and reference = '3030000123456' from public.tax_filings where id = v), 'filed today when no day given';
  update public.tax_filings set status = 'to_do' where id = v;
  assert (select filed_on is null from public.tax_filings where id = v), 'back to do: no filing day';
  update public.tax_filings set status = 'filed', filed_on = '2026-10-15' where id = v;
  assert (select filed_on = '2026-10-15' from public.tax_filings where id = v), 'the day given is kept';
end $$;
select pg_temp.expect_error($q$insert into public.tax_filings (model, year, period) values ('303', 2026, '3T')$q$, 'duplicate key');
select pg_temp.expect_error($q$insert into public.tax_filings (model, year, period) values ('999', 2026, '3T')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.tax_filings (model, year, period) values ('303', 2026, '5T')$q$, 'check constraint');
select pg_temp.expect_error($q$update public.tax_settings set gestor_email = 'not-an-email'$q$, 'check constraint');

-- 2. Documents: where each one is; the file's place never changes, the same file isn't kept twice
do $$
declare v uuid;
begin
  insert into public.tax_documents (name, kind, year, quarter, size, sha256, storage, file_id, folder, link)
    values ('Factura Makro.pdf', 'purchase_invoice', 2026, 4, 52311, repeat('a', 64), 'google_drive', 'file-1',
            '{Tax,2026,Q4,"Purchase invoices"}', 'https://drive.google.com/file/d/file-1/view')
    returning id into v;
  assert (select uploaded_by = auth.uid() from public.tax_documents where id = v), 'who added it';
  update public.tax_documents set kind = 'receipt', quarter = 3, file_id = 'other', storage = 'onedrive', notes = '  ' where id = v;
  assert (select kind = 'receipt' and quarter = 3 and file_id = 'file-1' and storage = 'google_drive' and notes is null
          from public.tax_documents where id = v), 'what it is changes; where it is doesn’t';
end $$;
select pg_temp.expect_error($q$insert into public.tax_documents (name, kind, year, size, sha256, storage, file_id, folder)
  values ('Again.pdf', 'other', 2026, 10, repeat('a', 64), 'google_drive', 'file-2', '{Tax}')$q$, 'duplicate key');
select pg_temp.expect_error($q$insert into public.tax_documents (name, kind, year, size, storage, file_id, folder)
  values ('Social.jpg', 'other', 2026, 10, 'google_drive', 'file-3', '{Social,Posts}')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.tax_documents (name, kind, year, size, storage, file_id, folder)
  values ('Huge.pdf', 'other', 2026, 30000000, 'google_drive', 'file-4', '{Tax}')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.tax_documents (name, kind, year, size, storage, file_id, folder)
  values ('Dropbox.pdf', 'other', 2026, 10, 'dropbox', 'file-5', '{Tax}')$q$, 'check constraint');
do $$ begin
  assert exists (select 1 from public.audit_log where table_name = 'tax_documents' and action = 'update'), 'document changes audited';
  assert exists (select 1 from public.audit_log where table_name = 'tax_filings' and action = 'insert'), 'returns audited';
end $$;

-- 3. Staff see nothing and change nothing --------------------------------------------------------
select pg_temp.act_as('julio@test');
do $$ declare n int; begin
  assert (select count(*) from public.tax_documents) = 0 and (select count(*) from public.tax_filings) = 0
     and (select count(*) from public.tax_settings) = 0, 'employees see no tax';
  update public.tax_settings set rent = true; get diagnostics n = row_count;
  assert n = 0, 'employees change nothing';
end $$;
select pg_temp.expect_error($q$insert into public.tax_filings (model, year, period) values ('111', 2026, '3T')$q$, 'row-level security');

-- 4. A gestoría with finances access reads everything and changes nothing ------------------------
reset role;
insert into auth.users (email, raw_user_meta_data, invited_at) values
  ('tax-partner@test', '{"full_name": "Carmen", "role": "partner", "partner_company": "Gestoría Costa", "partner_access": ["finances"]}', now()),
  ('rota-partner@test', '{"full_name": "Pablo", "role": "partner", "partner_company": "Agencia Turnos", "partner_access": ["rota"]}', now());
select pg_temp.act_as('tax-partner@test');
do $$ declare n int; begin
  assert (select count(*) from public.tax_documents) = 1 and (select count(*) from public.tax_filings) = 1, 'the gestoría reads';
  assert (select gestor_email from public.tax_settings) = 'gestoria@example.com', 'and the settings';
  delete from public.tax_documents; get diagnostics n = row_count;
  assert n = 0, 'but deletes nothing';
end $$;
select pg_temp.expect_error($q$insert into public.tax_filings (model, year, period) values ('111', 2026, '3T')$q$, 'row-level security');

select pg_temp.act_as('rota-partner@test');
do $$ begin
  assert (select count(*) from public.tax_documents) = 0, 'a partner without finances access sees no tax';
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
