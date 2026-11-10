-- What a post about the café did for the café's own Instagram in its days (the day it went out and the
-- two after), against the week before: accounts reached, views of the café's posts, accounts engaged,
-- taps on its links and visits to its profile. Instagram doesn't give a collaborator a post's own reach or
-- profile visits (those are the poster's), so these are the café account's own, the way Instagram's app
-- shows what a day did. Read by the Worker once a post's days are in (worker/mentions.ts, readPostWindow),
-- one post a look:
--   { "reach": 3400, "views": 9100, "engaged": 210, "link_taps": 12, "profile_visits": 240,
--     "usual": { "reach": 1200, … } }   (a figure Instagram didn't give is null)
alter table public.instagram_mentions
  add column account_window jsonb check (account_window is null or jsonb_typeof(account_window) = 'object'),
  add column window_read_at timestamptz;
create index instagram_mentions_window_idx on public.instagram_mentions (business_id, mentioned_at desc) where window_read_at is null;
