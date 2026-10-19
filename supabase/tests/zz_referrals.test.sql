-- Referrals: only admins see them; nobody signed in can add or change them (the Worker does, as
-- the service role); set-up is marked once. Reuses time_tracking.test.sql's people: maria (admin),
-- julio (employee).

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

-- 1. The business has a code; the Worker records a link opened and a business joining ---------
reset role;
do $$ begin
  assert (select referral_code ~ '^[0-9A-F]{8}$' from public.business where id = 1), 'an 8-character code';
end $$;
set role service_role;
insert into public.referral_opens default values;
insert into public.referrals (business_name, contact_name, email) values ('La Tostadora', 'Pepa', 'pepa@tostadora.test');
select pg_temp.expect_error($$insert into public.referrals (business_name, email) values ('X', 'not-an-email')$$, 'check');
select pg_temp.expect_error($$insert into public.referrals (business_name, email) values ('Again', 'pepa@tostadora.test')$$, 'duplicate');

-- 2. Admins read; employees see nothing; nobody signed in can write ----------------------------
select pg_temp.act_as('maria@test');
do $$ begin
  assert (select count(*) from public.referrals) = 1, 'admin sees the referral';
  assert (select count(*) from public.referral_opens) = 1, 'admin sees the link opens';
end $$;
select pg_temp.expect_error($$insert into public.referrals (business_name, email) values ('Sneaky', 'a@b.test')$$, 'permission denied');
select pg_temp.expect_error($$update public.referrals set set_up_at = now()$$, 'permission denied');
select pg_temp.expect_error($$select public.mark_referral_set_up('pepa@tostadora.test')$$, 'permission denied');

select pg_temp.act_as('julio@test');
do $$ begin
  assert (select count(*) from public.referrals) = 0, 'employees see no referrals';
  assert (select count(*) from public.referral_opens) = 0, 'employees see no link opens';
end $$;

-- 3. Set-up is marked by the Worker, once (the first date stays) ------------------------------
reset role;
set role service_role;
do $$
declare first timestamptz;
begin
  assert public.mark_referral_set_up('  PEPA@tostadora.test '), 'found by email, any case';
  first := (select set_up_at from public.referrals where email = 'pepa@tostadora.test');
  assert first is not null, 'set-up stamped';
  perform public.mark_referral_set_up('pepa@tostadora.test');
  assert (select set_up_at from public.referrals where email = 'pepa@tostadora.test') = first, 'the first set-up date stays';
  assert not public.mark_referral_set_up('nobody@test'), 'unknown email: nothing marked';
end $$;
reset role;
