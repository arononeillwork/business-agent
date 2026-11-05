-- Content: the business's photos and videos, for admins only. Google Photos is a connection like the
-- other Google ones (on the plans with the apps feature, in no group). An admin adds what they upload
-- (Google Photos' come from the Worker), changes the title and tags only, and takes one off the page.
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

-- 1. Google Photos as a connection: every business has its row, it needs the apps feature, and it's in no group.
do $$ begin
  assert (select count(*) from public.business b where not exists (
    select 1 from public.integrations i where i.business_id = b.id and i.provider = 'google_photos')) = 0, 'every business has Google Photos to connect';
  assert public.plan_feature_of('google_photos') = 'apps', 'Google Photos needs the apps feature, like Google Drive';
  assert public.plan_feature_of('google_drive') = 'apps' and public.plan_feature_of('search_console') is null, 'the others as they were';
  assert public.integration_group('google_photos') is null, 'Google Photos can be connected next to anything';
end $$;

insert into auth.users (email, raw_user_meta_data, invited_at) values
  ('ci-admin@test', '{"full_name": "Olga"}', now()),
  ('ci-staff@test', '{"full_name": "Ana"}', now());
update public.profiles set role = 'admin', can_see_pay = false where email = 'ci-admin@test';

-- 2. The Worker brings in a Google Photos pick (the service role, for the business).
insert into public.content_items (business_id, kind, url, title, source, source_id, width, height, taken_at, tags)
values (1, 'photo', 'https://app.test/media/g/1/file-1/abc.jpg', 'Terrace', 'google_photos', 'gp-1', 2560, 1920, '2026-10-30 09:15+00', '{}');
-- Picking the same one again doesn't make a second row.
select pg_temp.expect_error($q$insert into public.content_items (business_id, kind, url, source, source_id) values (1, 'photo', 'https://app.test/x.jpg', 'google_photos', 'gp-1')$q$, 'content_items_google_photos');
-- A Google Photos item names its Google id; an upload doesn't.
select pg_temp.expect_error($q$insert into public.content_items (business_id, kind, url, source) values (1, 'photo', 'https://app.test/x.jpg', 'google_photos')$q$, 'check');

-- 3. An admin sees it and adds an upload (tidied: a blank title is none; tags trimmed, lower case and once each).
select pg_temp.act_as('ci-admin@test');
do $$
declare v public.content_items;
begin
  assert (select count(*) from public.content_items where source_id = 'gp-1') = 1, 'an admin sees what came from Google Photos';
  insert into public.content_items (kind, url, title, tags) values ('video', 'https://app.test/media/g/1/file-2/def.mp4', '  ', array[' Terrace', 'terrace ', 'Latte  Art', ' '])
    returning * into v;
  assert v.title is null and v.tags = array['terrace', 'latte art'] and v.source = 'upload' and v.added_by = auth.uid(), 'tidied and stamped';
  -- The title and tags change; nothing else does.
  update public.content_items set title = ' Pour over ', tags = array['Coffee'] where id = v.id returning * into v;
  assert v.title = 'Pour over' and v.tags = array['coffee'], 'title and tags changed';
end $$;
select pg_temp.expect_error($q$update public.content_items set url = 'https://elsewhere.test/x.mp4'$q$, 'permission denied');
select pg_temp.expect_error($q$update public.content_items set source_id = 'gp-9'$q$, 'permission denied');
-- An admin can't pass an upload off as from Google Photos (those come from the Worker only).
select pg_temp.expect_error($q$insert into public.content_items (kind, url, source, source_id) values ('photo', 'https://app.test/y.jpg', 'google_photos', 'gp-2')$q$, 'row-level security');
-- The checks: an address, a tag of up to 30 characters, up to 12 tags, a known kind.
select pg_temp.expect_error($q$insert into public.content_items (kind, url) values ('photo', 'not a link')$q$, 'content_items_url_check');
select pg_temp.expect_error($q$insert into public.content_items (kind, url, tags) values ('photo', 'https://app.test/z.jpg', array[repeat('x', 31)])$q$, '30 characters');
select pg_temp.expect_error($q$insert into public.content_items (kind, url, tags) values ('photo', 'https://app.test/z.jpg', array['a','b','c','d','e','f','g','h','i','j','k','l','m'])$q$, 'content_items_tags_check');
select pg_temp.expect_error($q$insert into public.content_items (kind, url) values ('audio', 'https://app.test/z.mp3')$q$, 'content_items_kind_check');

-- 4. Someone who isn't an admin sees none, adds none and takes none off.
select pg_temp.act_as('ci-staff@test');
do $$ begin
  assert (select count(*) from public.content_items) = 0, 'an employee sees none';
  delete from public.content_items;
end $$;
select pg_temp.expect_error($q$insert into public.content_items (kind, url) values ('photo', 'https://app.test/s.jpg')$q$, 'row-level security');

-- 5. The admin takes one off the page.
select pg_temp.act_as('ci-admin@test');
do $$ begin
  assert (select count(*) from public.content_items) = 2, 'nothing taken off by the employee';
  delete from public.content_items where source = 'upload';
  assert (select count(*) from public.content_items) = 1, 'taken off';
end $$;

reset role; select set_config('request.jwt.claim.sub', '', false);
delete from public.content_items where url like 'https://app.test/%';
delete from auth.users where email like 'ci-%@test';
