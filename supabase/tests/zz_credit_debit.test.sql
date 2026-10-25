-- Credit & debit: items tidied, a payment moving the next due date on and closing what's paid off,
-- and who sees what. Reuses time_tracking.test.sql's people: maria (an admin, given pay access here
-- and put back as she was at the end) and julio (employee).

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
create temp table maria_pay_before as select can_see_pay from public.profiles where email = 'maria@test';
update public.profiles set can_see_pay = true where email = 'maria@test';
insert into auth.users (email, raw_user_meta_data, invited_at) values
  ('money-gestoria@test', '{"full_name": "Rocío", "role": "partner", "partner_company": "Gestoría Sol", "partner_access": ["finances"]}', now());

-- 1. Items: tidied and stamped; only money coming in can be "possible" ------------------------------
select pg_temp.act_as('maria@test');
do $$ begin
  insert into public.credit_debit_items (direction, kind, name, party, amount, instalment, every_months, next_due, possible, notes)
    values ('debit', 'loan', '  Loan from Jeremy ', ' Jeremy ', 1000, 100, 1, '2026-11-01', true, '  ');
  insert into public.credit_debit_items (direction, kind, name, amount, possible)
    values ('credit', 'sale', 'Old coffee machine', 1200, true);
  assert (select name = 'Loan from Jeremy' and party = 'Jeremy' and notes is null and not possible and updated_by = auth.uid()
          from public.credit_debit_items where kind = 'loan'), 'tidied, stamped, and a debt is never "possible"';
  assert (select possible from public.credit_debit_items where kind = 'sale'), 'a sale not agreed yet is possible';
end $$;
select pg_temp.expect_error($q$insert into public.credit_debit_items (direction, name, amount) values ('sideways', 'X', 10)$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.credit_debit_items (direction, name, amount) values ('debit', 'X', 0)$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.credit_debit_items (direction, kind, name, amount) values ('debit', 'magic', 'X', 10)$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.credit_debit_items (direction, name, amount, every_months) values ('debit', 'X', 10, 0)$q$, 'check constraint');

-- 2. Payments: this period's moves the date on, an old one typed in later doesn't, the last closes it --
do $$
declare v uuid := (select id from public.credit_debit_items where kind = 'loan');
begin
  insert into public.credit_debit_payments (item_id, paid_on, amount) values (v, '2026-10-28', 100);
  assert (select next_due = '2026-12-01' and not done from public.credit_debit_items where id = v), 'paid for November: next due 1 December';
  insert into public.credit_debit_payments (item_id, paid_on, amount, note) values (v, '2026-09-15', 100, 'September, typed in late');
  assert (select next_due = '2026-12-01' from public.credit_debit_items where id = v), 'an older payment leaves the date';
  insert into public.credit_debit_payments (item_id, paid_on, amount) values (v, '2026-12-03', 800);
  assert (select done and next_due is null from public.credit_debit_items where id = v), 'paid off: done, nothing more due';
end $$;
select pg_temp.expect_error($q$insert into public.credit_debit_payments (item_id, amount) values ((select id from public.credit_debit_items where kind = 'loan'), -5)$q$, 'check constraint');

-- Money in for something that could be raised: it's agreed now.
do $$
declare v uuid;
begin
  insert into public.credit_debit_items (direction, kind, name, amount, possible) values ('credit', 'sale', 'Bar stools', 300, true) returning id into v;
  insert into public.credit_debit_payments (item_id, amount) values (v, 100);
  assert (select not possible and not done from public.credit_debit_items where id = v), 'agreed once money comes in';
  delete from public.credit_debit_items where id = v;
end $$;

-- A month's last day stays the month's last day it can be (31 Jan → 28 Feb), as in shared/licences.ts.
do $$
declare v uuid;
begin
  insert into public.credit_debit_items (direction, kind, name, amount, instalment, every_months, next_due)
    values ('debit', 'finance', 'Grinder on finance', 600, 50, 1, '2027-01-31') returning id into v;
  insert into public.credit_debit_payments (item_id, paid_on, amount) values (v, '2027-01-30', 50);
  assert (select next_due = '2027-02-28' from public.credit_debit_items where id = v), 'end of the month kept';
  delete from public.credit_debit_items where id = v;
  assert (select count(*) from public.credit_debit_payments where item_id = v) = 0, 'its payments go with it';
end $$;

-- 3. Who: an admin without pay access, employees and the gestoría ------------------------------------
reset role;
update public.profiles set can_see_pay = false where email = 'maria@test';
select pg_temp.act_as('maria@test');
do $$ begin
  assert (select count(*) from public.credit_debit_items) = 0, 'an admin without pay access sees none';
end $$;
select pg_temp.expect_error($q$insert into public.credit_debit_items (direction, name, amount) values ('debit', 'Sneaky', 10)$q$, 'row-level security');

select pg_temp.act_as('julio@test');
do $$ declare n int; begin
  assert (select count(*) from public.credit_debit_items) = 0, 'employees see none';
  assert (select count(*) from public.credit_debit_payments) = 0, 'nor their payments';
  update public.credit_debit_items set amount = 1; get diagnostics n = row_count;
  assert n = 0, 'and change none';
end $$;

select pg_temp.act_as('money-gestoria@test');
do $$ declare n int; begin
  assert (select count(*) from public.credit_debit_items) = 2, 'the gestoría reads the items';
  assert (select count(*) from public.credit_debit_payments) = 3, 'and the payments';
  delete from public.credit_debit_items; get diagnostics n = row_count;
  assert n = 0, 'and deletes nothing';
end $$;
select pg_temp.expect_error($q$insert into public.credit_debit_payments (item_id, amount) values ((select id from public.credit_debit_items where kind = 'sale'), 5)$q$, 'row-level security');

reset role;
update public.profiles set can_see_pay = (select can_see_pay from maria_pay_before) where email = 'maria@test';
select set_config('request.jwt.claim.sub', '', false);
