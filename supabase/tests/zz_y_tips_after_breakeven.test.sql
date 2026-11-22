-- Tips after breakeven: only an owner (an admin with pay access) turns it on or off; a shop manager and an
-- employee can't. It starts off. Its own people, removed at the end.

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
  ('tips-owner@test', '{"full_name": "Owner"}', now()),
  ('tips-manager@test', '{"full_name": "Manager"}', now());
update public.profiles set role = 'admin', can_see_pay = true where email = 'tips-owner@test';
update public.profiles set role = 'admin', can_see_pay = false where email = 'tips-manager@test';

-- Off for a business that hasn't chosen (the migration turns it on for Easy Beans, business 1, on the live app).
do $$ begin
  assert (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'settings'
    and column_name = 'tips_after_breakeven') = 'false', 'off by default';
end $$;

select pg_temp.act_as('tips-manager@test');
select pg_temp.expect_error($q$update public.settings set tips_after_breakeven = true$q$, 'Only an owner');

select pg_temp.act_as('tips-owner@test');
do $$ begin
  update public.settings set tips_after_breakeven = true;
  assert (select tips_after_breakeven from public.settings), 'an owner turns it on';
  update public.settings set tips_after_breakeven = false;
  assert (select not tips_after_breakeven from public.settings), 'and off';
end $$;

reset role; select set_config('request.jwt.claim.sub', '', false);
update public.settings set updated_by = null where updated_by in (select id from auth.users where email in ('tips-owner@test', 'tips-manager@test'));
delete from auth.users where email in ('tips-owner@test', 'tips-manager@test');
