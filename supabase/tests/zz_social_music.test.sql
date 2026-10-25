-- Music on social posts (migration 85): the library, AI tracks paid per use (free ones first, the
-- spending limit, nothing charged when it fails), music on posts and reminders. Reuses
-- time_tracking.test.sql's people: maria (admin), julio (employee). Starts as the founding account.

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
delete from public.outbox where payload ? 'post_id';
delete from public.social_posts;
delete from public.notifications;

-- 1. The library: uploads need the tick; AI and starter tracks come from the Worker -------------
select pg_temp.act_as('maria@test');
select pg_temp.expect_error($q$insert into public.music_tracks (source, title, url, duration_s) values ('upload', 'Our jingle', 'https://x.test/j.mp3', 20)$q$,
  'right to use this music');
insert into public.music_tracks (source, title, url, duration_s, moods, licence)
  values ('upload', 'Our jingle', 'https://x.test/j.mp3', 20, '{upbeat}', '{"confirmed": true}');
select pg_temp.expect_error($q$insert into public.music_tracks (source, title, url, duration_s, licence) values ('ai', 'Free one', 'https://x.test/f.mp3', 30, '{"confirmed": true}')$q$,
  'Create with AI');
select pg_temp.expect_error($q$update public.music_tracks set url = 'https://x.test/other.mp3' where title = 'Our jingle'$q$, 'Only a track''s name');
update public.music_tracks set title = 'The jingle', saved = true, moods = '{upbeat,bright}' where title = 'Our jingle';
do $$ begin
  assert (select licence->>'kind' = 'upload' and licence->>'confirmed_by' = auth.uid()::text and saved from public.music_tracks where title = 'The jingle'), 'tick kept with who and when';
end $$;
select pg_temp.act_as('julio@test');
do $$ begin
  assert not exists (select 1 from public.music_tracks), 'staff don''t see the library';
  assert not exists (select 1 from public.music_generations), 'nor the AI uses';
end $$;
select pg_temp.expect_error($q$insert into public.music_tracks (source, title, url, duration_s, licence) values ('upload', 'x', 'https://x.test/x.mp3', 5, '{"confirmed": true}')$q$, 'row-level security');
select pg_temp.expect_error($q$select public.ai_music_start('Chill acoustic morning', 30)$q$, 'Only an admin');
reset role;
insert into public.music_tracks (source, title, url, duration_s, licence, starter_key)
  values ('starter', 'Sunday Morning', 'https://x.test/s1.mp3', 30, '{"kind": "starter", "provider": "elevenlabs"}', 'sunday-morning');

-- 2. The founding account (top plan, no Stripe bill): one free AI track a month -----------------
select pg_temp.act_as('maria@test');
do $$
declare q jsonb; s jsonb;
begin
  q := public.ai_music_quote(30);
  assert (q->>'allowed')::boolean and (q->>'free')::int = 1 and (q->>'price_cents')::int = 0 and q->>'reason' is null, 'first one free: ' || q;
  assert (public.ai_music_quote(90)->>'uses')::int = 2, 'one use per started minute';
  s := public.ai_music_start('Warm acoustic morning in a café', 32);
  assert (s->>'free')::int = 1 and (s->>'price_cents')::int = 0 and s->>'id' is not null, 'reserved, free';
  q := public.ai_music_quote(30);
  assert (q->>'free_left')::int = 0 and (q->>'price_cents')::int = 99, 'the next one would cost 99 cents';
  assert q->>'reason' like 'This month''s free AI track is used%', 'and there is no bill to add it to: ' || (q->>'reason');
end $$;
select pg_temp.expect_error($q$select public.ai_music_start('Another one', 30)$q$, 'free AI track is used');
-- ElevenLabs failed: the free one comes back.
reset role;
select public.ai_music_finish((select id from public.music_generations order by created_at desc limit 1), 'failed', '{}', 'music_v1', 'ElevenLabs is busy');
do $$ begin
  assert (select free = 0 and price_cents = 0 and status = 'failed' and finished_at is not null from public.music_generations order by created_at desc limit 1), 'nothing taken';
  assert (public.ai_music_quote(30)->>'free_left')::int = 1, 'the free one is back';
end $$;
-- Extra free tracks we give by hand.
select public.grant_ai_music(2);
do $$ begin assert (public.ai_music_quote(30)->>'free_left')::int = 3, 'given two more'; end $$;
select public.grant_ai_music(0);
-- A use that never finished stops counting after a quarter of an hour, and is closed on the next start.
insert into public.music_generations (prompt, seconds, uses, free, created_at) values ('Stuck', 30, 1, 1, now() - interval '20 minutes');
do $$ begin assert (public.ai_music_quote(30)->>'free_left')::int = 1, 'a stuck one doesn''t hold the free track'; end $$;

-- 3. A paid plan: charged per use on the monthly bill, within the spending limit -------------------
reset role;
select public.end_complimentary();
update public.billing set plan = 'pro', status = 'active', stripe_customer_id = 'cus_test', stripe_subscription_id = 'sub_test';
select pg_temp.act_as('maria@test');
do $$
declare q jsonb; s jsonb;
begin
  q := public.ai_music_quote(30);
  assert (q->>'allowed')::boolean and (q->>'included')::int = 0 and (q->>'free')::int = 0 and (q->>'price_cents')::int = 99 and q->>'reason' is null, 'Pro pays 99 cents: ' || q;
  assert (public.ai_music_quote(150)->>'price_cents')::int = 297, 'a 2½-minute track is three uses';
  perform public.set_ai_music_limit(150);
  s := public.ai_music_start('Latin house on the terrace', 30);
  assert (s->>'price_cents')::int = 99 and (select status from public.music_generations where id = (s->>'id')::uuid) = 'working', 'reserved';
  assert (select count(*) from public.music_generations where prompt = 'Stuck' and status = 'failed') = 1, 'the stuck one was closed';
  q := public.ai_music_quote(30);
  assert (q->>'spent_cents')::int = 99 and q->>'reason' like '%over this month''s limit of €1.50%', 'the limit holds: ' || (q->>'reason');
end $$;
select pg_temp.expect_error($q$select public.ai_music_start('One more', 30)$q$, 'limit of €1.50');
select pg_temp.expect_error($q$select public.set_ai_music_limit(-1)$q$, 'between €0 and €1,000');
select pg_temp.expect_error($q$select public.ai_music_finish((select id from public.music_generations limit 1), 'done')$q$, 'permission denied');
select pg_temp.expect_error($q$update public.music_generations set price_cents = 0$q$, 'permission denied');
-- Made: two versions, one kept; then charged once on Stripe.
reset role;
insert into public.music_tracks (source, title, url, duration_s, licence) values
  ('ai', 'Terrace I', 'https://x.test/t1.mp3', 32, '{"kind": "ai"}'), ('ai', 'Terrace II', 'https://x.test/t2.mp3', 32, '{"kind": "ai"}');
select public.ai_music_finish((select id from public.music_generations where prompt = 'Latin house on the terrace'), 'done',
  array(select id from public.music_tracks where title like 'Terrace%' order by title), 'music_v1', null);
select public.ai_music_charged((select id from public.music_generations where prompt = 'Latin house on the terrace'), 'ii_test');
select public.ai_music_charged((select id from public.music_generations where prompt = 'Latin house on the terrace'), 'ii_again');
select pg_temp.act_as('maria@test');
select public.ai_music_keep((select id from public.music_generations where prompt = 'Latin house on the terrace'), (select id from public.music_tracks where title = 'Terrace II'));
select pg_temp.expect_error($q$select public.ai_music_keep((select id from public.music_generations where prompt = 'Latin house on the terrace'), (select id from public.music_tracks where title = 'The jingle'))$q$, 'isn''t from this one');
do $$ begin
  assert (select stripe_invoice_item = 'ii_test' and charged_at is not null and price_cents = 99 from public.music_generations where prompt = 'Latin house on the terrace'), 'charged once';
  assert (select hidden from public.music_tracks where title = 'Terrace I') and (select saved and not hidden from public.music_tracks where title = 'Terrace II'), 'the kept one stays';
end $$;
-- Business includes one a month; Free and a failed renewal can't make any.
reset role;
update public.billing set plan = 'business';
do $$ begin assert (public.ai_music_quote(30)->>'free')::int = 1, 'Business: one free a month'; end $$;
update public.billing set plan = 'free', status = 'none';
do $$ begin assert not (public.ai_music_quote(30)->>'allowed')::boolean and public.ai_music_quote(30)->>'reason' like '%need a paid plan%', 'Free can''t'; end $$;
update public.billing set plan = 'pro', status = 'past_due';
do $$ begin assert public.ai_music_quote(30)->>'reason' like '%need a paid plan%', 'nor a plan that isn''t paid up'; end $$;

-- 4. Music on posts --------------------------------------------------------------------------------
update public.billing set status = 'active';
select pg_temp.act_as('maria@test');
select pg_temp.expect_error($q$insert into public.social_posts (kind, caption, targets, media, music) values ('post', 'x', '{instagram}',
  '[{"url": "https://x.test/a.jpg", "type": "image"}]', '{"mode": "mixed", "url": "https://x.test/s1.mp3"}')$q$, 'Music goes into stories and reels');
select pg_temp.expect_error($q$insert into public.social_posts (kind, targets, media, music) values ('story', '{instagram}',
  '[{"url": "https://x.test/a.jpg", "type": "image"}]', '{"mode": "radio"}')$q$, 'Unknown kind of music');
select pg_temp.expect_error($q$insert into public.social_posts (kind, targets, media, music) values ('story', '{instagram}',
  '[{"url": "https://x.test/a.jpg", "type": "image"}]', '{"mode": "in_instagram", "song": " "}')$q$, 'Write the song');
-- A draft may still be the photo; scheduled, it must be the file with the music in.
insert into public.social_posts (kind, caption, targets, media, music) values ('story', 'Sunday', '{instagram}',
  '[{"url": "https://x.test/sun.jpg", "type": "image"}]', '{"mode": "mixed", "url": "https://x.test/s1.mp3", "start": 4, "seconds": 15}');
select pg_temp.expect_error($q$update public.social_posts set status = 'scheduled', scheduled_at = now() where caption = 'Sunday'$q$, 'isn''t in the file yet');
update public.social_posts set status = 'scheduled', scheduled_at = now() - interval '1 minute',
  media = '[{"url": "https://x.test/sun-music.mp4", "type": "video"}]',
  music = music || '{"rendered_url": "https://x.test/sun-music.mp4", "source_media": [{"url": "https://x.test/sun.jpg", "type": "image"}]}'
 where caption = 'Sunday';
-- A reel with music carries its sound's name to Instagram.
insert into public.social_posts (kind, caption, targets, media, music, status, scheduled_at) values ('reel', 'Latte art', '{instagram}',
  '[{"url": "https://x.test/art-music.mp4", "type": "video"}]',
  '{"mode": "mixed", "url": "https://x.test/s1.mp3", "rendered_url": "https://x.test/art-music.mp4", "audio_name": "Easy Beans · Sunday Morning"}',
  'scheduled', now() - interval '1 minute');
-- Instagram's own songs: only on reminders, and the reminder says which song, from where.
select pg_temp.expect_error($q$insert into public.social_posts (kind, caption, targets, media, music, status, scheduled_at) values ('carousel', 'Brunch', '{instagram}',
  '[{"url": "https://x.test/a.jpg", "type": "image"}, {"url": "https://x.test/b.jpg", "type": "image"}]',
  '{"mode": "in_instagram", "song": "Bailando", "start": 45}', 'scheduled', now())$q$, 'choose Remind me');
insert into public.social_posts (kind, caption, targets, media, music, status, scheduled_at, auto) values ('carousel', 'Brunch', '{instagram}',
  '[{"url": "https://x.test/a.jpg", "type": "image"}, {"url": "https://x.test/b.jpg", "type": "image"}]',
  '{"mode": "in_instagram", "song": "Bailando", "start": 45}', 'scheduled', now() - interval '1 minute', false);
reset role;
do $$ begin
  assert public.queue_due_social_posts() = 2, 'the story and the reel go out';
  assert (select payload->>'audio_name' from public.outbox where payload->>'caption' = 'Latte art') = 'Easy Beans · Sunday Morning', 'sound named';
  assert not (select payload ? 'audio_name' from public.outbox where payload->>'caption' = 'Sunday'), 'stories have no sound name';
  assert (select payload->'media'->0->>'url' from public.outbox where payload->>'caption' = 'Sunday') = 'https://x.test/sun-music.mp4', 'the file with the music goes out';
  assert exists (select 1 from public.notifications where title = 'Time to post your carousel on Instagram' and body = E'♫ Bailando from 0:45\nBrunch'), 'the reminder names the song';
end $$;

-- 5. The brand's sound -----------------------------------------------------------------------------
select pg_temp.act_as('maria@test');
update public.brand set sound_moods = '{acoustic,chill}', sound_avoid = '{heavy}';
select pg_temp.expect_error($q$update public.brand set sound_moods = '{a,b,c,d,e,f}'$q$, 'check');
select pg_temp.act_as('julio@test');
do $$ begin
  assert (select sound_moods = '{acoustic,chill}' from public.brand), 'the team can read the sound';
  assert (select count(*) from public.pay_per_use) = 1, 'prices are readable';
end $$;

-- Back as it was, for the tests after this one.
reset role;
select set_config('request.jwt.claim.sub', '', false);
delete from public.outbox where payload ? 'post_id';
delete from public.social_posts;
delete from public.notifications;
delete from public.music_generations;
delete from public.music_tracks;
update public.billing set stripe_customer_id = null, stripe_subscription_id = null, ai_music_limit_cents = 2500, ai_music_extra_free = 0;
select public.grant_complimentary('founder', 'Test café');
