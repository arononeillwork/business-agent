-- The weekly routine on the calendar for the whole team: an admin takes it off everyone's Calendar and
-- Today in one go (Calendar → Routine), and every activity stays as it is, ready for when it's switched
-- back on. On for every business unless an admin turns it off. Each activity's own switch, and each
-- person's own filters on the calendar, work as before.

alter table public.settings add column routine_on_calendar boolean not null default true;
