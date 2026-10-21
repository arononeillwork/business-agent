-- Licences & renewals: tidied, admins only (a gestoría with finances access reads), and the nightly
-- reminder reaches every active admin once per renewal, again after the last day moves on.
-- People from the tests before it: maria (admin), julio (employee), tax-partner (zz_tax, finances access).

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
do $$ begin
  insert into public.licences (name, category, issuer, reference, expires_on, renew_every_months, cost, notes)
    values ('  SGAE (música ambiente) ', 'music', ' SGAE ', ' SGAE-29-118804 ', current_date + 10, 12, 246.5, '  ');
  insert into public.licences (name, issuer) values ('Licencia de apertura / actividad', 'Ayuntamiento de Marbella');
  insert into public.licences (name, expires_on, reminder_days) values ('Seguro multirriesgo', current_date + 200, 30);
  assert (select name = 'SGAE (música ambiente)' and issuer = 'SGAE' and reference = 'SGAE-29-118804' and notes is null and updated_by = auth.uid()
          from public.licences where category = 'music'), 'tidied and stamped';
end $$;
select pg_temp.expect_error($q$insert into public.licences (name, category) values ('X', 'magic')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.licences (name, starts_on, expires_on) values ('X', '2026-05-01', '2026-04-01')$q$, 'licences_dates');
select pg_temp.expect_error($q$insert into public.licences (name, link) values ('X', 'not a link')$q$, 'check constraint');
select pg_temp.expect_error($q$select public.licence_reminders()$q$, 'permission denied');

-- The nightly reminder: only what runs out within its reminder days, once, to each active admin.
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$
declare n_admins int := (select count(*) from public.profiles where role = 'admin' and active);
begin
  assert public.licence_reminders() = 1, 'only the SGAE licence is within its 30 days';
  assert (select count(*) from public.notifications where title like 'SGAE (música ambiente) runs out on %' and link = '/licences') = n_admins, 'every active admin hears';
  assert public.licence_reminders() = 0, 'once per renewal';
  update public.licences set expires_on = current_date + 5 where category = 'music';
  assert public.licence_reminders() = 1, 'a new last day: reminded again';
end $$;

select pg_temp.act_as('julio@test');
do $$ declare n int; begin
  assert (select count(*) from public.licences) = 0, 'employees see no licences';
  update public.licences set cost = 0; get diagnostics n = row_count;
  assert n = 0, 'and change none';
end $$;
select pg_temp.expect_error($q$insert into public.licences (name) values ('Sneaky')$q$, 'row-level security');

select pg_temp.act_as('tax-partner@test');
do $$ declare n int; begin
  assert (select count(*) from public.licences) = 3, 'the gestoría reads';
  delete from public.licences; get diagnostics n = row_count;
  assert n = 0, 'and deletes nothing';
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
