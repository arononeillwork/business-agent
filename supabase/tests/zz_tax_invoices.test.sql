-- Invoices: tidied, the supplier's kind as the category, paid gets a day, where it came from never
-- changes; admins with pay access only, a gestoría with finances access reads, staff see nothing.
-- People from the tests before it: maria (by now the admin with pay access), julio (employee).

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
declare v_sup uuid; v uuid;
begin
  insert into public.suppliers (name, kind, email, tax_id) values ('Tostadores del Sur', 'Coffee roaster', 'pedidos@tostadores.test', 'B29123456') returning id into v_sup;
  insert into public.invoices (supplier_id, number, issued_on, total, party_email, party_tax_id, notes, source, email_id, email_from)
    values (v_sup, ' F2026-0142 ', '2026-09-14', 275, ' Facturacion@Tostadores.TEST ', 'b-29.123.456', '  ', 'email', 'gmail:m1:a1', 'facturacion@tostadores.test')
    returning id into v;
  assert (select number = 'F2026-0142' and party_email = 'facturacion@tostadores.test' and party_tax_id = 'B29123456' and notes is null
          and category = 'Coffee roaster' and status = 'to_check' and created_by = auth.uid() from public.invoices where id = v), 'tidied, the supplier’s kind as category';
  update public.invoices set status = 'paid' where id = v;
  assert (select paid_on = current_date from public.invoices where id = v), 'paid today when no day given';
  update public.invoices set status = 'to_pay', paid_on = '2026-01-01', source = 'manual', email_id = 'x', notes = 'Beans, September' where id = v;
  assert (select paid_on is null and source = 'email' and email_id = 'gmail:m1:a1' and notes = 'Beans, September' from public.invoices where id = v),
    'not paid: no day; where it came from stays';
end $$;
select pg_temp.expect_error($q$insert into public.invoices (email_id, source) values ('gmail:m1:a1', 'email')$q$, 'duplicate key');
select pg_temp.expect_error($q$insert into public.invoices (status) values ('lost')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.invoices (direction) values ('sideways')$q$, 'check constraint');
do $$ begin
  assert exists (select 1 from public.audit_log where table_name = 'invoices' and action = 'update'), 'invoice changes audited';
end $$;

select pg_temp.act_as('julio@test');
do $$ declare n int; begin
  assert (select count(*) from public.invoices) = 0, 'employees see no invoices';
  update public.invoices set notes = 'x'; get diagnostics n = row_count;
  assert n = 0, 'and change none';
end $$;
select pg_temp.expect_error($q$insert into public.invoices (number) values ('Sneaky')$q$, 'row-level security');

select pg_temp.act_as('tax-partner@test'); -- the gestoría from zz_tax: finances access
do $$ declare n int; begin
  assert (select count(*) from public.invoices) = 1, 'the gestoría reads';
  delete from public.invoices; get diagnostics n = row_count;
  assert n = 0, 'and deletes nothing';
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
