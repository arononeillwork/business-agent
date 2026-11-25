-- How far a screen's picture is turned, clockwise, for a TV hung on its side or upside down: the
-- Rotate button on the Screens page turns it a quarter more each time (0, 90, 180, 270, then 0 again),
-- and the screen turns within a minute, when it next asks for its slides. The public feed carries it
-- with the rest of the screen. 0: as it comes, as every screen was before.

alter table public.screens
  add column rotation int not null default 0 check (rotation in (0, 90, 180, 270));
