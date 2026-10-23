# Business Agent

Team app for small businesses, set up first for **Easy Beans Coffee** (San Pedro de Alcántara):
Square-style rota and time tracking, Spanish holidays and registro de jornada rules, and a
built-in **AI connector** so owners can run it by talking to Claude.

- Web app: installable on phones (Add to Home Screen) and the café tablet (kiosk with PINs)
- AI: MCP server at `/mcp` for Claude, ChatGPT, Cursor and any MCP client (sign-in or personal access
  keys), plus a REST API at `/api/v1` with an OpenAPI description for GPT actions, n8n and Zapier
- Hosting: one Cloudflare Worker. Data and login: Supabase (EU): email/password or code, Google, Apple,
  Facebook, Microsoft ([setup](docs/sign-in-setup.md))
- Public pages: landing page with sign-in at `/`, the four plans at `/pricing`, and the savings
  against Square and GoHighLevel at `/compare`
- Plans and billing: Free, Starter €39, Pro €79, Business €129 (2 months free), Enterprise by contact with sales, paid through Stripe
  subscriptions; an unpaid trial or failed renewal drops the business to Free, enforced by the
  database ([docs/billing.md](docs/billing.md))
- Partners: outside businesses (gestoría, suppliers) get a read-only login to the areas an admin
  picks (rota, payroll, finances, calendar). Enforced by database row security and in the AI tools.
- Sports: the next 3 weeks of football (Spanish, English, Scottish, Dutch and other leagues, cups,
  European nights, national teams), rugby (Six Nations, Premiership, Champions Cup and more), UFC and
  boxing, with "big nights" flagged. The Worker refreshes
  each followed competition every 6 hours from free sources (fixturedownload.com, TheSportsDB,
  Wikipedia's UFC schedule); no keys of our own (TheSportsDB's free test key "123"). Admins pick
  competitions on the Sports page.
- Grants (Accounts section): which grants for Andalucía fit the business, from a few adaptive questions
  (most answers come from the business details), using Solicita's hand-checked list with each
  grant's official source and check date; then each application tracked stage by stage, with its
  documents and obligations ticked off and its next deadline on the team calendar.
- Social planner: write a post once and schedule it to Instagram, Facebook, TikTok, LinkedIn and Google
  Maps; each network's result links to the live post. Stripe, Square or SumUp connects as the till: the Accounts
  section has **Sales** (a Square-style dashboard: sales against the period before, busiest hours and
  days, how people paid, best sellers), **Finances** (running costs, takings next to team cost) and
  **Profit & loss** (month by month: takings without IVA, cost of sales, the team from timecards or
  the rota with Social Security on top, running costs and one-off lines; an estimate, exported to
  Excel, CSV or PDF like every Accounts table).
  With Square, **Loyalty & gift cards** (Sales section) shows the Square loyalty programme as the
  café's stamp card with its members, and the gift cards with what's still owed on them.
  Search Console shows how the website does on Google. **Ads** puts Meta Ads (Facebook and Instagram)
  and Google Ads side by side: spend, clicks and results per campaign next to the takings, monthly
  limits, and pause, resume or daily budget changes sent straight to the platform. **Reviews** reads the
  Google reviews (new ones in the bell, replies from templates in the review's language) and **Website &
  SEO** checks the website (SEO, Google PageSpeed, the same details as the app and Google Maps).
- Staff benefits (Team section): what everyone is entitled to in the business's country (`country` in
  `shared/business.config.ts`; Spain: 30 calendar days' holiday, 14 public holidays, sick pay from day 4,
  19 weeks' birth leave for each parent, nursing time, parental leave, and the Estatuto's paid leave for a
  wedding, a relative in hospital, a bereavement, a move…), each with who pays and its article, checked
  against the BOE on a stated date. Admins raise any amount (never below the law), add the business's own
  extras, give someone their own holiday for a year (their share when they start part-way, which Time off
  then holds requests to) and record leave for them. Everyone sees their own allocation (holiday taken,
  booked and left, sick days and other leave); admins and a payroll gestoría see the whole team.
- Licences & renewals (Business section): everything the business keeps open (licencia de apertura, SGAE
  and AGEDI/AIE for the music, the terrace permit, insurance, extinguisher and electrical checks, staff
  food handler certificates), each with its number, when it runs out, how often it renews, its cost
  and its document; one press marks it renewed, and admins are reminded in the bell beforehand.
- Legal (Business section): the business's legal documents (lease, company deeds, insurance, contracts,
  licences, policies) picked where they already are in the connected Google Drive or OneDrive (both can
  be connected; the admin chooses which), grouped by kind, shown in the page straight from the storage
  and opened there. Nothing is copied: only where each file is is kept. A gestoría with finances access
  reads. Setup: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) section 18.
- How often things update: what the app reads from Square, SumUp, Stripe, Google and Meta (takings, ads,
  Search Console, loyalty, email invoices, reviews) is kept a while (`provider_cache`), so opening a page
  doesn't ask them again each time: today's takings every 15 minutes and finished days once a day, ads
  hourly, Search Console every 6 hours, reviews hourly (every 3 hours from Places, which Google charges
  for past 1,000 look-ups a month). Each page says when its figures were updated and how often, and
  Connections lists every service; the intervals live in `shared/refresh.ts`.
- Invoices: what suppliers invoice (and the sales invoices sent), each tied to its supplier from Stock
  and to its file, with what's to pay, overdue and paid, notes, and totals by supplier. Invoices come
  in from the connected Gmail or Outlook (once reading it is allowed), by upload, or typed in; a
  Facturae e-invoice fills in its number, days and amounts by itself. The app records invoices, it
  doesn't issue them (that needs invoicing software that meets Verifactu).
- Tax: the returns an SL files (303, 111, 115, 202, 390, 190, 180, 347, 200 and the annual accounts) with
  their last days, marked to do, with the gestoría or filed; documents (invoices, receipts, payslips,
  statements) uploaded in bulk, a folder at a time, into the connected Google Drive or OneDrive under
  Business Agent/Tax, sorted by year, quarter and kind or into a folder chosen there.
- Stock: every wholesale item (beans, milk, cups, pastries) and the shop's own products, each with its
  supplier, link, cost and reorder level. The team records deliveries, counts and waste (or a whole
  stocktake at once); the order list groups what's low by supplier, with the order day and a message
  ready for WhatsApp or email. Suppliers keep their contact details, website, order page and order days;
  admins star the ones they rely on, and the page shows the active ones, the whole catalogue or the starred.
  Menu costing works out what each drink or dish costs from the stock in it (with variants such as oat
  milk or an extra shot, and a waste allowance) and its margin against the menu price; the Waste log
  takes what's thrown away and why off the stock, with its cost for admins. Anything still to be entered
  (a menu price, what goes in, an item's cost) is shaded, and a dish with nothing in it has no margin yet.
  Setup: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) sections 7-18.
- Leads & enquiries (Sales section): what someone asked for (a party, the terrace, office coffee), where
  it came in, its value, the day it's for and when to follow it up (a reminder in the bell that day).
  Each belongs to someone on Customers, added there as a lead when they're new; a won enquiry makes
  them a customer. **Quotes & estimates** are numbered Q-2026-001 on by the database, line by line with
  their IVA (21, 10, 4 or 0%) and a discount; one made from an enquiry moves it to Quoted, accepted it
  wins the enquiry, and an admin with pay access sends it to Invoices as a sales invoice to issue.
- Expenses & mileage (Accounts section): what someone spent for the business, or drove for it in their
  own car (kilometres, there and back, times the business's rate: €0.26 a km, what Spain lets it pay
  back without tax). Everyone sends their own; admins with pay access approve, pay back and add the
  receipt (Tax › Expenses); a finance gestoría reads. Not the running costs on Finances.
- Campaigns (Marketing section): one email, text or WhatsApp to the customers and leads who said yes to
  marketing, picked by type, tag and where they came from, with the count and how it reads for one of
  them. Planned ones are in the bell on their day. Sending from the app comes with Brevo or Mailchimp
  (on Connections, coming); until then the audience is exported and the campaign marked sent.
- Hiring (Team section): the jobs being filled (position, contract, hours, pay, where it's advertised)
  and who applied, stage by stage; an interview goes on the calendar for admins, and a hire is invited
  to the team in one step. Applicants not hired are kept a year (GDPR), then flagged to remove.
  InfoJobs, Indeed and LinkedIn Jobs are on Connections as coming.
- Tips (Team section): cash and card tips for a period (the till's card tips offered when one is
  connected) shared out by the hours on the timecards or equally, to the cent; everyone sees their own
  share once it's shared out and hears in the bell; a payroll gestoría reads.
- Food safety (Stock section): the APPCC's records. The fridges, freezer and jobs to check today, each
  recorded by whoever does it at the server's time; a reading out of range needs what was done and
  tells the admins in the bell. Records are never changed or deleted. **Allergens**: the EU's 14 on
  each stock item (contains and may contain), so every menu item on Menu costing has its allergens, and
  a variant what it adds (oat milk: gluten). Anyone serving picks what a customer can't have and sees
  what suits them; the chart exports for the counter.

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

In CI the browser tests run on 3 machines at once (Playwright shards, in Playwright's own image).
Branch pushes and pull requests run only the browser tests for the areas a change touches, plus the
core ones that always run (sign-in, landing page, permissions, privacy, café tablet PIN, partners):
see `scripts/ci/select-e2e.ts`, where each area lists its files and test titles. Shared code (app
shell, data layer, theme, config, the tests themselves) or an unknown file runs everything, and
deploys always run everything.

Uptime: `.github/workflows/ci.yml` runs all of the above on every push;
`.github/workflows/monitor.yml` smoke-tests the live site every 15 minutes (`e2e/smoke.spec.ts`:
site up, Supabase reachable, email/Google/Microsoft sign-in switched on). Set the repo variable
`PRODUCTION_URL` to turn it on.

A single-file clickable demo (sample data, no backend) builds with
`node scripts/build-demo-page.mjs` → `dist-demo/easy-beans-demo.html`.

## Deploy (Cloudflare)

Automatic: `.github/workflows/deploy.yml` runs every test, then deploys on each push to `main`
(or the working branch). It sets the Worker's secrets (service key from Supabase, a generated
`INTEGRATION_KEY`, and any integration secrets you add), points Supabase sign-in at the live
URL, and smoke-tests the live site. It needs two repo secrets (Settings → Secrets and variables →
Actions): `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Workers") and `SUPABASE_ACCESS_TOKEN`
(Supabase → Account → Access tokens). Optional: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` also
switch on Google sign-in.

Microsoft sign-in: run the **Set up Microsoft sign-in** workflow (or change
`ops/setup-microsoft.txt`). It prints a code to enter at microsoft.com/devicelogin, creates the
Entra app and switches the provider on in Supabase.

The first account to sign up becomes the admin; invite everyone else from the Team page.

### Custom domain

The app is served at <https://businesssagent.com> (and still at the workers.dev address). The
domain is registered at Vercel with its DNS on Cloudflare (free plan): Cloudflare only attaches a
Worker to a domain whose DNS it runs. Each deploy attaches the domain to the Worker
(`scripts/ops/custom-domain.mjs`) and points Supabase sign-in at it; the deploy summary says
what's missing if it can't. Every app's redirect URI can use either address, e.g.
`https://businesssagent.com/api/integrations/<app>/callback`.

## Use it from any AI

The app is an MCP server at `https://<worker-url>/mcp`. Each person connects their own AI and it
works with their permissions; every change is logged as made "via AI". **My account → AI
assistants** has the steps for each one, with the URL filled in:

- **Claude** (web, desktop, mobile): Settings → Connectors → Add custom connector → paste the URL → sign in.
- **ChatGPT**: Settings → Apps & Connectors → Advanced → Developer mode → Create → the URL, OAuth → sign in.
- **Claude Code**: `claude mcp add --transport http easy-beans https://<worker-url>/mcp`, then `/mcp` → Authenticate.
- **Cursor, VS Code (Copilot), Gemini CLI** and any other MCP client: add the URL; they sign in by themselves.
- **AIs that send a header instead of signing in** (the OpenAI and Anthropic APIs, n8n, agent
  frameworks): make a personal **access key** on My account and send `Authorization: Bearer ba_…`.

Try: *"Who's working on Saturday, and are any shifts still open?"*

## REST API

```
GET  /api/v1/openapi.json       OpenAPI 3.1 of every tool (import into GPT actions, n8n, Zapier, Make)
GET  /api/v1/tools              the tools you may use + JSON schemas
POST /api/v1/tools/{name}       run a tool, JSON body
Authorization: Bearer <personal access key>   (or a Supabase session token)
```

Access keys are made and revoked on My account; only a hash is stored, and a key acts as its
owner through a normal session, so the database rules apply exactly as in the app.

## Referrals

Account menu (your name, bottom left) → **Referrals** (admins): the business's link
(`/?ref=CODE`), how it's doing, and free months banked. Rules (`shared/referrals.ts`): when a
business you referred **finishes set-up**, you both get a month free, stacking up to 12, applied
when paid plans start. Until self-serve sign-up opens, the link shows "Invited by …" on the
sign-up page and a waitlist form (`worker/referrals.ts`: link opens are counted, joining keeps
business name, name and email; admins only can read them). When a referred business goes live,
call `select public.mark_referral_set_up('their@email')` as the service role; that is what counts.

## New business

Copy `shared/business.config.ts`, create a Supabase project (apply `supabase/migrations`, write a
seed like `supabase/seed/easy_beans.sql`), and deploy a new Worker with its own `wrangler.jsonc` vars.
