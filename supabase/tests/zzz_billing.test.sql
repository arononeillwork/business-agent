-- Plans and billing (migration 36). Runs last and reuses the people from the earlier tests.

create function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_err text;
begin
  begin execute p_sql; exception when others then v_err := sqlerrm; end;
  if v_err is null then raise exception 'Expected error like "%" but statement succeeded: %', p_like, p_sql; end if;
  if v_err not ilike '%' || p_like || '%' then raise exception 'Expected error like "%", got "%"', p_like, v_err; end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);

-- 1. Which plan is in force ------------------------------------------------------------
do $$ begin
  update public.billing set plan = 'business', status = 'trialing', trial_ends_at = now() + interval '59 days';
  assert public.current_plan() = 'business', 'trial gives the top plan';
  update public.billing set trial_ends_at = now() - interval '1 minute';
  assert public.current_plan() = 'free', 'trial over without a payment: Free';
  update public.billing set status = 'active';
  assert public.current_plan() = 'business', 'paid: back on Business';
  update public.billing set status = 'past_due';
  assert public.current_plan() = 'free', 'renewal failed: Free';
  update public.billing set status = 'canceled';
  assert public.current_plan() = 'free', 'cancelled: Free';
  update public.billing set plan = 'pro', status = 'active';
  assert public.plan_allows('whatsapp') and not public.plan_allows('partners'), 'Pro has WhatsApp, not partners';
end $$;

-- 2. Free: limits on people, social accounts, posts and paid apps --------------------------
update public.billing set plan = 'free', status = 'none';
update public.integrations set status = 'disconnected' where provider in ('instagram', 'facebook', 'tiktok', 'whatsapp');
select pg_temp.expect_error($q$update public.integrations set status = 'connected' where provider = 'whatsapp'$q$, 'Pro plan');
update public.integrations set status = 'connected' where provider = 'instagram';
select pg_temp.expect_error($q$update public.integrations set status = 'connected' where provider = 'facebook'$q$, '1 social account');
-- Already connected: saving it again is fine.
update public.integrations set status = 'connected', account_label = 'cafe' where provider = 'instagram';

delete from public.social_posts;
insert into public.social_posts (caption, targets, scheduled_at, status)
  values ('Feria week!', '{facebook}', date_trunc('month', now()) + interval '20 days', 'scheduled');
select pg_temp.expect_error($q$insert into public.social_posts (caption, targets, scheduled_at, status)
  values ('Second', '{facebook}', date_trunc('month', now()) + interval '21 days', 'scheduled')$q$, '1 scheduled post a month');
-- Drafts don't count, and next month has room.
insert into public.social_posts (caption, targets, status) values ('Idea', '{facebook}', 'draft');
insert into public.social_posts (caption, targets, scheduled_at, status)
  values ('Next month', '{facebook}', date_trunc('month', now()) + interval '40 days', 'scheduled');

do $$ begin
  assert (select count(*) from public.profiles where active and role in ('admin', 'employee')) >= 3, 'team already at 3';
end $$;
select pg_temp.expect_error($q$insert into auth.users (email, raw_user_meta_data, invited_at) values ('fourth@test', '{"full_name":"Fourth"}', now())$q$, 'team is full');
-- Self-registrations wait switched off, so they never hit the limit…
insert into auth.users (email, raw_user_meta_data) values ('waiting@test', '{"full_name":"Waiting"}');
-- …until an admin switches them on.
select pg_temp.expect_error($q$update public.profiles set active = true where email = 'waiting@test'$q$, 'team is full');
select pg_temp.expect_error($q$update public.business set sports_enabled = true$q$, 'Pro plan');

-- 3. Paid again: the same things work ----------------------------------------------------
update public.billing set plan = 'business', status = 'active';
update public.profiles set active = true where email = 'waiting@test';
update public.integrations set status = 'connected' where provider = 'facebook';
insert into public.social_posts (caption, targets, scheduled_at, status)
  values ('Second', '{facebook}', date_trunc('month', now()) + interval '21 days', 'scheduled');

-- 4. Only the Worker writes billing; employees can't read it ----------------------------
do $$ begin
  assert (public.plan_status() ->> 'plan') = 'business', 'plan_status for the Worker';
end $$;
select set_config('request.jwt.claim.sub', (select id::text from auth.users where email = 'julio@test'), false);
set role authenticated;
select pg_temp.expect_error($q$update public.billing set status = 'comped'$q$, 'permission denied');
do $$ begin
  assert (select count(*) from public.billing) = 0, 'employees see no billing row';
  assert (public.plan_status() ->> 'plan') = 'business', 'but everyone sees the plan in force';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
