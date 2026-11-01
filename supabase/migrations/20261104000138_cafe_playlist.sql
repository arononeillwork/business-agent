-- Café music: the café playlist, the songs the team adds from Find music on the Music page
-- ([{id, title, artist, image}], each song once). It's listed and played with the café account's
-- own playlists. Business Agent keeps it on the shared player row, because the YouTube Music
-- connection only reads the café account (it can't add to the account's playlists).
alter table public.music_player add column cafe_playlist jsonb not null default '[]'::jsonb
  check (jsonb_typeof(cafe_playlist) = 'array' and jsonb_array_length(cafe_playlist) <= 500);
