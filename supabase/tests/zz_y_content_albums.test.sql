-- Content's favourites and albums: an admin stars a photo, makes albums (each name once), puts photos in
-- (each once, the business's own only), renames and deletes them. Taking a photo off the page takes it
-- out of its albums; deleting an album leaves its photos. Admins only. Its own people and rows, removed at the end.

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
  ('ci-al-admin@test', '{"full_name": "Olga"}', now()),
  ('ci-al-staff@test', '{"full_name": "Ana"}', now());
update public.profiles set role = 'admin', can_see_pay = false where email = 'ci-al-admin@test';

-- 1. An admin stars a photo, makes an album (the name tidied) and puts two photos in it, each once.
select pg_temp.act_as('ci-al-admin@test');
do $$
declare
  v_a uuid; v_b uuid; v_album uuid;
begin
  insert into public.content_items (kind, url, title) values ('photo', 'https://app.test/media/al-a.jpg', 'Terrace A') returning id into v_a;
  insert into public.content_items (kind, url, title) values ('photo', 'https://app.test/media/al-b.jpg', 'Terrace B') returning id into v_b;
  assert (select not favourite from public.content_items where id = v_a), 'not a favourite to start with';
  update public.content_items set favourite = true where id = v_a;
  assert (select favourite from public.content_items where id = v_a), 'starred';

  insert into public.content_albums (name) values ('  The   terrace ') returning id into v_album;
  assert (select name from public.content_albums where id = v_album) = 'The terrace', 'the name tidied';
  insert into public.content_album_items (album_id, item_id) values (v_album, v_a), (v_album, v_b);
  assert (select count(*) from public.content_album_items where album_id = v_album) = 2, 'two in it';
end $$;
-- Each photo once in an album; each album name once (whatever the capitals); a name of 1 to 60 characters.
select pg_temp.expect_error($q$insert into public.content_album_items (album_id, item_id)
  select a.id, i.id from public.content_albums a, public.content_items i where a.name = 'The terrace' and i.title = 'Terrace A'$q$, 'content_album_items_key');
select pg_temp.expect_error($q$insert into public.content_albums (name) values ('the TERRACE')$q$, 'an album called the TERRACE');
select pg_temp.expect_error($q$insert into public.content_albums (name) values ('   ')$q$, 'content_albums_name_check');
select pg_temp.expect_error($q$insert into public.content_albums (name) values (repeat('x', 61))$q$, 'content_albums_name_check');
-- Only the name changes; only the star changes besides the title and tags.
select pg_temp.expect_error($q$update public.content_albums set created_by = null$q$, 'permission denied');
select pg_temp.expect_error($q$update public.content_album_items set added_at = now()$q$, 'permission denied');
select pg_temp.expect_error($q$update public.content_items set url = 'https://elsewhere.test/x.jpg' where title = 'Terrace A'$q$, 'permission denied');
-- Something that isn't there doesn't go in.
select pg_temp.expect_error($q$insert into public.content_album_items (album_id, item_id)
  select a.id, gen_random_uuid() from public.content_albums a where a.name = 'The terrace'$q$, 'here any more');

-- 2. Someone who isn't an admin sees no albums and adds none.
select pg_temp.act_as('ci-al-staff@test');
do $$ begin
  assert (select count(*) from public.content_albums) = 0, 'an employee sees no albums';
  assert (select count(*) from public.content_album_items) = 0, 'nor what''s in them';
end $$;
select pg_temp.expect_error($q$insert into public.content_albums (name) values ('Mine')$q$, 'row-level security');

-- 3. A photo taken off the page leaves its albums; an album renamed, then deleted, leaves its photos.
select pg_temp.act_as('ci-al-admin@test');
do $$
declare v_album uuid := (select id from public.content_albums where name = 'The terrace');
begin
  delete from public.content_items where title = 'Terrace B';
  assert (select count(*) from public.content_album_items where album_id = v_album) = 1, 'out of the album with it';
  update public.content_albums set name = 'Terrace' where id = v_album;
  assert (select name from public.content_albums where id = v_album) = 'Terrace', 'renamed';
  delete from public.content_albums where id = v_album;
  assert (select count(*) from public.content_album_items where album_id = v_album) = 0, 'what was in it goes with it';
  assert (select count(*) from public.content_items where title = 'Terrace A') = 1, 'the photo stays on the page';
  delete from public.content_items where title = 'Terrace A';
end $$;

-- Tidy up.
reset role; select set_config('request.jwt.claim.sub', '', false);
delete from auth.users where email like 'ci-al-%@test';
