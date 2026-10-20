-- Pages the admins hid from everyone's menu (Settings → Pages), by menu key ("sports", "music"…).
-- Each person can also hide pages from their own menu; those are in their preferences (navHidden).
-- Hidden pages leave the menu and search; they still open from a link.
alter table public.settings add column hidden_pages text[] not null default '{}'
  check (cardinality(hidden_pages) <= 100 and array_position(hidden_pages, 'pages') is null);
