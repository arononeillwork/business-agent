-- Posts about the café (the posts_about_the_cafe migration): a customer's collab reel kept with its
-- figures, its poster put forward as a rep waiting for an owner (who hears why), and new followers day
-- by day, which admins read and only the Worker writes.
-- People from the tests before it: maria (admin), julio (employee). Maria is an owner here (she sees pay).

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.headers', '', false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

-- The Worker: the service role, naming the business.
create function pg_temp.as_worker() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', 'service_role', false);
  perform set_config('request.headers', json_build_object('x-business-id', (select min(id) from public.business)::text)::text, false);
  set role service_role;
end $$;

create function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_err text;
begin
  begin execute p_sql; exception when others then v_err := sqlerrm; end;
  if v_err is null then raise exception 'Expected error like "%" but statement succeeded: %', p_like, p_sql; end if;
  if v_err not ilike '%' || p_like || '%' then raise exception 'Expected error like "%", got "%"', p_like, v_err; end if;
end $$;

create temp table maria_pay_posts as select can_see_pay from public.profiles where email = 'maria@test';
update public.profiles set can_see_pay = true where email = 'maria@test';

-- 1. A customer's collab reel, with its figures ---------------------------------------------------------
select pg_temp.as_worker();
insert into public.instagram_mentions (id, kind, username, mentioned_at, video, likes, comments, views, figures_at)
values ('collab:DfNora0001', 'collab', 'nora.eats.mbl', now() - interval '1 day', true, 1180, 64, 14200, now());
select pg_temp.expect_error($q$insert into public.instagram_mentions (id, kind, username, mentioned_at) values ('x:1', 'reel', 'a', now())$q$, 'instagram_mentions_kind_check');
select pg_temp.expect_error($q$update public.instagram_mentions set likes = -1 where id = 'collab:DfNora0001'$q$, 'check constraint');
do $$ begin
  assert (select not put_forward and rep_checked_at is null from public.instagram_mentions where id = 'collab:DfNora0001'), 'not looked at yet';
end $$;

-- 2. Its poster, put forward: waits for an owner, who hears why ------------------------------------------
insert into public.sales_reps (name, kind, instagram, approved, found_mention_id, instagram_followers)
values ('@nora.eats.mbl', 'customer', 'nora.eats.mbl', false, 'collab:DfNora0001', 8900);
do $$ begin
  assert (select not approved from public.sales_reps where instagram = 'nora.eats.mbl'), 'waits for an owner';
  assert exists (select 1 from public.notifications n join public.profiles p on p.id = n.profile_id where p.email = 'maria@test'
    and n.title = '@nora.eats.mbl posted about the café: waiting for your OK as a rep' and n.body = 'Reaches 8,900 people'), 'the owners hear why';
end $$;
select pg_temp.expect_error($q$update public.sales_reps set found_mention_id = 'collab:nothing' where instagram = 'nora.eats.mbl'$q$, 'sales_reps_found_mention_fkey');
update public.instagram_mentions set rep_checked_at = now(), put_forward = true where id = 'collab:DfNora0001';

-- An owner says yes. The reel taken off again (added by its link by mistake): they stay a rep.
select pg_temp.act_as('maria@test');
select public.decide_rep((select id from public.sales_reps where instagram = 'nora.eats.mbl'), true);
select pg_temp.as_worker();
delete from public.instagram_mentions where id = 'collab:DfNora0001';
do $$ begin
  assert (select approved and found_mention_id is null from public.sales_reps where instagram = 'nora.eats.mbl'), 'a rep stays when the post goes';
end $$;

-- 3. New followers each day: one row a day; admins read them, only the Worker writes them -----------------
insert into public.social_follower_days (source, day, gained) values ('instagram', current_date - 2, 12), ('instagram', current_date - 1, 40);
insert into public.social_follower_days (source, day, gained) values ('instagram', current_date - 1, 41)
  on conflict (business_id, source, day) do update set gained = excluded.gained;
select pg_temp.expect_error($q$insert into public.social_follower_days (source, day, gained) values ('myspace', current_date, 1)$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.social_follower_days (source, day, gained) values ('instagram', current_date, -1)$q$, 'check constraint');
select pg_temp.act_as('maria@test');
do $$ begin
  assert (select count(*) from public.social_follower_days) = 2, 'admins read them';
  assert (select gained from public.social_follower_days where day = current_date - 1) = 41, 'what Instagram says now goes over it';
end $$;
select pg_temp.expect_error($q$insert into public.social_follower_days (source, day, gained) values ('instagram', current_date, 1)$q$, 'permission denied');
select pg_temp.act_as('julio@test');
do $$ begin assert (select count(*) from public.social_follower_days) = 0, 'not the team'; end $$;

-- Tidy up for the tests after.
reset role;
delete from public.sales_reps where instagram = 'nora.eats.mbl';
delete from public.social_follower_days;
delete from public.notifications where title like '%posted about the café%';
update public.profiles set can_see_pay = (select can_see_pay from maria_pay_posts) where email = 'maria@test';
