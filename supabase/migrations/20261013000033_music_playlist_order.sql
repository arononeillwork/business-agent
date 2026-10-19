-- Café music: playlists play one after another in the order the team sets on the Music page
-- (playlist ids). When the speaker reaches the end of a playlist it starts the next one.
alter table public.music_player add column playlist_order jsonb not null default '[]'::jsonb
  check (jsonb_typeof(playlist_order) = 'array' and jsonb_array_length(playlist_order) <= 200);
