-- Customer suggestions: the team reads, adds and sorts ideas into sections, and names and removes sections;
-- only admins delete an idea. Partners and the café tablet see none. Its own people and rows, removed at the end.

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
  ('cs-owner@test', '{"full_name": "Olga"}', now()),
  ('cs-staff@test', '{"full_name": "Ana"}', now()),
  ('cs-tablet@test', '{"full_name": "Tablet"}', now()),
  ('cs-gestoria@test', '{"full_name": "Lola", "role": "partner", "partner_company": "Gestoría Sur", "partner_access": ["finances", "payroll"]}', now());
update public.profiles set role = 'admin', can_see_pay = true where email = 'cs-owner@test';
update public.profiles set role = 'kiosk' where email = 'cs-tablet@test';

-- 1. An employee adds ideas (tidied: spaces, blanks are none), starts a section and sorts two into it.
select pg_temp.act_as('cs-staff@test');
do $$
declare v_a public.customer_suggestions; v_b public.customer_suggestions; v_g public.suggestion_groups;
begin
  insert into public.customer_suggestions (text, customer, source) values ('  Oat milk   at no extra cost ', ' ', ' At the counter ') returning * into v_a;
  assert v_a.text = 'Oat milk at no extra cost' and v_a.customer is null and v_a.source = 'At the counter', 'tidied';
  assert v_a.group_id is null and v_a.updated_by = auth.uid() and v_a.heard_on = current_date, 'not sorted yet; stamped; heard today';
  insert into public.customer_suggestions (text, customer) values ('Free oat milk please', 'Lucía') returning * into v_b;
  insert into public.suggestion_groups (name) values ('  Oat   milk ') returning * into v_g;
  assert v_g.name = 'Oat milk', 'the section''s name tidied';
  update public.customer_suggestions set group_id = v_g.id where id in (v_a.id, v_b.id);
  assert (select count(*) from public.customer_suggestions where group_id = v_g.id) = 2, 'both in the section';
  -- Renamed, and removed: its ideas go back to not sorted yet.
  update public.suggestion_groups set name = 'Oat milk free' where id = v_g.id;
  delete from public.suggestion_groups where id = v_g.id;
  assert (select count(*) from public.customer_suggestions where group_id is null) = 2, 'back to not sorted';
  -- An employee doesn't delete an idea.
  delete from public.customer_suggestions;
  assert (select count(*) from public.customer_suggestions) = 2, 'an employee deletes none';
end $$;

-- 2. The checks: an idea is written, short enough; a section has a name and is one of this business's.
select pg_temp.expect_error($q$insert into public.customer_suggestions (text) values ('   ')$q$, 'Write the idea');
select pg_temp.expect_error($q$insert into public.customer_suggestions (text) values (repeat('x', 1001))$q$, 'customer_suggestions_text_check');
select pg_temp.expect_error($q$insert into public.customer_suggestions (text, source) values ('x', repeat('x', 81))$q$, 'customer_suggestions_source_check');
select pg_temp.expect_error($q$insert into public.suggestion_groups (name) values ('  ')$q$, 'Give the section a name');
select pg_temp.expect_error($q$insert into public.customer_suggestions (text, group_id) values ('x', gen_random_uuid())$q$, 'That section isn''t here any more');

-- 3. Nobody outside the team sees or adds any: a partner (even with finances and payroll), the tablet.
select pg_temp.act_as('cs-gestoria@test');
do $$ begin assert (select count(*) from public.customer_suggestions) = 0, 'a partner sees none'; end $$;
select pg_temp.expect_error($q$insert into public.customer_suggestions (text) values ('x')$q$, 'row-level security');
select pg_temp.expect_error($q$insert into public.suggestion_groups (name) values ('x')$q$, 'row-level security');
select pg_temp.act_as('cs-tablet@test');
do $$ begin assert (select count(*) from public.customer_suggestions) = 0, 'the tablet sees none'; end $$;
select pg_temp.expect_error($q$insert into public.customer_suggestions (text) values ('x')$q$, 'row-level security');

-- 4. An admin deletes an idea.
select pg_temp.act_as('cs-owner@test');
do $$ begin
  assert (select count(*) from public.customer_suggestions where text like '%oat milk%' or text like 'Oat milk%') = 2, 'the owner sees the team''s';
  delete from public.customer_suggestions where text = 'Free oat milk please';
  assert (select count(*) from public.customer_suggestions where text = 'Free oat milk please') = 0, 'deleted';
end $$;

reset role; select set_config('request.jwt.claim.sub', '', false);
delete from public.customer_suggestions where text = 'Oat milk at no extra cost';
delete from auth.users where email like 'cs-%@test';
