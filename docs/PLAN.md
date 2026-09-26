# Business Agent — plan

A private web app for Easy Beans Coffee (and, via one config file, other small businesses):
Square Shifts-level scheduling and time tracking, Spanish holidays and registro de jornada
compliance, and a built-in AI connector so owners can run it by talking to Claude.

The full product spec (Square parity table, Spain rules, alerts, phases) is the source of truth
for *what* to build. This file records *how*, and the decisions taken.

## Decisions (26 Sep 2026)

| Topic | Decision |
|---|---|
| Hosting | Cloudflare Workers: one Worker serves the web app, `/api`, `/mcp` and cron jobs |
| Data + login | Supabase, EU region: Postgres, auth, invite emails, row-level security |
| AI access | Built-in MCP connector (`/mcp`, OAuth sign-in) added to Claude as a custom connector. REST API alongside for n8n/Zapier. No n8n required |
| Frontend | React + Vite PWA (installable on phones and the café tablet), MUI |
| Repo | `business-agent` (this repo), to be switched to private |
| Prototype | Rebuilt from the spec |

## Architecture

```
 Phones / café tablet / laptops        Claude, ChatGPT…             n8n, scripts (optional)
            │                               │ MCP + OAuth                  │ REST + API key
            ▼                               ▼                              ▼
 ┌──────────────────────── Cloudflare Worker (single deploy) ─────────────────────────┐
 │ static app (SPA)  │  /api/*  (Hono)  │  /mcp  (McpAgent)  │  scheduled() cron      │
 └──────────────────────────────────┬──────────────────────────────────────────────────┘
                                    ▼
          Supabase EU: Postgres + Auth. Row-level security on every table.
          Clock in/out, breaks, corrections, approvals = SECURITY DEFINER SQL functions,
          so the app, the REST API and the AI all go through the same rules.
```

Principles

- **One rule engine.** Anything with a business rule (clock-in window, reasons on edits,
  approval lock) is a SQL function. The UI, REST and MCP call it with the *user's* token, so the
  AI can never do more than the person could in the app.
- **Server time only.** Clock times come from `now()` in Postgres, never the device.
- **Nothing is deleted.** Timecards are corrected, never removed; every change is logged with
  who, when, why, and via what (app / kiosk / api / ai).
- **Config per business.** `src/config/business.config.ts` holds name, timezone, region,
  opening hours, positions, break rule, colours. New client = new config + Supabase project +
  Worker.

## Roles and devices

- `admin` — everything; pay visible only with `can_see_pay`.
- `employee` — own timecards/pay, schedule, calendar, clock in/out, requests.
- `kiosk` — a device account for the café tablet: can list names and punch with a PIN, nothing
  else. PINs stored hashed (pgcrypto).

## Phases

| Phase | Ships |
|---|---|
| 0 Skeleton | Repo, Worker deploy, schema + RLS, sign-in, team, business details, holidays 2026, week rota, phone clock-in, timecards |
| 1 Square parity (time) | Kiosk + PINs, break types, enforcement settings, auto clock-out, correction requests, weekly approval/lock, Spanish limit checks, gestor Excel + monthly PDF |
| 2 AI + alerts | MCP connector + REST API + API keys, calendar categories, area holidays, alert rules, WhatsApp/Slack/SMS |
| 3 Scheduling extras | Draft/publish, availability, time off, swaps, templates, Square sales → labour %, geofence |
| 4 Optional | Tips, calendar feed, second business |

A read-only MCP connector is pulled forward as early as possible so the owners can start
talking to the app while phase 1 is built.

## Environments

- **Local:** `npx supabase start` (Docker) + `npm run dev` (Vite + Workers runtime).
- **Production:** Supabase project in `eu-central-1` (Frankfurt), Worker on Cloudflare,
  deployed from GitHub. Supabase Pro advised before live clock-ins (daily backups; 4-year
  retention of the registro de jornada).

## Open business questions (become settings, don't block the build)

Weekday close 18:00 vs 15:00 · Sunday hours · convenio break/holiday-pay rules · break
lengths/paid · kiosk device · phone clock-in radius · who approves timecards and when · Square
sales link · owners clock in? · team channel (WhatsApp/Slack/SMS) · towns and teams to follow ·
which AI apps connect, and whether employees may connect one.

## Sports (decided 26 Sep 2026)

Follow **whole competitions**, not just favourite teams — examples: La Liga, UK leagues
(Premier League, Championship, Scottish Premiership), Eredivisie, plus national-team football
(World Cup, Euros, Nations League, qualifiers). Individual teams can still be followed on top.

- Table `sports_follows`: `kind` (competition | team), provider id, name, alert rule override.
- Feed: football-data.org (free tier covers PL, Championship, La Liga, Eredivisie, Champions
  League, World Cup, Euros; kick-offs converted to Europe/Madrid). API-Football as the paid
  fallback for lower leagues and Scottish football.
- A Worker cron syncs fixtures daily and on match days, updating reschedules.
- Calendar shows a "Sports" layer that can be filtered by competition, since whole leagues add
  many fixtures. Default alert: admins only, and only for "big" fixtures (Spain / England /
  Netherlands national team, clásicos, title-deciders) unless a competition's rule says
  otherwise — to avoid alert spam.

## Status (26 Sep 2026)

Built and tested in this repo:

| Area | State |
|---|---|
| Database (Supabase `BusinessAgent`, eu-west-1) | Schema, row-level security, SQL rules, audit log applied; Easy Beans seed loaded (business, positions, break types, 20 holidays for 2026, 7 football competitions) |
| Time tracking | Clock in/out + breaks (phone, kiosk PIN, API, AI), 10-min early window, unscheduled flag, auto clock-out cron, missed-break / over-9h flags, corrections with 30-day expiry, weekly approval, full change log |
| Web app | Today, Rota (week grid, costs, coverage bar, Spanish-law warnings, open shifts, copy last week), Timecards (approve, corrections, CSV), Calendar (categories, to-confirm), Team (invite, roles, pay, PINs), Business (details, rules), Account, Kiosk |
| AI connector | MCP at `/mcp` with OAuth sign-in (Supabase account), 26 tools, employees get only their tools; REST at `/api/v1/tools` |
| Security | Invite-only accounts (self sign-ups are inactive), pay visible only with "see pay", PINs hashed, no direct writes to timecards |
| Tests | SQL acceptance tests (phase-1 checklist), unit tests (rules, MCP), 13 browser tests in demo mode, 11 live browser/API tests (real Supabase + connector OAuth; run once `*.supabase.co` is reachable) |

Not done yet / next:

- Deploy: needs the GitHub push fixed (Claude GitHub App on this repo) and the repo connected in
  Cloudflare Workers Builds; then set `SUPABASE_SERVICE_ROLE_KEY` and Supabase auth URLs.
- Region: the dev project is Ireland (eu-west-1). For production, a new Frankfurt project or keep
  this one (both EU).
- Phase 1 remaining: gestor Excel + monthly registro PDF, under-18 checks, yearly overtime counter.
- Phase 2: football fixture sync (football-data.org key), alerts (WhatsApp/Slack/SMS), personal
  API keys for n8n, kiosk device account setup screen.
- Performance: code-split the app bundle (930 kB).
- Supabase migration history on the dev project was applied through the connector, so its version numbers differ from the files here; run `supabase migration repair` before using `supabase db push` against it.
