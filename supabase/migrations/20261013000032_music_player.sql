-- Café music player: one device (the café tablet, or whoever presses "Play on this device")
-- plays the café's YouTube Music playlist in the Music page; every other team member's phone
-- sees what's playing and can play, pause, skip, pick a song, change the order or the playlist.
-- One shared row: the speaker writes what it's doing; remotes write commands (numbered, so the
-- speaker runs each once) and queue changes (versioned, so the speaker picks up the new order).

create table public.music_player (
  id             int primary key default 1 check (id = 1),
  -- The speaker: a random id the browser keeps, and a name people recognise ("Aron's computer").
  device_id      text check (device_id is null or char_length(device_id) <= 64),
  device_name    text check (device_name is null or char_length(device_name) <= 80),
  -- {id, name, image, tracks, url} of the playlist the queue came from.
  playlist       jsonb,
  -- [{id, title, artist, image}] in play order.
  queue          jsonb not null default '[]'::jsonb check (jsonb_typeof(queue) = 'array' and jsonb_array_length(queue) <= 500),
  queue_version  int not null default 0,
  position       int not null default 0 check (position >= 0),
  playing        boolean not null default false,
  elapsed        real not null default 0,
  duration       real not null default 0,
  volume         int not null default 80 check (volume between 0 and 100),
  -- {action: play|pause|next|previous|jump|seek|volume, value?, by}
  command        jsonb,
  command_seq    int not null default 0,
  heartbeat_at   timestamptz,
  updated_at     timestamptz not null default now()
);
insert into public.music_player (id) values (1);

alter table public.music_player enable row level security;
revoke all on public.music_player from anon;
-- The team reads it and the speaker reports into it; nobody adds or removes the row.
create policy music_player_read on public.music_player for select to authenticated using ((select public.is_staff()));
create policy music_player_write on public.music_player for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

/** A remote button press: numbered so the speaker runs it exactly once. */
create or replace function public.music_send(p_action text, p_value real default null)
returns int
language plpgsql security definer set search_path = ''
as $$
declare v_seq int;
begin
  if not public.is_staff() then raise exception 'Music is for the team'; end if;
  if p_action not in ('play', 'pause', 'next', 'previous', 'jump', 'seek', 'volume') then raise exception 'Unknown music action'; end if;
  update public.music_player
     set command = jsonb_build_object('action', p_action, 'value', p_value, 'by', auth.uid()),
         command_seq = command_seq + 1, updated_at = now()
   where id = 1
  returning command_seq into v_seq;
  return v_seq;
end $$;

/** A new queue (another playlist, a new order, shuffled): versioned so the speaker adopts it. */
create or replace function public.music_set_queue(p_playlist jsonb, p_queue jsonb, p_position int)
returns int
language plpgsql security definer set search_path = ''
as $$
declare v_version int;
begin
  if not public.is_staff() then raise exception 'Music is for the team'; end if;
  if jsonb_typeof(p_queue) <> 'array' then raise exception 'The queue must be a list of songs'; end if;
  update public.music_player
     set playlist = p_playlist, queue = p_queue,
         position = least(greatest(coalesce(p_position, 0), 0), greatest(jsonb_array_length(p_queue) - 1, 0)),
         queue_version = queue_version + 1, updated_at = now()
   where id = 1
  returning queue_version into v_version;
  return v_version;
end $$;

revoke all on function public.music_send(text, real), public.music_set_queue(jsonb, jsonb, int) from public, anon;
grant execute on function public.music_send(text, real), public.music_set_queue(jsonb, jsonb, int) to authenticated;
