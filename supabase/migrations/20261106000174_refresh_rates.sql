-- How often the app reads each outside service, chosen by the business (Connections → How often things
-- update). Each service has its usual time (shared/refresh.ts); an admin can pick another of its
-- choices: on Free, the usual or slower; each plan up a step faster; Business, the fastest or its own
-- number of minutes. Kept as { "<service>": minutes } (an empty object: the usual times everywhere).
-- The Worker reads it with the plan in force and keeps to what the plan allows (worker/refresh.ts), so a
-- business that drops to Free goes back to the usual times by itself, with nothing to change here.
-- Who changes it: admins, as the rest of the row (settings_write).
alter table public.settings
  add column refresh_minutes jsonb not null default '{}'::jsonb
    check (jsonb_typeof(refresh_minutes) = 'object' and pg_column_size(refresh_minutes) <= 2000);
