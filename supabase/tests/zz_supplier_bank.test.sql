-- Suppliers' bank details, for paying a roaster by transfer from the Coffees page: the account holder,
-- the bank, and the IBAN and BIC kept in capitals without spaces; anything not shaped like one is
-- turned down. Admins change them as they change suppliers; the team can't.
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

-- 1. An admin adds a roaster with its bank details, typed as on the order page: tidied.
select pg_temp.act_as('maria@test');
do $$
declare v_sup uuid;
begin
  insert into public.suppliers (name, kind, supplies, legal_name, bank_name, iban, bic)
    values ('Bank Test Roaster', 'Coffee roaster', '{coffee}', '  Tostarix S.L. ', ' Banco Santander ', ' es86 0049 6064-3622 1613 4651 ', 'bsches mmxxx')
    returning id into v_sup;
  assert (select legal_name = 'Tostarix S.L.' and bank_name = 'Banco Santander' and iban = 'ES8600496064362216134651' and bic = 'BSCHESMMXXX'
            from public.suppliers where id = v_sup), 'bank details tidied';
  -- Emptied: nothing kept.
  update public.suppliers set legal_name = ' ', bank_name = '', iban = '  ', bic = '' where id = v_sup;
  assert (select legal_name is null and bank_name is null and iban is null and bic is null from public.suppliers where id = v_sup), 'emptied';
end $$;
select pg_temp.expect_error($q$insert into public.suppliers (name, iban) values ('Bad IBAN', '0049 6064 3622 1613 4651')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.suppliers (name, iban) values ('Short IBAN', 'ES86 0049')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.suppliers (name, bic) values ('Bad BIC', 'BSCHES')$q$, 'check constraint');

-- 2. The team reads them (Coffees shows the roasters), but can't change them.
select pg_temp.act_as('julio@test');
do $$ begin
  assert exists (select 1 from public.suppliers where name = 'Bank Test Roaster'), 'the team reads the roaster';
end $$;
update public.suppliers set iban = 'GB82WEST12345698765432' where name = 'Bank Test Roaster';
reset role;
do $$ begin
  assert (select iban is null from public.suppliers where name = 'Bank Test Roaster'), 'the team can''t change the bank details';
end $$;
delete from public.suppliers where name = 'Bank Test Roaster';
