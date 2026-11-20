-- Someone found on Instagram (the `applicants_instagram` migration): an applicant with their Instagram,
-- written as a link or an @ and kept as the name alone; in the CV pool they move through the stages.
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

-- 1. Added by their profile's link: kept as the name alone, in the CV pool, going by their @.
select pg_temp.act_as('maria@test');
do $$
declare v uuid;
begin
  insert into public.applicants (full_name, source, instagram)
    values ('@itselmus', 'instagram', ' https://www.instagram.com/ItsElmus/?hl=en ')
    returning id into v;
  assert (select instagram = 'itselmus' and opening_id is null and stage = 'applied' from public.applicants where id = v), 'the link kept as the name';
  update public.applicants set instagram = '@Its.Elmus_' where id = v;
  assert (select instagram = 'its.elmus_' from public.applicants where id = v), 'an @ kept without it';
  update public.applicants set instagram = 'www.instagram.com/itselmus/' where id = v;
  assert (select instagram = 'itselmus' from public.applicants where id = v), 'a link without https:// too';
  update public.applicants set instagram = ' ' where id = v;
  assert (select instagram is null from public.applicants where id = v), 'empty: none';
  update public.applicants set instagram = 'itselmus' where id = v;

  -- 2. In the pool's lane: under consideration, then an interview (on the calendar, for admins).
  update public.applicants set stage = 'screening' where id = v;
  update public.applicants set stage = 'interview', interview_at = '2026-11-25 10:00+00' where id = v;
  assert (select opening_id is null and stage = 'interview' from public.applicants where id = v), 'moves on with no job';
  assert exists (select 1 from public.calendar_events where external_id = 'interview:' || v and title = 'Interview: @itselmus' and visibility = 'admins'),
    'the interview is on the calendar, with no job named';
  perform set_config('test.elmus', v::text, false);
end $$;

-- Not an Instagram name: refused.
select pg_temp.expect_error($q$update public.applicants set instagram = 'not a handle!' where id = current_setting('test.elmus')::uuid$q$, 'check constraint');
select pg_temp.expect_error($q$update public.applicants set instagram = repeat('x', 31) where id = current_setting('test.elmus')::uuid$q$, 'check constraint');
-- Another site's link isn't taken for a name.
select pg_temp.expect_error($q$update public.applicants set instagram = 'https://www.tiktok.com/@itselmus' where id = current_setting('test.elmus')::uuid$q$, 'check constraint');

-- 3. The team doesn't see them.
select pg_temp.act_as('julio@test');
do $$ begin
  assert not exists (select 1 from public.applicants where instagram = 'itselmus'), 'employees see no applicants';
end $$;

-- Tidy up: removed (as the admin), the interview goes with them.
select pg_temp.act_as('maria@test');
delete from public.applicants where id = current_setting('test.elmus')::uuid;
do $$ begin
  assert not exists (select 1 from public.calendar_events where external_id = 'interview:' || current_setting('test.elmus')), 'the interview goes with them';
end $$;
reset role; select set_config('request.jwt.claim.sub', '', false);
