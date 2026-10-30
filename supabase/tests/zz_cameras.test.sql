-- Cameras: admins add them and read their upload login; the login is made here and only a new
-- password changes it; the team sees nothing. Clips come and go through the Worker: admins keep one
-- for an incident (with a note) and nothing else; a camera with clips isn't deleted under them;
-- clips past their camera's days are listed for deleting, never the ones kept for an incident.
-- People from the tests before it: maria (admin), julio (employee).

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

-- 1. An admin adds the indoor and outdoor cameras; each gets its own login.
select pg_temp.act_as('maria@test');
do $$ declare v public.cameras; w public.cameras; begin
  insert into public.cameras (name) values ('  Counter  ') returning * into v;
  insert into public.cameras (name, placement, keep_days, keep_video) values ('Terrace', 'outdoor', 7, 'all') returning * into w;
  assert v.name = 'Counter' and v.placement = 'indoor' and v.keep_days = 30 and v.keep_video = 'motion' and v.active, 'tidied, with the usual settings';
  assert v.ftp_user ~ '^cam[0-9a-f]{8}$' and v.ftp_password ~ '^[0-9a-f]{16}$', 'its own username and password';
  assert v.ftp_user <> w.ftp_user and v.ftp_password <> w.ftp_password, 'each its own';
  assert w.keep_days = 7 and w.keep_video = 'all', 'or its own settings';
end $$;
select pg_temp.expect_error($q$insert into public.cameras (name) values ('counter')$q$, 'duplicate key');
select pg_temp.expect_error($q$insert into public.cameras (name) values ('Back/door')$q$, 'leave out');
select pg_temp.expect_error($q$insert into public.cameras (name, keep_days) values ('Store room', 31)$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.cameras (name, ftp_user) values ('Store room', 'cam00000000')$q$, 'permission denied');
select pg_temp.expect_error($q$update public.cameras set ftp_password = '0000000000000000' where name = 'Counter'$q$, 'permission denied');
select pg_temp.expect_error($q$delete from public.cameras where name = 'Terrace'$q$, 'permission denied');

do $$ declare v_old text := (select ftp_password from public.cameras where name = 'Counter'); v_new text; begin
  update public.cameras set keep_days = 14, name = 'Counter camera' where name = 'Counter';
  assert (select keep_days = 14 and name = 'Counter camera' from public.cameras where ftp_password = v_old), 'settings change';
  v_new := public.new_camera_password((select id from public.cameras where name = 'Counter camera'));
  assert v_new <> v_old and v_new ~ '^[0-9a-f]{16}$', 'a new password';
  assert (select ftp_password from public.cameras where name = 'Counter camera') = v_new, 'which is the one kept';
end $$;

-- 2. The team sees no cameras, can't add one or make a password.
select pg_temp.act_as('julio@test');
do $$ begin
  assert (select count(*) from public.cameras) = 0 and (select count(*) from public.camera_clips) = 0, 'employees see no cameras or clips';
end $$;
select pg_temp.expect_error($q$insert into public.cameras (name) values ('Sneaky')$q$, 'row-level security');
select pg_temp.expect_error($q$select public.new_camera_password((select id from public.cameras limit 1))$q$, 'Only admins');

-- 3. The Worker keeps clips as they come in (an old one, an old one kept for an incident, a new one).
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare v_cam uuid := (select id from public.cameras where name = 'Counter camera'); begin
  insert into public.camera_status (camera_id, last_seen_at, last_clip_at) values (v_cam, now(), now());
  insert into public.camera_clips (camera_id, started_at, seconds, bytes, storage, file_id, file_name, link) values
    (v_cam, now() - interval '20 days', 30, 4000000, 'google_drive', 'old-file', '10.00.00.mp4', 'https://drive.google.com/file/d/old-file/view'),
    (v_cam, now() - interval '21 days', 30, 4000000, 'google_drive', 'incident-file', '09.00.00.mp4', null),
    (v_cam, now() - interval '1 hour', 30, 4000000, 'google_drive', 'new-file', '15.00.00.mp4', null);
end $$;
select pg_temp.expect_error($q$insert into public.camera_clips (camera_id, started_at, bytes, storage, file_id, file_name)
  select id, now(), 10, 'google_drive', 'new-file', 'again.mp4' from public.cameras where name = 'Counter camera'$q$, 'duplicate key');

select pg_temp.act_as('maria@test');
do $$ begin
  assert (select count(*) from public.camera_clips) = 3, 'admins see the clips';
  assert (select last_clip_at is not null from public.camera_status), 'and when each camera last sent one';
  update public.camera_clips set kept = true, note = '  Broken window, police report 1234  ' where file_id = 'incident-file';
  assert (select kept and note = 'Broken window, police report 1234' from public.camera_clips where file_id = 'incident-file'), 'kept for an incident, with a note';
  assert exists (select 1 from public.audit_log where table_name = 'camera_clips'), 'which is in the audit log';
end $$;
select pg_temp.expect_error($q$update public.camera_status set last_error = 'x'$q$, 'permission denied');
select pg_temp.expect_error($q$update public.camera_clips set file_id = 'elsewhere' where file_id = 'old-file'$q$, 'permission denied');
select pg_temp.expect_error($q$delete from public.camera_clips where file_id = 'old-file'$q$, 'permission denied');
select pg_temp.expect_error($q$insert into public.camera_clips (camera_id, started_at, bytes, storage, file_id, file_name)
  select id, now(), 10, 'google_drive', 'fake', 'fake.mp4' from public.cameras limit 1$q$, 'permission denied');
select pg_temp.expect_error($q$select * from public.camera_clips_due()$q$, 'permission denied');

-- 4. Days up: only the old clip that isn't kept, and a camera with clips isn't deleted under them.
reset role;
do $$ begin
  assert (select array_agg(file_id) from public.camera_clips_due()) = array['old-file'], 'past its camera’s 14 days, not kept';
  update public.cameras set keep_days = 30 where name = 'Counter camera';
  assert not exists (select 1 from public.camera_clips_due()), 'none once the camera keeps 30 days';
end $$;
select pg_temp.expect_error($q$delete from public.cameras where name = 'Counter camera'$q$, 'foreign key');
do $$ begin
  delete from public.camera_clips where camera_id = (select id from public.cameras where name = 'Counter camera');
  delete from public.cameras where name = 'Counter camera';
  assert not exists (select 1 from public.camera_status), 'its status goes with it';
end $$;
