-- Content's synced folders: the Worker adds a folder and lists its photos and videos (source 'folder'), each
-- file once per folder. Admins see the folders, hide one of their photos, and take a folder off (its photos
-- go with it); they don't add folders or rows themselves (the Worker checks the folder first). Uploads still
-- name no id; Google Photos and folders do. Its own people and rows, removed at the end.

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
  ('ci-cf-admin@test', '{"full_name": "Olga"}', now()),
  ('ci-cf-staff@test', '{"full_name": "Ana"}', now());
update public.profiles set role = 'admin', can_see_pay = false where email = 'ci-cf-admin@test';

-- 1. The Worker (the service role, for the business) adds a folder and lists two of its photos.
do $$
declare v_folder uuid;
begin
  insert into public.content_folders (business_id, provider, folder_id, name, path) values (1, 'onedrive', 'cf-roll', 'Camera Roll', 'Pictures › Camera Roll')
    returning id into v_folder;
  insert into public.content_items (business_id, kind, url, title, source, source_id, folder_id)
  values (1, 'photo', 'https://app.test/media/o/1/cf-1/sig.jpg', 'IMG 1', 'folder', 'cf-1', v_folder),
         (1, 'photo', 'https://app.test/media/o/1/cf-2/sig.jpg', 'IMG 2', 'folder', 'cf-2', v_folder);
  assert (select count(*) from public.content_items where folder_id = v_folder and not hidden) = 2, 'listed, not hidden';
end $$;
-- Each file once per folder; a folder's row names its folder and file; an upload names neither.
select pg_temp.expect_error($q$insert into public.content_items (business_id, kind, url, source, source_id, folder_id)
  select 1, 'photo', 'https://app.test/x.jpg', 'folder', 'cf-1', id from public.content_folders where folder_id = 'cf-roll'$q$, 'content_items_folder_file');
select pg_temp.expect_error($q$insert into public.content_items (business_id, kind, url, source, source_id) values (1, 'photo', 'https://app.test/x.jpg', 'folder', 'cf-9')$q$,
  'content_items_folder_given');
select pg_temp.expect_error($q$insert into public.content_items (business_id, kind, url, source, source_id) values (1, 'photo', 'https://app.test/x.jpg', 'upload', 'cf-9')$q$,
  'content_items_source_id_given');
select pg_temp.expect_error($q$insert into public.content_items (business_id, kind, url, source) values (1, 'photo', 'https://app.test/x.jpg', 'google_photos')$q$,
  'content_items_source_id_given');
-- The same folder twice for a business, or a provider it doesn't know.
select pg_temp.expect_error($q$insert into public.content_folders (business_id, provider, folder_id, name) values (1, 'onedrive', 'cf-roll', 'Again')$q$, 'content_folders_key');
select pg_temp.expect_error($q$insert into public.content_folders (business_id, provider, folder_id, name) values (1, 'dropbox', 'x', 'X')$q$, 'content_folders_provider_check');

-- 2. An admin sees the folder, hides one of its photos (still in the folder), and can't add folders or change one.
select pg_temp.act_as('ci-cf-admin@test');
do $$ begin
  assert (select count(*) from public.content_folders where folder_id = 'cf-roll') = 1, 'an admin sees the folder';
  update public.content_items set hidden = true where source_id = 'cf-2';
  assert (select hidden from public.content_items where source_id = 'cf-2'), 'hidden';
  -- An upload still goes in as before.
  insert into public.content_items (kind, url, title) values ('photo', 'https://app.test/media/cf-up.jpg', 'Upload');
end $$;
select pg_temp.expect_error($q$insert into public.content_folders (provider, folder_id, name) values ('onedrive', 'mine', 'Mine')$q$, 'permission denied');
select pg_temp.expect_error($q$update public.content_folders set name = 'Renamed'$q$, 'permission denied');
select pg_temp.expect_error($q$update public.content_items set folder_id = null where source_id = 'cf-1'$q$, 'permission denied');
select pg_temp.expect_error($q$insert into public.content_items (kind, url, source, source_id, folder_id)
  select 'photo', 'https://app.test/y.jpg', 'folder', 'cf-3', id from public.content_folders where folder_id = 'cf-roll'$q$, 'row-level security');

-- 3. Someone who isn't an admin sees no folders.
select pg_temp.act_as('ci-cf-staff@test');
do $$ begin
  assert (select count(*) from public.content_folders) = 0, 'an employee sees no folders';
end $$;

-- 4. The admin takes the folder off the page: its photos go with it; the upload stays.
select pg_temp.act_as('ci-cf-admin@test');
do $$ begin
  delete from public.content_folders where folder_id = 'cf-roll';
  assert (select count(*) from public.content_items where source = 'folder' and source_id like 'cf-%') = 0, 'its photos went with it';
  assert (select count(*) from public.content_items where title = 'Upload' and url = 'https://app.test/media/cf-up.jpg') = 1, 'the upload stays';
  delete from public.content_items where url = 'https://app.test/media/cf-up.jpg';
end $$;

-- Tidy up.
reset role; select set_config('request.jwt.claim.sub', '', false);
delete from auth.users where email like 'ci-cf-%@test';
