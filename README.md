# Business Agent

Team app for small businesses, set up first for **Easy Beans Coffee** (San Pedro de Alcántara):
Square-style rota and time tracking, Spanish holidays and registro de jornada rules, and a
built-in **AI connector** so owners can run it by talking to Claude.

- Web app: installable on phones (Add to Home Screen) and the café tablet (kiosk with PINs)
- AI: MCP connector at `/mcp` with sign-in, plus a REST API at `/api/v1` for n8n/Zapier
- Hosting: one Cloudflare Worker. Data and login: Supabase (EU): email/password, Google, Microsoft
- Partners: outside businesses (gestoría, suppliers) get a read-only login to the areas an admin
  picks (rota, payroll, finances, calendar). Enforced by database row security and in the AI tools.

See [docs/PLAN.md](docs/PLAN.md) for decisions, architecture and phases.

## Layout

```
shared/            business config, types, Spain working-time rules (used everywhere)
src/               React app (pages, data layer: Supabase or in-memory demo)
worker/            Cloudflare Worker: /api, REST tools, MCP + OAuth, cron
supabase/          migrations (schema, RLS, SQL rules), seed data, SQL tests
```

## Run locally

```bash
npm install
npm run dev            # http://localhost:5173  (add ?demo for sample data, no backend)
```

The app reads the Supabase URL and publishable key from `wrangler.jsonc` via `/api/config`.
For invites and the auto clock-out cron, put the service key in `.dev.vars`:

```
SUPABASE_SERVICE_ROLE_KEY=...
```

## Tests

```bash
npm test                  # unit: Spain rules + AI connector tools (vitest)
npm run typecheck
npm run test:e2e          # browser: 31 demo-mode journeys (Playwright, fixed clock)
npm run test:db           # SQL: migrations + phase-1 acceptance checks on any Postgres
                          #   (set PGHOST/PGPORT/PGUSER)
SUPABASE_SERVICE_ROLE_KEY=... npm run test:e2e:live
                          # browser + API against real Supabase: sign-in, clock in/out,
                          # pay privacy, kiosk PIN, and the Claude connector OAuth flow.
                          # Add E2E_BASE_URL=https://<worker-url> to test a deployed copy.
```

The live suite creates `@business-agent.test` accounts and deletes them and their data at the
end. Run it against the dev project, not production. First-time Playwright setup:
`npx playwright install chromium`.

Uptime: `.github/workflows/ci.yml` runs all of the above on every push;
`.github/workflows/monitor.yml` smoke-tests the live site every 15 minutes (`e2e/smoke.spec.ts`:
site up, Supabase reachable, email/Google/Microsoft sign-in switched on). Set the repo variable
`PRODUCTION_URL` to turn it on.

A single-file clickable demo (sample data, no backend) builds with
`node scripts/build-demo-page.mjs` → `dist-demo/easy-beans-demo.html`.

## Deploy (Cloudflare)

1. Cloudflare dashboard → Workers & Pages → Create → **Import a repository** → `business-agent`.
   Build command `npm run build`, deploy command `npx wrangler deploy`.
2. Add the secret `SUPABASE_SERVICE_ROLE_KEY` (Worker → Settings → Variables and secrets).
3. In Supabase → Authentication → URL configuration, set the Site URL to the Worker URL and
   add `<worker-url>/**` to redirect URLs. Turn off public sign-ups (the app is invite-only anyway).
4. Sign up first as the owner (the first account becomes admin), then invite the team from the Team page.

## Connect Claude

Claude → Settings → Connectors → Add custom connector → `https://<worker-url>/mcp`.
Sign in with your team account. Claude then works with your permissions; every change is
logged as made "via AI". Try: *"Who's working on Saturday, and are any shifts still open?"*

## REST API

```
GET  /api/v1/tools              list tools + JSON schemas
POST /api/v1/tools/{name}       run a tool, JSON body
Authorization: Bearer <Supabase access token>
```

## New business

Copy `shared/business.config.ts`, create a Supabase project (apply `supabase/migrations`, write a
seed like `supabase/seed/easy_beans.sql`), and deploy a new Worker with its own `wrangler.jsonc` vars.
