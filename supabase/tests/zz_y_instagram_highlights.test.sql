-- Instagram highlights: the circles kept here (Instagram lets no app read or change them). add_to_highlight()
-- makes one story on the Social planner for each photo or video, in order, linked to the highlight; once one
-- is up, the admins are told to add it in the Instagram app, and an admin marks it added. Admins only.
-- Its own people and rows, removed at the end.

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
  ('ci-hl-admin@test', '{"full_name": "Olga"}', now()),
  ('ci-hl-staff@test', '{"full_name": "Ana"}', now());
update public.profiles set role = 'admin', can_see_pay = false where email = 'ci-hl-admin@test';

-- 1. An admin puts two photos and a video into a new highlight, to post at ten: one story each, in order, a
--    second apart; the name is tidied and the first photo is the circle's picture.
select pg_temp.act_as('ci-hl-admin@test');
do $$
declare
  v_id uuid;
  v_again uuid;
begin
  v_id := public.add_to_highlight(null, '  Reviews   ⭐ ', '[{"url": "https://app.test/media/a.mp4", "type": "video"},
    {"url": "https://app.test/media/b.jpg", "type": "image"}, {"url": "https://app.test/media/c.jpg", "type": "image"}]', '2030-01-07 10:00+00', true);
  assert (select name from public.instagram_highlights where id = v_id) = 'Reviews ⭐', 'the name tidied';
  assert (select cover_url from public.instagram_highlights where id = v_id) = 'https://app.test/media/b.jpg', 'the first photo is the picture';
  assert (select array_agg(p.media->0->>'url' order by p.scheduled_at) from public.highlight_stories s join public.social_posts p on p.id = s.post_id
           where s.highlight_id = v_id) = array['https://app.test/media/a.mp4', 'https://app.test/media/b.jpg', 'https://app.test/media/c.jpg'], 'one story each, in order';
  assert (select array_agg(p.scheduled_at order by p.scheduled_at) from public.highlight_stories s join public.social_posts p on p.id = s.post_id
           where s.highlight_id = v_id) = array['2030-01-07 10:00:00+00', '2030-01-07 10:00:01+00', '2030-01-07 10:00:02+00']::timestamptz[], 'a second apart';
  assert (select bool_and(p.kind = 'story' and p.targets = array['instagram'] and p.status = 'scheduled' and p.auto and p.caption = '' and s.added_at is null)
            from public.highlight_stories s join public.social_posts p on p.id = s.post_id where s.highlight_id = v_id), 'Instagram stories, posting themselves';
  -- More into the same one, as a reminder to post it yourself; its picture stays.
  v_again := public.add_to_highlight(v_id, null, '[{"url": "https://app.test/media/d.jpg", "type": "image"}]', '2030-01-08 10:00+00', false);
  assert v_again = v_id, 'the same highlight';
  assert (select count(*) from public.highlight_stories where highlight_id = v_id) = 4, 'four stories in it';
  assert (select not p.auto from public.highlight_stories s join public.social_posts p on p.id = s.post_id
           where s.highlight_id = v_id and p.media->0->>'url' = 'https://app.test/media/d.jpg'), 'a reminder';
  assert (select cover_url from public.instagram_highlights where id = v_id) = 'https://app.test/media/b.jpg', 'its picture stays';
  -- A highlight of videos only has no picture.
  v_again := public.add_to_highlight(null, 'Doggos', '[{"url": "https://app.test/media/e.mp4", "type": "video"}]', '2030-01-07 12:00+00', true);
  assert (select cover_url from public.instagram_highlights where id = v_again) is null, 'no photo, no picture';
end $$;

-- Each name once (whatever the capitals), something to post, a time, a highlight that's still here.
select pg_temp.expect_error($q$select public.add_to_highlight(null, 'reviews ⭐', '[{"url": "https://app.test/x.jpg", "type": "image"}]', now(), true)$q$, 'a highlight called reviews');
select pg_temp.expect_error($q$select public.add_to_highlight(null, 'Menu', '[]', now(), true)$q$, 'Choose the photos and videos');
select pg_temp.expect_error($q$select public.add_to_highlight(null, 'Menu', '[{"url": "https://app.test/x.jpg", "type": "image"}]', null, true)$q$, 'Pick when to post');
select pg_temp.expect_error($q$select public.add_to_highlight(gen_random_uuid(), null, '[{"url": "https://app.test/x.jpg", "type": "image"}]', now(), true)$q$, 'any more');
select pg_temp.expect_error($q$select public.add_to_highlight(null, ' ', '[{"url": "https://app.test/x.jpg", "type": "image"}]', now(), true)$q$, 'instagram_highlights_name_check');
-- The stories follow the Social planner's rules (a web address for each).
select pg_temp.expect_error($q$select public.add_to_highlight(null, 'Menu', '[{"url": "blob:x", "type": "image"}]', now(), true)$q$, 'web address');
-- Only an Instagram story goes into a highlight.
select pg_temp.expect_error($q$
  with p as (insert into public.social_posts (kind, caption, targets, status) values ('post', 'Hello', array['facebook'], 'draft') returning id)
  insert into public.highlight_stories (highlight_id, post_id) select (select id from public.instagram_highlights where name = 'Doggos'), id from p$q$,
  'Only an Instagram story');
-- Not added before it's up; a story stays in its highlight.
select pg_temp.expect_error($q$update public.highlight_stories set added_at = now()$q$, 'once the story is up');
select pg_temp.expect_error($q$update public.highlight_stories set highlight_id = (select id from public.instagram_highlights where name = 'Doggos')$q$, 'permission denied');
select pg_temp.expect_error($q$update public.instagram_highlights set created_by = null$q$, 'permission denied');

-- 2. The stories go up (the Worker writes the outcome): the admins are told to add them to the highlight in
--    the Instagram app, once while they haven't read it; one that didn't go up says nothing.
reset role; select set_config('request.jwt.claim.sub', '', false);
update public.social_posts p set status = 'published', published_at = now(), results = '{"instagram": {"status": "published", "id": "m1"}}'
  from public.highlight_stories s where s.post_id = p.id and p.media->0->>'url' in ('https://app.test/media/a.mp4', 'https://app.test/media/b.jpg');
update public.social_posts p set status = 'failed', results = '{"instagram": {"status": "failed", "error": "Instagram said no"}}'
  from public.highlight_stories s where s.post_id = p.id and p.media->0->>'url' = 'https://app.test/media/c.jpg';
-- Later writes to one that's up (its likes) don't tell anyone again.
update public.social_posts p set results = results || '{"facebook": {"status": "published"}}'
  from public.highlight_stories s where s.post_id = p.id and p.media->0->>'url' = 'https://app.test/media/a.mp4';
-- The reminder's time comes.
update public.social_posts p set status = 'due' from public.highlight_stories s where s.post_id = p.id and p.media->0->>'url' = 'https://app.test/media/d.jpg';
do $$
declare v_admin uuid := (select id from public.profiles where email = 'ci-hl-admin@test');
begin
  assert (select count(*) from public.notifications where profile_id = v_admin and title = 'Add your story to Reviews ⭐' and link = '/content') = 1,
    'told once for the two that went up together';
  assert (select body from public.notifications where profile_id = v_admin and title = 'Add your story to Reviews ⭐' limit 1)
    like '%open the story, tap Highlight and choose Reviews ⭐%', 'how to do it';
  assert (select count(*) from public.notifications n join public.profiles p on p.id = n.profile_id
           where p.email = 'ci-hl-staff@test' and n.title like 'Add your story%') = 0, 'not the employee';
  update public.notifications set read_at = now() where profile_id = v_admin;
end $$;

-- 3. The admin posts the reminder in Instagram and marks it posted: told to add it too. Then marks two added.
select pg_temp.act_as('ci-hl-admin@test');
update public.social_posts p set status = 'published' from public.highlight_stories s where s.post_id = p.id and p.media->0->>'url' = 'https://app.test/media/d.jpg';
do $$
declare v public.highlight_stories;
begin
  assert (select count(*) from public.notifications where profile_id = auth.uid() and title = 'Add your story to Reviews ⭐') = 2, 'the reminder too, once the first was read';
  update public.highlight_stories s set added_at = '2000-01-01' from public.social_posts p
   where p.id = s.post_id and p.media->0->>'url' = 'https://app.test/media/b.jpg' returning s.* into v;
  assert v.added_at > now() - interval '1 minute', 'marked added, now';
  update public.highlight_stories s set added_at = now() from public.social_posts p
   where p.id = s.post_id and p.media->0->>'url' = 'https://app.test/media/d.jpg';
  -- Not added after all.
  update public.highlight_stories set added_at = null where id = v.id;
  assert (select added_at from public.highlight_stories where id = v.id) is null, 'unmarked';
  -- Renamed; the picture changed.
  update public.instagram_highlights set name = ' Reviews  ★ ', cover_url = 'https://app.test/media/c.jpg' where name = 'Reviews ⭐';
  assert (select count(*) from public.instagram_highlights where name = 'Reviews ★' and cover_url = 'https://app.test/media/c.jpg') = 1, 'renamed';
end $$;
select pg_temp.expect_error($q$update public.highlight_stories s set added_at = now() from public.social_posts p
  where p.id = s.post_id and p.media->0->>'url' = 'https://app.test/media/c.jpg'$q$, 'once the story is up');
select pg_temp.expect_error($q$update public.instagram_highlights set name = 'doggos' where name = 'Reviews ★'$q$, 'a highlight called doggos');

-- 4. Someone who isn't an admin sees none and adds none.
select pg_temp.act_as('ci-hl-staff@test');
do $$ begin
  assert (select count(*) from public.instagram_highlights) = 0, 'an employee sees no highlights';
  assert (select count(*) from public.highlight_stories) = 0, 'nor their stories';
end $$;
select pg_temp.expect_error($q$select public.add_to_highlight(null, 'Mine', '[{"url": "https://app.test/x.jpg", "type": "image"}]', now(), true)$q$, 'Only an admin');
select pg_temp.expect_error($q$insert into public.instagram_highlights (name) values ('Mine')$q$, 'row-level security');

-- 5. A story deleted from the Social planner leaves its highlight; a highlight deleted leaves its stories on the planner.
select pg_temp.act_as('ci-hl-admin@test');
do $$
declare v_posts uuid[];
begin
  delete from public.social_posts p using public.highlight_stories s where s.post_id = p.id and p.status = 'failed';
  assert (select count(*) from public.highlight_stories s join public.instagram_highlights h on h.id = s.highlight_id where h.name = 'Reviews ★') = 3, 'out of the highlight';
  select array_agg(post_id) into v_posts from public.highlight_stories;
  delete from public.instagram_highlights;
  assert (select count(*) from public.highlight_stories) = 0, 'the links go with it';
  assert (select count(*) from public.social_posts where id = any(v_posts)) = cardinality(v_posts), 'the stories stay on the planner';
  delete from public.social_posts where id = any(v_posts);
end $$;

-- Tidy up.
reset role; select set_config('request.jwt.claim.sub', '', false);
delete from public.social_posts where kind = 'post' and caption = 'Hello' and targets = array['facebook'];
delete from public.notifications where profile_id in (select id from public.profiles where email like 'ci-hl-%@test');
delete from auth.users where email like 'ci-hl-%@test';
