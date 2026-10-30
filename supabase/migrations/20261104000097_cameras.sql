-- Cameras: the business's CCTV cameras (Reolink plug-in Wi-Fi and PoE ones, and others that upload
-- by FTP). Each camera logs in to Business Agent's upload server (cameras/, one server for every
-- business) with its own username and password, and sends it pictures and video:
--   - pictures are the Cameras page's picture that refreshes every few seconds: the upload server
--     keeps only the latest one, in memory, and nothing here keeps them;
--   - video is kept in the business's own Google Drive or OneDrive
--     (Business Agent/Cameras/<camera>/<day>/), one camera_clips row each, for the camera's
--     keep_days; then the Worker deletes it there and here, unless it's kept for an incident.
-- With keep_video 'motion' the upload server passes on only the video in which its pictures show
-- something moving (or video the camera sent because it saw movement itself).
-- Who: admins (bosses and shop managers) see and set up the cameras and their clips; the cameras'
-- uploads reach the database only through the Worker.

-- 64 random bits as 16 hex digits: a camera's FTP password (short enough for any camera's app).
create or replace function public.camera_password() returns text
language sql volatile set search_path = ''
as $$
  select substr(h, 1, 12) || substr(h, 18, 4) from (select replace(gen_random_uuid()::text, '-', '') as h) x
$$;

create table public.cameras (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 60),
  -- Indoor or outdoor: which setup tips the page gives.
  placement     text not null default 'indoor' check (placement in ('indoor', 'outdoor')),
  -- Its login on the upload server, which every business shares, so the username is unique across
  -- all of them. Admins read both to type them into the camera's app.
  ftp_user      text not null unique default ('cam' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) check (ftp_user ~ '^cam[0-9a-f]{8}$'),
  ftp_password  text not null default public.camera_password() check (ftp_password ~ '^[0-9a-f]{16}$'),
  -- How long its video is kept. Spain allows a month at most (LOPDGDD art. 22.3), unless it's needed
  -- for an incident (a clip kept, below).
  keep_days     int not null default 30 check (keep_days between 1 and 30),
  -- 'motion': only video with something moving in it; 'all': everything the camera sends.
  keep_video    text not null default 'motion' check (keep_video in ('motion', 'all')),
  -- Off: the upload server turns its uploads away (nothing is kept).
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users on delete set null default auth.uid()
);
select public.add_business_scope('public.cameras');
create unique index cameras_name_key on public.cameras (business_id, lower(name));

-- What's been heard from each camera, on its own (the Worker's, not audited, not the camera's change).
create table public.camera_status (
  camera_id     uuid primary key references public.cameras on delete cascade,
  -- The last picture or video that came in (noted at most every few minutes for pictures).
  last_seen_at  timestamptz,
  last_clip_at  timestamptz,
  -- Why the last video couldn't be kept (storage not connected or failing), until one is.
  last_error    text check (char_length(last_error) <= 500)
);
select public.add_business_scope('public.camera_status');

-- The video kept from each camera: where it is in the business's storage and when it was filmed.
create table public.camera_clips (
  id          uuid primary key default gen_random_uuid(),
  -- Not cascaded: a camera's clips are deleted from storage first (the Worker), never left behind.
  camera_id   uuid not null references public.cameras on delete restrict,
  started_at  timestamptz not null,
  seconds     int check (seconds between 0 and 86400),
  bytes       bigint not null check (bytes > 0),
  storage     text not null check (storage in ('google_drive', 'onedrive')),
  file_id     text not null check (char_length(file_id) between 1 and 300),
  file_name   text not null check (char_length(file_name) between 1 and 200),
  -- The file's own page in Drive or OneDrive.
  link        text check (link ~* '^https://\S+$' and char_length(link) <= 2000),
  -- Kept because something moved in it (false: kept because the camera keeps all its video).
  motion      boolean not null default true,
  -- Kept for an incident: not deleted when its camera's days are up.
  kept        boolean not null default false,
  note        text check (char_length(note) <= 300),
  created_at  timestamptz not null default now()
);
select public.add_business_scope('public.camera_clips');
create unique index camera_clips_file_key on public.camera_clips (business_id, storage, file_id);
create index camera_clips_camera_idx on public.camera_clips (camera_id, started_at desc);
create index camera_clips_started_idx on public.camera_clips (started_at) where not kept;

create or replace function public.camera_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  if new.name = '' then raise exception 'Give the camera a name' using errcode = '22023'; end if;
  if new.name ~ '[\\/:*?"<>|]' then
    raise exception 'A camera’s name is its folder’s in your storage: leave out \ / : * ? " < > |' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.ftp_user := old.ftp_user;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger cameras_rules before insert or update on public.cameras for each row execute function public.camera_rules();
create trigger audit_cameras after insert or update or delete on public.cameras for each row execute function public.audit_row();

create or replace function public.camera_clip_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.note := nullif(btrim(new.note), '');
  return new;
end $$;
create trigger camera_clips_rules before insert or update on public.camera_clips for each row execute function public.camera_clip_rules();
-- Keeping a clip for an incident (or letting it go) is in the audit log; the clips coming in and
-- going after their days aren't.
create trigger audit_camera_clips after update on public.camera_clips for each row execute function public.audit_row();

alter table public.cameras enable row level security;
alter table public.camera_status enable row level security;
alter table public.camera_clips enable row level security;
revoke all on public.cameras, public.camera_status, public.camera_clips from anon;
create policy cameras_admin on public.cameras for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- The login can't be chosen (it's made here); a camera goes through the Worker, which deletes its clips first.
revoke insert, update, delete on public.cameras from authenticated;
grant insert (name, placement, keep_days, keep_video, active) on public.cameras to authenticated;
grant update (name, placement, keep_days, keep_video, active) on public.cameras to authenticated;
create policy camera_status_admin_read on public.camera_status for select to authenticated using ((select public.is_admin()));
revoke insert, update, delete on public.camera_status from authenticated;
create policy camera_clips_admin on public.camera_clips for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- Admins keep a clip for an incident and say why; the clips themselves come and go through the Worker.
revoke insert, update, delete on public.camera_clips from authenticated;
grant update (kept, note) on public.camera_clips to authenticated;

-- A new password for a camera (the old one stops working): when it was shared by mistake. The
-- camera's app needs the new one typed in.
create or replace function public.new_camera_password(p_id uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare v text;
begin
  if not public.is_admin() then raise exception 'Only admins set up cameras' using errcode = '42501'; end if;
  update public.cameras set ftp_password = public.camera_password() where id = p_id returning ftp_password into v;
  if v is null then raise exception 'No such camera' using errcode = 'P0002'; end if;
  return v;
end $$;
alter function public.new_camera_password(uuid) owner to app_definer;
revoke execute on function public.new_camera_password(uuid) from public, anon;
grant execute on function public.new_camera_password(uuid) to authenticated;

-- The clips whose camera's days are up (oldest first, not kept for an incident): the Worker deletes
-- them from storage, then here. Within the business it acts for.
create or replace function public.camera_clips_due(p_limit int default 200)
returns table (id uuid, storage text, file_id text)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.storage, c.file_id
    from public.camera_clips c join public.cameras k on k.id = c.camera_id
   where not c.kept and c.started_at < now() - make_interval(days => k.keep_days)
   order by c.started_at
   limit least(greatest(p_limit, 1), 1000)
$$;
alter function public.camera_clips_due(int) owner to app_definer;
revoke execute on function public.camera_clips_due(int) from public, anon, authenticated;
grant execute on function public.camera_clips_due(int) to service_role;
