-- Spotify through a business's own Spotify app. Spotify lets a development-mode app in at most 5
-- Spotify accounts, across every business that uses it, so The Business Agent's app can't take every
-- business. A business that needs its own makes one (free, in Spotify's developer dashboard, with a
-- Premium account) and an admin pastes its Client ID on Connections → Spotify. Its café account and
-- its team then sign in through it, with PKCE: the Client ID is all that needs, so nothing secret is
-- kept for it. None: The Business Agent's app. Set on Connections → Spotify (worker/spotifyApp.ts).
alter table public.settings
  add column spotify_client_id text check (spotify_client_id ~ '^[0-9a-f]{32}$');
