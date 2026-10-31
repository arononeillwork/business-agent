# Why the database freezes, and what happens when it does

## What it looks like

Sign-in buttons do nothing, pages stay empty, `/api/health?deep=1` times out, and a deploy stops at
"Database migrations" with `544 … connection timeout`, or its live checks fail with
`AuthRetryableFetchError`. It doesn't go away by itself: until 31 October 2026 the project was
restarted by hand four times (Actions → Restart Supabase).

## Why (31 October 2026, from Supabase's logs)

- The project runs on Supabase's **Micro** server (the Pro plan's default: 1 GB of memory, shared
  CPU and burstable disk). Postgres, sign-in (GoTrue), the data API (PostgREST), file storage, the
  connection pooler and Supabase's own agents all share that one machine.
- Postgres itself does very little: the database is 43 MB, and a typical request takes a few
  milliseconds in it. None of Supabase's performance advisors points at a slow query.
- The trouble comes in bursts. The app loads about 40 things at once when a page opens, and every
  deploy runs the live tests (`e2e/live-journeys.spec.ts`, `e2e/live.spec.ts`), roughly 13
  requests a second for about ten minutes, signing in a dozen times and creating and deleting test
  accounts. On 31 October there were 21 deploys, so for most of the afternoon the live tests ran
  back to back.
- Under those bursts the whole machine stalls, not one table: requests to unrelated tables, sign-in
  and the minute-by-minute jobs all wait the same 18–30 seconds (15:51, 17:08 and 18:07 UTC). The
  data API's connections fill up ("PGRST003 Timed out acquiring connection from connection pool"),
  so everything else gets 504s. A short stall passes by itself.
- After hours of it, a stall became a freeze (17:20 UTC, and 23:25 UTC the day before). Cloudflare
  then couldn't even open a connection to Supabase (522) or got no answer within ten minutes (524)
  for over half an hour, until the restart. That is the machine running out of room, most likely
  memory, then disk once it swaps. A query or lock problem inside Postgres would still accept
  connections.

## What happens now

- **Supabase watchdog** (`.github/workflows/supabase-watchdog.yml`, every five minutes): asks
  sign-in and the data API directly. When either stays unanswered for five minutes, it starts
  **Restart Supabase** and fails, so GitHub emails the owner. A stall that passes within those five
  minutes is left alone, and it never starts a second restart within half an hour of the last.
- **Restart Supabase** then waits until sign-in and the data API answer, and runs again the failed
  jobs of a deploy of main's latest commit that failed in the last three hours.
- **Deploy**: reading the database's migrations is tried again for three minutes before the deploy
  stops (`scripts/ops/migrate.mjs`), so a short stall no longer fails it.

So a freeze is now over in about a quarter of an hour without anyone stepping in, instead of lasting
until someone notices.

## What stops it happening

A bigger server: Supabase dashboard → Project Settings → Compute and Disk → **Small** (2 GB) or
larger. It's an owner's decision, because it costs more each month; the dashboard shows the price
before it changes anything, and the switch takes a few minutes of downtime. Running the full live
tests less often (for example at most once an hour, with the smoke test after every deploy) would
also take most of the load off, at the cost of the Feature board's "checked on the live site" step
waiting for the next run.
