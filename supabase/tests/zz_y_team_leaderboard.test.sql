-- Leaderboard: everyone's clock-ins added up for the whole team (on time within 5 minutes of the
-- shift's start, hours on finished timecards, days, the order of on-time and late starts, checklist
-- ticks) without anyone reading another's timecards; not for partners or the café tablet. And each
-- person's Square login: admins see the links, each person their own, and only the Worker writes them.
-- Its own people, removed at the end.

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

-- A day's 09:00 in the business's time zone, `ago` days back.
create function pg_temp.at_nine(ago int, plus interval default '0') returns timestamptz language sql as $$
  select ((current_date - ago) + time '09:00') at time zone public.business_tz() + plus
$$;
create function pg_temp.board_row(p_email text) returns jsonb language sql as $$
  select r from jsonb_array_elements(public.team_leaderboard(current_date - 7, current_date)) r
   where r ->> 'profile_id' = (select id::text from public.profiles where email = p_email)
$$;

reset role; select set_config('request.jwt.claim.sub', '', false);
insert into auth.users (email, raw_user_meta_data, invited_at) values
  ('lb-owner@test', '{"full_name": "Olga"}', now()),
  ('lb-ana@test', '{"full_name": "Ana"}', now()),
  ('lb-ben@test', '{"full_name": "Ben"}', now()),
  ('lb-tablet@test', '{"full_name": "Tablet"}', now()),
  ('lb-gestoria@test', '{"full_name": "Lola", "role": "partner", "partner_company": "Gestoría Sur", "partner_access": ["payroll"]}', now());
update public.profiles set role = 'admin', can_see_pay = true where email = 'lb-owner@test';
update public.profiles set role = 'kiosk' where email = 'lb-tablet@test';

-- Ana: three shifts, on time, on time (4 minutes after), then 10 minutes late. Ben: 6 minutes late, then
-- on time, and a clock-in with no shift (hours, not punctuality). Each four hours.
insert into public.shifts (profile_id, position_id, starts_at, ends_at)
select p.id, null, pg_temp.at_nine(d), pg_temp.at_nine(d, '5 hours')
  from public.profiles p, unnest(array[3, 2, 1]) d where p.email = 'lb-ana@test';
insert into public.shifts (profile_id, position_id, starts_at, ends_at)
select p.id, null, pg_temp.at_nine(d), pg_temp.at_nine(d, '5 hours')
  from public.profiles p, unnest(array[3, 2]) d where p.email = 'lb-ben@test';
insert into public.time_entries (profile_id, shift_id, clock_in, clock_out, source)
select s.profile_id, s.id, s.starts_at + x.late, s.starts_at + x.late + interval '4 hours', 'phone'
  from public.shifts s join public.profiles p on p.id = s.profile_id
  join (values ('lb-ana@test', 3, interval '0'), ('lb-ana@test', 2, interval '4 minutes'), ('lb-ana@test', 1, interval '10 minutes'),
               ('lb-ben@test', 3, interval '6 minutes'), ('lb-ben@test', 2, interval '-2 minutes')) x(email, ago, late)
    on x.email = p.email and s.starts_at = pg_temp.at_nine(x.ago);
insert into public.time_entries (profile_id, clock_in, clock_out, source)
select id, pg_temp.at_nine(1, '2 hours'), pg_temp.at_nine(1, '6 hours'), 'phone' from public.profiles where email = 'lb-ben@test';
-- Ana ticked a checklist item off today.
insert into public.checklist_ticks (item_id, day, done_by)
select i.id, current_date, (select id from public.profiles where email = 'lb-ana@test')
  from public.checklist_items i
 where i.business_id = 1 and not exists (select 1 from public.checklist_items s where s.parent_id = i.id)
   and not exists (select 1 from public.checklist_ticks t where t.item_id = i.id and t.day = current_date)
 limit 1;

-- 1. An employee sees the whole board, though not Ben's timecards themselves.
select pg_temp.act_as('lb-ana@test');
do $$
declare a jsonb := pg_temp.board_row('lb-ana@test'); b jsonb := pg_temp.board_row('lb-ben@test');
begin
  assert (select count(*) from public.time_entries where profile_id = (select id from public.profiles where email = 'lb-ben@test')) = 0, 'Ben''s timecards are his';
  assert a is not null and b is not null, 'both on the board';
  assert (a ->> 'clock_ins')::int = 3 and (a ->> 'on_shift')::int = 3 and (a ->> 'on_time')::int = 2 and (a ->> 'late')::int = 1, 'Ana: two on time (4 minutes is), one late';
  assert a ->> 'starts' = 'ool', 'Ana''s starts in order';
  assert (a ->> 'minutes')::int = 720 and (a ->> 'days')::int = 3, 'Ana: 12 hours over 3 days';
  assert (b ->> 'clock_ins')::int = 3 and (b ->> 'on_shift')::int = 2 and (b ->> 'on_time')::int = 1 and (b ->> 'late')::int = 1, 'Ben: one late (6 minutes), one on time, one with no shift';
  assert b ->> 'starts' = 'lo', 'Ben''s starts in order';
  assert (b ->> 'minutes')::int = 720 and (b ->> 'days')::int = 3, 'Ben: 12 hours over 3 days';
  assert (a ->> 'ticks')::int = 1 and (b ->> 'ticks')::int = 0, 'Ana''s tick';
  assert pg_temp.board_row('lb-owner@test') is null, 'nothing to show: not on the board';
end $$;

-- 2. A shorter period leaves the rest out.
do $$
declare a jsonb := (select r from jsonb_array_elements(public.team_leaderboard(current_date - 1, current_date)) r
                     where r ->> 'profile_id' = (select id::text from public.profiles where email = 'lb-ana@test'));
begin
  assert (a ->> 'clock_ins')::int = 1 and a ->> 'starts' = 'l', 'yesterday only';
end $$;
select pg_temp.expect_error($q$select public.team_leaderboard(current_date, current_date - 1)$q$, 'up to three months');
select pg_temp.expect_error($q$select public.team_leaderboard(current_date - 120, current_date)$q$, 'up to three months');

-- 3. Not for a partner (even with payroll) or the café tablet.
select pg_temp.act_as('lb-gestoria@test');
select pg_temp.expect_error($q$select public.team_leaderboard(current_date - 7, current_date)$q$, 'Only the team');
select pg_temp.act_as('lb-tablet@test');
select pg_temp.expect_error($q$select public.team_leaderboard(current_date - 7, current_date)$q$, 'Only the team');

-- 4. Square logins: the Worker links them; admins see every link, each person their own; nobody writes one.
reset role; select set_config('request.jwt.claim.sub', '', false);
insert into public.square_team_links (profile_id, team_member_id, created_in_square)
select id, case email when 'lb-ana@test' then 'TM_ana' else 'TM_ben' end, email = 'lb-ben@test' from public.profiles where email in ('lb-ana@test', 'lb-ben@test');
select pg_temp.expect_error($q$insert into public.square_team_links (profile_id, team_member_id)
  select id, 'TM_ana' from public.profiles where email = 'lb-owner@test'$q$, 'square_team_links_member_key');
select pg_temp.expect_error($q$insert into public.square_team_links (profile_id, team_member_id)
  select id, 'not an id!' from public.profiles where email = 'lb-owner@test'$q$, 'square_team_links_team_member_id_check');
select pg_temp.act_as('lb-owner@test');
do $$ begin
  assert (select count(*) from public.square_team_links where team_member_id in ('TM_ana', 'TM_ben')) = 2, 'an admin sees both';
end $$;
select pg_temp.expect_error($q$insert into public.square_team_links (profile_id, team_member_id)
  select id, 'TM_olga' from public.profiles where email = 'lb-owner@test'$q$, 'permission denied');
select pg_temp.expect_error($q$delete from public.square_team_links$q$, 'permission denied');
select pg_temp.act_as('lb-ana@test');
do $$ begin
  assert (select array_agg(team_member_id) from public.square_team_links) = array['TM_ana'], 'Ana sees her own';
end $$;
select pg_temp.expect_error($q$update public.square_team_links set team_member_id = 'TM_x'$q$, 'permission denied');
select pg_temp.act_as('lb-gestoria@test');
do $$ begin assert (select count(*) from public.square_team_links) = 0, 'a partner sees none'; end $$;

reset role; select set_config('request.jwt.claim.sub', '', false);
delete from public.checklist_ticks where done_by in (select id from public.profiles where email like 'lb-%@test');
delete from public.time_entries where profile_id in (select id from public.profiles where email like 'lb-%@test');
delete from public.shifts where profile_id in (select id from public.profiles where email like 'lb-%@test');
delete from auth.users where email like 'lb-%@test';
