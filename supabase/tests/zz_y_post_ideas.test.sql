-- Post ideas (Social planner → Ideas): Easy Beans starts with the owner's coffees idea; the whole team
-- reads and adds ideas, says they'll make one, adds the photos or video and hands it in (the admins hear);
-- only admins make the post from one, mark one done, give one to someone (who hears) or change and delete
-- someone else's. The café tablet sees none. Its own people and rows, removed at the end.

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
  ('pi-owner@test', '{"full_name": "Olga"}', now()),
  ('pi-ana@test', '{"full_name": "Ana"}', now()),
  ('pi-ben@test', '{"full_name": "Ben"}', now()),
  ('pi-tablet@test', '{"full_name": "Tablet"}', now());
update public.profiles set role = 'admin' where email = 'pi-owner@test';
update public.profiles set role = 'employee' where email in ('pi-ana@test', 'pi-ben@test');
update public.profiles set role = 'kiosk' where email = 'pi-tablet@test';
create temp table pi_people as select email, id from public.profiles where email like 'pi-%@test';
grant select on pi_people to authenticated;

-- 1. Easy Beans' first idea: the coffees in use now, up for grabs, photos or a video.
select pg_temp.act_as('pi-ana@test');
do $$ begin
  assert (select status = 'open' and wants = 'either' and taken_by is null and media = '[]'::jsonb and details ~ 'Puchero, Cocobrew and Santa Roaster'
            from public.post_ideas where title = 'The coffees we have now'), 'the coffees idea, up for grabs';
end $$;

-- 2. An employee adds one (tidied, theirs), and can't make it done or a post.
insert into public.post_ideas (title, details, wants) values ('  Latte art close-up  ', '  Slow motion pour  ', 'video');
do $$ begin
  assert (select title = 'Latte art close-up' and details = 'Slow motion pour' and created_by = (select id from pi_people where email = 'pi-ana@test')
            from public.post_ideas where title = 'Latte art close-up'), 'tidied, and hers';
end $$;
select pg_temp.expect_error($q$insert into public.post_ideas (title) values ('   ')$q$, 'post_ideas_title_check');
select pg_temp.expect_error($q$insert into public.post_ideas (title, wants) values ('Croissants', 'gif')$q$, 'post_ideas_wants_check');
select pg_temp.expect_error($q$insert into public.post_ideas (title, status) values ('Croissants', 'done')$q$, 'Only an admin marks an idea done');
select pg_temp.expect_error($q$insert into public.post_ideas (title, media) values ('Croissants', '[{"url": "http://x.test/a.jpg", "type": "image"}]')$q$, 'Add photos or videos');
select pg_temp.expect_error($q$insert into public.post_ideas (title, media) values ('Croissants', '[{"url": "https://x.test/a.gif", "type": "gif"}]')$q$, 'Add photos or videos');
-- Handed in with nothing in it: no.
select pg_temp.expect_error($q$update public.post_ideas set status = 'ready' where title = 'The coffees we have now'$q$, 'post_ideas_ready');

-- 3. She says she'll make the coffees one; Ben can't take it over or give it away, nor change her idea.
update public.post_ideas set taken_by = auth.uid(), status = 'doing' where title = 'The coffees we have now';
select pg_temp.act_as('pi-ben@test');
select pg_temp.expect_error($q$update public.post_ideas set taken_by = auth.uid() where title = 'The coffees we have now'$q$, 'Someone else is making this one');
select pg_temp.expect_error($q$update public.post_ideas set taken_by = null where title = 'The coffees we have now'$q$, 'Someone else is making this one');
select pg_temp.expect_error($q$update public.post_ideas set taken_by = (select id from pi_people where email = 'pi-ana@test') where title = 'Latte art close-up'$q$, 'Someone else is making this one');
select pg_temp.expect_error($q$update public.post_ideas set title = 'Mine now' where title = 'Latte art close-up'$q$, 'Only an admin or whoever added it changes the idea');
select pg_temp.expect_error($q$delete from public.post_ideas where title = 'Latte art close-up'$q$, 'Only an admin deletes an idea');
-- Nor make it a post.
select pg_temp.expect_error($q$update public.post_ideas set post_id = gen_random_uuid() where title = 'Latte art close-up'$q$, 'Only an admin makes the post');

-- 4. Ana adds her photo and video and hands it in: the owner hears (and Ana doesn't).
select pg_temp.act_as('pi-ana@test');
update public.post_ideas set media = '[{"url": "https://app.test/media/a.jpg", "type": "image"}, {"url": "https://app.test/media/b.mp4", "type": "video"}]', status = 'ready'
 where title = 'The coffees we have now';
-- Done is the admins' word.
select pg_temp.expect_error($q$update public.post_ideas set status = 'done' where title = 'The coffees we have now'$q$, 'Only an admin marks an idea done');
reset role; select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  assert (select title = 'Ready to post: The coffees we have now' and body = 'Ana added 2 photos and videos. Make the post on the Social planner.' and link = '/social'
            from public.notifications where profile_id = (select id from pi_people where email = 'pi-owner@test') and data ? 'post_idea'), 'the owner hears';
  assert not exists (select 1 from public.notifications n join pi_people p on p.id = n.profile_id where p.email = 'pi-ana@test'), 'not Ana';
end $$;

-- 5. The owner makes the post from it: it's done, and keeps the post. Ana can't change it now.
select pg_temp.act_as('pi-owner@test');
insert into public.social_posts (caption, targets, status) values ('Our coffees this week', '{instagram}', 'draft');
update public.post_ideas set post_id = (select id from public.social_posts where caption = 'Our coffees this week') where title = 'The coffees we have now';
do $$ begin
  assert (select status = 'done' and post_id is not null from public.post_ideas where title = 'The coffees we have now'), 'done, with its post';
end $$;
select pg_temp.expect_error($q$update public.post_ideas set post_id = gen_random_uuid() where title = 'Latte art close-up'$q$, 'That post isn’t on the planner');
select pg_temp.act_as('pi-ana@test');
select pg_temp.expect_error($q$update public.post_ideas set status = 'ready' where title = 'The coffees we have now'$q$, 'This one’s done');
-- The post deleted: the idea stays done (it may have gone out), without the post.
select pg_temp.act_as('pi-owner@test');
delete from public.social_posts where caption = 'Our coffees this week';
do $$ begin
  assert (select status = 'done' and post_id is null from public.post_ideas where title = 'The coffees we have now'), 'still done';
end $$;

-- 6. The owner gives Ana's idea to Ben (he hears), and can't give it to the tablet. Let go, it's up for grabs again.
update public.post_ideas set taken_by = (select id from pi_people where email = 'pi-ben@test'), status = 'doing' where title = 'Latte art close-up';
select pg_temp.expect_error($q$update public.post_ideas set taken_by = (select id from pi_people where email = 'pi-tablet@test') where title = 'Latte art close-up'$q$, 'Pick someone on the team');
reset role; select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  assert (select title = 'A post for you to make: Latte art close-up' and body = 'Olga asked you to make it: Slow motion pour'
            from public.notifications where profile_id = (select id from pi_people where email = 'pi-ben@test')), 'Ben hears';
end $$;
select pg_temp.act_as('pi-ben@test');
update public.post_ideas set taken_by = null where title = 'Latte art close-up';
do $$ begin
  assert (select status = 'open' from public.post_ideas where title = 'Latte art close-up'), 'up for grabs again';
end $$;

-- 7. Her own idea, nobody started: Ana deletes it. The tablet sees none and adds none.
select pg_temp.act_as('pi-ana@test');
insert into public.post_ideas (title) values ('Rainy day window');
delete from public.post_ideas where title = 'Rainy day window';
do $$ begin assert not exists (select 1 from public.post_ideas where title = 'Rainy day window'), 'gone'; end $$;
select pg_temp.act_as('pi-tablet@test');
do $$ begin assert not exists (select 1 from public.post_ideas), 'the tablet sees none'; end $$;
select pg_temp.expect_error($q$insert into public.post_ideas (title) values ('Tablet idea')$q$, 'row-level security');

-- Tidy up: this test's people and rows; the coffees idea as it started.
reset role; select set_config('request.jwt.claim.sub', '', false);
delete from public.post_ideas where title = 'Latte art close-up';
update public.post_ideas set status = 'open', taken_by = null, media = '[]', post_id = null where title = 'The coffees we have now';
delete from public.notifications where data ? 'post_idea';
delete from auth.users where email like 'pi-%@test';
drop table pi_people;
