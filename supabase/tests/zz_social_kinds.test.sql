-- Social planner kinds (post, carousel, reel, story), photos and videos, and reminders you post
-- yourself. Reuses time_tracking.test.sql's people: maria (admin), julio (employee).

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

reset role;
delete from public.social_posts;
delete from public.notifications;

-- 1. What each kind holds, and where it can go -------------------------------------------------
select pg_temp.act_as('maria@test');
select pg_temp.expect_error($q$insert into public.social_posts (kind, caption, targets, media) values ('post', 'x', '{instagram}',
  '[{"url": "https://x.test/a.mp4", "type": "video"}]')$q$, 'choose Reel');
select pg_temp.expect_error($q$insert into public.social_posts (kind, caption, targets, media) values ('post', 'x', '{instagram}',
  '[{"url": "https://x.test/a.jpg", "type": "image"}, {"url": "https://x.test/b.jpg", "type": "image"}]')$q$, 'Choose Carousel');
select pg_temp.expect_error($q$insert into public.social_posts (kind, caption, targets, media) values ('reel', 'x', '{instagram}',
  '[{"url": "https://x.test/a.jpg", "type": "image"}]')$q$, 'one video');
select pg_temp.expect_error($q$insert into public.social_posts (kind, caption, targets) values ('story', 'x', '{facebook}')$q$, 'Stories go to Instagram only');
select pg_temp.expect_error($q$insert into public.social_posts (kind, caption, targets, media) values ('carousel', 'x', '{instagram}',
  '[{"url": "http://x.test/a.jpg", "type": "image"}]')$q$, 'web address');
select pg_temp.expect_error($q$insert into public.social_posts (kind, caption, targets, media) values ('carousel', 'x', '{instagram}',
  '[{"url": "https://x.test/a.gif", "type": "gif"}]')$q$, 'web address');
select pg_temp.expect_error($q$insert into public.social_posts (kind, caption, targets, media, status, scheduled_at) values ('carousel', 'x', '{instagram}',
  '[{"url": "https://x.test/a.jpg", "type": "image"}]', 'scheduled', now())$q$, 'at least 2');
select pg_temp.expect_error($q$insert into public.social_posts (kind, caption, targets, status, scheduled_at) values ('reel', 'Watch this', '{instagram}', 'scheduled', now())$q$, 'reel''s video');
select pg_temp.expect_error($q$insert into public.social_posts (kind, targets, status, scheduled_at) values ('story', '{instagram}', 'scheduled', now())$q$, 'story''s photo or video');
select pg_temp.expect_error($q$insert into public.social_posts (kind, targets, status, scheduled_at, auto) values ('story', '{instagram}', 'scheduled', now(), false)$q$, 'photo or video for the story');

-- A carousel of a photo and a video: the cover is the first, kept in image_url too.
insert into public.social_posts (kind, caption, targets, media, status, scheduled_at)
  values ('carousel', 'Behind the bar', '{instagram}',
          '[{"url": "https://x.test/pour.jpg", "type": "image"}, {"url": "https://x.test/steam.mp4", "type": "video"}]', 'scheduled', now() - interval '1 minute');
-- A reel, a story, and a story that's only a reminder (no video yet: you'll add it in the app).
insert into public.social_posts (kind, caption, targets, media, status, scheduled_at)
  values ('reel', 'Latte art, slowly', '{instagram}', '[{"url": "https://x.test/art.mp4", "type": "video"}]', 'scheduled', now() - interval '1 minute');
insert into public.social_posts (kind, targets, media, status, scheduled_at)
  values ('story', '{instagram}', '[{"url": "https://x.test/today.jpg", "type": "image"}]', 'scheduled', now() - interval '1 minute');
insert into public.social_posts (kind, caption, targets, status, scheduled_at, auto)
  values ('story', 'Poll: oat or almond?', '{instagram}', 'scheduled', now() - interval '1 minute', false);
-- The old way (image_url only) still works and becomes the media.
insert into public.social_posts (caption, image_url, targets) values ('Old app', 'https://x.test/old.jpg', '{instagram}');
do $$ begin
  assert (select image_url from public.social_posts where caption = 'Behind the bar') = 'https://x.test/pour.jpg', 'cover kept in image_url';
  assert (select media from public.social_posts where caption = 'Old app') = '[{"url": "https://x.test/old.jpg", "type": "image"}]'::jsonb, 'photo becomes media';
end $$;
-- Removing the photo removes it (image_url follows the media).
update public.social_posts set media = '[]' where caption = 'Old app';
do $$ begin
  assert (select image_url is null and media = '[]'::jsonb from public.social_posts where caption = 'Old app'), 'photo removed';
end $$;

-- 2. When they're due: posts go out with every photo and video; reminders tell the admins -------
reset role;
do $$
declare v_n int;
begin
  v_n := public.queue_due_social_posts();
  assert v_n = 3, 'carousel, reel and story are sent (one Instagram job each), got ' || v_n;
  assert (select payload->>'kind' from public.outbox where payload->>'post_id' = (select id::text from public.social_posts where caption = 'Behind the bar')) = 'carousel', 'kind sent';
  assert (select jsonb_array_length(payload->'media') from public.outbox where payload->>'post_id' = (select id::text from public.social_posts where caption = 'Behind the bar')) = 2, 'every photo and video sent';
  assert (select status from public.social_posts where caption = 'Poll: oat or almond?') = 'due', 'the reminder is due';
  assert not exists (select 1 from public.outbox where payload->>'post_id' = (select id::text from public.social_posts where caption = 'Poll: oat or almond?')), 'a reminder is never sent by itself';
  assert (select count(*) from public.notifications n join public.profiles p on p.id = n.profile_id
           where n.title = 'Time to post your story on Instagram' and n.body = 'Poll: oat or almond?' and n.link = '/social' and p.role = 'admin') >= 1, 'admins reminded';
  assert not exists (select 1 from public.notifications n join public.profiles p on p.id = n.profile_id where p.role <> 'admin'), 'only admins';
  assert public.queue_due_social_posts() = 0, 'nothing twice';
  assert (select count(*) from public.notifications where title like 'Time to post%') = (select count(*) from public.profiles where role = 'admin' and active), 'reminded once';
end $$;

-- 3. Posted by hand: marked posted, by hand; nothing else can be set from the app ---------------
select pg_temp.act_as('maria@test');
select pg_temp.expect_error($q$update public.social_posts set status = 'published' where caption = 'Behind the bar'$q$, 'already gone out');
update public.social_posts set status = 'published' where caption = 'Poll: oat or almond?';
do $$ begin
  assert (select published_at is not null and results->'instagram'->>'manual' = 'true' and results->'instagram'->>'status' = 'published'
            from public.social_posts where caption = 'Poll: oat or almond?'), 'posted by hand, when';
end $$;
select pg_temp.expect_error($q$update public.social_posts set caption = 'again' where caption = 'Poll: oat or almond?'$q$, 'already gone out');
select pg_temp.expect_error($q$insert into public.social_posts (caption, targets, status) values ('x', '{facebook}', 'due')$q$, 'draft or schedule');

reset role;
delete from public.outbox where payload ? 'post_id';
delete from public.social_posts;
delete from public.notifications;
