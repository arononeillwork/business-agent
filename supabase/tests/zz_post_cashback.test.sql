-- Cashback for posts about the café (the post_cashback and cashback_every_follower migrations): a rep's
-- post earns from its views, every new follower in its days and its likes, up to the most a post; worked
-- out nightly once its three days are in, however old the post, each post once, waiting for an owner's OK
-- (or not, as the café says).
-- People from the tests before it: maria (admin), julio (employee).

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

create temp table maria_pay_cashback as select can_see_pay from public.profiles where email = 'maria@test';
update public.profiles set can_see_pay = true where email = 'maria@test';

-- The café's rates to start: 50 cents per 1,000 views, 10 per new follower over the usual, 20 per 100 likes, up to €15.
do $$ begin
  assert (select cashback_on and cashback_per_1000_views = 0.5 and cashback_per_follower = 0.1 and cashback_per_100_likes = 0.2
            and cashback_max = 15 and cashback_needs_approval from public.rep_settings where id = 1), 'the rates to start';
end $$;
select pg_temp.expect_error($q$update public.rep_settings set cashback_max = 0 where id = 1$q$, 'check constraint');

-- Nora's reel five days ago: 14,200 views, 1,180 likes. Five new followers a day the week before; 36, 22 and 9 in its days.
select pg_temp.as_worker();
insert into public.sales_reps (name, kind, instagram, approved) values ('Nora', 'customer', 'nora.eats.mbl', true), ('Tomás', 'customer', 'tomas.runs', false);
insert into public.instagram_mentions (id, kind, username, permalink, mentioned_at, video, views, likes) values
  ('collab:DfNora0001', 'collab', 'nora.eats.mbl', 'https://www.instagram.com/reel/DfNora0001/', (now() at time zone 'UTC')::date - 5 + time '18:30', true, 14200, 1180),
  -- Two months ago: its days' followers aren't kept any more (Instagram has 30 days), so by its views and likes.
  ('collab:DfNora0003', 'collab', 'nora.eats.mbl', null, (now() at time zone 'UTC')::date - 60 + time '12:00', true, 3000, 200),
  -- Yesterday's: its days aren't in yet.
  ('collab:DfNora0002', 'collab', 'nora.eats.mbl', null, (now() at time zone 'UTC')::date - 1 + time '18:30', true, 900, 40),
  -- Tomás isn't a rep yet (waiting for an OK): nothing till he is.
  ('collab:DfTomas001', 'collab', 'tomas.runs', null, (now() at time zone 'UTC')::date - 6 + time '10:00', true, 2100, 214),
  -- Someone who isn't a rep at all.
  ('post:p1', 'post', 'someone.else', null, (now() at time zone 'UTC')::date - 6 + time '10:00', false, null, null);
insert into public.social_follower_days (source, day, gained)
select 'instagram', g::date, case (now() at time zone 'UTC')::date - g::date when 5 then 36 when 4 then 22 when 3 then 9 else 5 end
  from generate_series((now() at time zone 'UTC')::date - 12, (now() at time zone 'UTC')::date - 3, interval '1 day') g;

reset role;
select public.each_business('pay_post_cashback');
do $$ begin
  -- 7.10 for the views, 6.70 for its 67 new followers (36, 22 and 9), 2.36 for the likes: 16.16, so the most a post earns.
  assert (select count(*) from public.rep_rewards where source like 'cashback:%') = 2, 'Nora''s reels of five days and two months ago are due';
  assert (select amount = 15 and status = 'pending' and kind = 'earn' and label = 'Cashback for a post' and mention_id = 'collab:DfNora0001'
            and proof_url = 'https://www.instagram.com/reel/DfNora0001/' and note = '14,200 views · +67 new followers · 1,180 likes'
            and rep_id = (select id from public.sales_reps where instagram = 'nora.eats.mbl')
            from public.rep_rewards where source = 'cashback:collab:DfNora0001'), 'what it earned, waiting for an OK';
  -- 1.50 for 3,000 views and 0.40 for 200 likes.
  assert (select amount = 1.90 and note = '3,000 views · 200 likes' from public.rep_rewards where mention_id = 'collab:DfNora0003'), 'an old post, by its views and likes';
  assert exists (select 1 from public.notifications n join public.profiles p on p.id = n.profile_id
                  where p.email = 'maria@test' and n.title = 'Post cashback for Nora: €15.00 to approve'), 'the owners hear about it';
end $$;

-- Each post once; Tomás's once he's a rep; the most a post earns.
select public.each_business('pay_post_cashback');
update public.sales_reps set approved = true where instagram = 'tomas.runs';
update public.rep_settings set cashback_max = 1, cashback_needs_approval = false where id = 1;
select public.each_business('pay_post_cashback');
do $$ begin
  assert (select count(*) from public.rep_rewards where mention_id = 'collab:DfNora0001') = 1, 'each post once';
  assert (select amount = 1 and status = 'approved' from public.rep_rewards where mention_id = 'collab:DfTomas001'), 'up to the most, straight away when the café says';
  assert not exists (select 1 from public.rep_rewards where mention_id = 'post:p1'), 'not for someone who isn''t a rep';
  assert not exists (select 1 from public.rep_rewards where mention_id = 'collab:DfNora0002'), 'not before its days are in';
end $$;

-- Switched off: nothing more.
update public.rep_settings set cashback_on = false, cashback_max = 15, cashback_needs_approval = true where id = 1;
update public.instagram_mentions set mentioned_at = mentioned_at - interval '7 days' where id = 'collab:DfNora0002';
select public.each_business('pay_post_cashback');
do $$ begin assert not exists (select 1 from public.rep_rewards where mention_id = 'collab:DfNora0002'), 'off: nothing'; end $$;

-- The switch (the cashback_switch migration): only an admin turns it; the database keeps when it was off, and a
-- post made then never earns cashback, even once it's back on; one made before still does.
create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.headers', '{}', false);
  set role authenticated;
end $$;

do $$ declare p jsonb := (select cashback_paused from public.rep_settings where id = 1); begin
  assert jsonb_array_length(p) = 1 and (p->0->>'from')::timestamptz <= now() and p->0->'until' = 'null'::jsonb, 'off since it was switched off';
end $$;
select pg_temp.act_as('julio@test');
update public.rep_settings set cashback_on = true where id = 1;
select pg_temp.act_as('maria@test');
do $$ begin assert not (select cashback_on from public.rep_settings where id = 1), 'an employee doesn''t switch it'; end $$;
-- Its time off is the database's to keep: written to, it stays as it was.
update public.rep_settings set cashback_on = true, cashback_paused = '[]' where id = 1;
update public.rep_settings set cashback_paused = '[]', cashback_max = 15 where id = 1;
do $$ declare p jsonb := (select cashback_paused from public.rep_settings where id = 1); begin
  assert (select cashback_on from public.rep_settings where id = 1), 'an admin switches it back on';
  assert jsonb_array_length(p) = 1 and (p->0->>'until')::timestamptz >= (p->0->>'from')::timestamptz, 'back on: its time off ends';
end $$;
update public.rep_settings set cashback_on = false where id = 1;
update public.rep_settings set cashback_on = true where id = 1;
do $$ begin
  assert jsonb_array_length((select cashback_paused from public.rep_settings where id = 1)) = 2, 'each time off kept';
end $$;

-- As if it had been off from ten days ago to eight days ago: Nora's reel of nine days ago never earns, the one of
-- eleven days ago does (and the one of eight days ago, made once it was back on).
reset role;
alter table public.rep_settings disable trigger rep_settings_cashback_switch;
update public.rep_settings set cashback_paused = jsonb_build_array(jsonb_build_object(
  'from', ((now() at time zone 'UTC')::date - 10)::timestamp at time zone 'UTC', 'until', ((now() at time zone 'UTC')::date - 8)::timestamp at time zone 'UTC'))
 where id = 1;
alter table public.rep_settings enable trigger rep_settings_cashback_switch;
select pg_temp.as_worker();
insert into public.instagram_mentions (id, kind, username, permalink, mentioned_at, video, views, likes) values
  ('collab:DfNora0004', 'collab', 'nora.eats.mbl', null, (now() at time zone 'UTC')::date - 9 + time '12:00', true, 5000, 300),
  ('collab:DfNora0005', 'collab', 'nora.eats.mbl', null, (now() at time zone 'UTC')::date - 11 + time '12:00', true, 4000, 100);
reset role;
select public.each_business('pay_post_cashback');
do $$ begin
  assert not exists (select 1 from public.rep_rewards where mention_id = 'collab:DfNora0004'), 'made while it was off: never';
  assert exists (select 1 from public.rep_rewards where mention_id = 'collab:DfNora0005'), 'made before it was off: earns once it''s back on';
  assert exists (select 1 from public.rep_rewards where mention_id = 'collab:DfNora0002'), 'made after it was back on: earns';
end $$;

-- Tidy up for the tests after.
update public.rep_settings set cashback_on = true where id = 1;
alter table public.rep_settings disable trigger rep_settings_cashback_switch;
update public.rep_settings set cashback_paused = '[]';
alter table public.rep_settings enable trigger rep_settings_cashback_switch;
delete from public.rep_rewards where source like 'cashback:%';
delete from public.notifications where title like 'Post cashback for%';
delete from public.sales_reps where instagram in ('nora.eats.mbl', 'tomas.runs');
delete from public.instagram_mentions where id in ('collab:DfNora0001', 'collab:DfNora0002', 'collab:DfNora0003', 'collab:DfNora0004', 'collab:DfNora0005',
  'collab:DfTomas001', 'post:p1');
delete from public.social_follower_days;
update public.profiles set can_see_pay = (select can_see_pay from maria_pay_cashback) where email = 'maria@test';
