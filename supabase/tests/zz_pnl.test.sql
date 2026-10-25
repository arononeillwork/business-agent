-- Profit & loss: the IVA rate and one-off lines. Admins with pay access only; a gestoría with
-- finances access reads; staff see nothing.
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

-- 1. The admin with pay access sets the IVA rate and adds one-off lines ---------------------------
select pg_temp.act_as('maria@test');
do $$
declare v uuid;
begin
  assert (select vat_rate = 10 from public.pnl_settings), 'starts at the café rate, 10%';
  update public.pnl_settings set vat_rate = 21;
  assert (select vat_rate = 21 and updated_by = auth.uid() from public.pnl_settings), 'changed and stamped';
  insert into public.pnl_lines (month, kind, category, label, amount, notes)
    values ('2026-09-01', 'cost', ' Equipment ', '  Grinder repair ', 250, '  ') returning id into v;
  assert (select label = 'Grinder repair' and category = 'Equipment' and notes is null and updated_by = auth.uid()
          from public.pnl_lines where id = v), 'tidied and stamped';
  insert into public.pnl_lines (month, kind, label, amount) values ('2026-07-01', 'income', 'Kit Digital', 2000);
end $$;
select pg_temp.expect_error($q$insert into public.pnl_lines (month, kind, label, amount) values ('2026-09-15', 'cost', 'Mid-month', 1)$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.pnl_lines (month, kind, label, amount) values ('2026-09-01', 'cost', 'Negative', -5)$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.pnl_lines (month, kind, label, amount) values ('2026-09-01', 'gift', 'What', 5)$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.pnl_lines (month, kind, label, amount) values ('2026-09-01', 'cost', '   ', 5)$q$, 'check constraint');
select pg_temp.expect_error($q$update public.pnl_settings set vat_rate = 50$q$, 'check constraint');
do $$ begin
  assert exists (select 1 from public.audit_log where table_name = 'pnl_lines' and action = 'insert'), 'one-off lines audited';
end $$;

-- 2. Staff see nothing and change nothing ----------------------------------------------------------
select pg_temp.act_as('julio@test');
do $$ declare n int; begin
  assert (select count(*) from public.pnl_lines) = 0 and (select count(*) from public.pnl_settings) = 0, 'employees see no P&L';
  update public.pnl_settings set vat_rate = 0; get diagnostics n = row_count;
  assert n = 0, 'employees change nothing';
end $$;
select pg_temp.expect_error($q$insert into public.pnl_lines (month, kind, label, amount) values ('2026-09-01', 'cost', 'Sneaky', 1)$q$, 'row-level security');

-- 3. A gestoría with finances access reads and changes nothing ------------------------------------
reset role;
insert into auth.users (email, raw_user_meta_data, invited_at) values
  ('pnl-partner@test', '{"full_name": "Lola", "role": "partner", "partner_company": "Gestoría Sur", "partner_access": ["finances"]}', now()),
  ('pnl-rota-partner@test', '{"full_name": "Iván", "role": "partner", "partner_company": "Turnos SL", "partner_access": ["rota"]}', now());
select pg_temp.act_as('pnl-partner@test');
do $$ declare n int; begin
  assert (select count(*) from public.pnl_lines) = 2 and (select vat_rate from public.pnl_settings) = 21, 'the gestoría reads';
  delete from public.pnl_lines; get diagnostics n = row_count;
  assert n = 0, 'but deletes nothing';
end $$;
select pg_temp.act_as('pnl-rota-partner@test');
do $$ begin
  assert (select count(*) from public.pnl_lines) = 0, 'a partner without finances access sees no P&L';
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
