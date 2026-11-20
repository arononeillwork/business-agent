-- A screen's slideshow: a screen shows one thing at a time (a single display), or everything that's
-- switched on taking turns (a slideshow), on the same link either way. The Screens page keeps which, so
-- picking something adds it to the slideshow instead of putting it on alone. The screen itself plays
-- whatever is switched on, so its feed needs nothing new (it sends the row as it is).
alter table public.screens add column slideshow boolean not null default false;
