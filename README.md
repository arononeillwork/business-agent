# Business Agent

Team app for small businesses, set up first for **Easy Beans Coffee** (San Pedro de Alcántara):
Square-style rota and time tracking, Spanish holidays and registro de jornada rules, and a
built-in **AI connector** so owners can run it by talking to Claude.

- Web app: installable on phones (Add to Home Screen) and the café tablet (kiosk with PINs)
- Menu: each person puts its sections in their own order and hides pages they don't use (Settings → Pages),
  and drags or pins pages within a section; admins can also hide a page for the whole team
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
- Team roles: everyone on the team is an **employee**, a **shop manager** or the **boss / CEO**, picked
  on the Team page when inviting them or later, or by asking Claude (`set_team_role`). Employees see
  their own shifts, clock-ins, time off and expenses; a shop manager runs the shop (rota, timecards,
  time off, stock, the team, settings) without pay, takings, finances or billing; a boss does all of
  it with pay, finances and billing. They're stored as the access the database already checks (a boss is an admin
  with pay access), and only a boss makes someone a boss or changes a boss
  (`shared/teamRoles.ts`, the `team_roles` migration).
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
  **Competitions** suggests giveaways and draws from the calendar, the quiet days, the big matches and
  the shop's stock (or one of your own), writes the bases legales in Spanish with Meta's line and the
  tax note when they apply, warns about what the platforms ban (a review to enter), and runs the
  entries (pasted Instagram comments, customers who said yes, a CSV) and a one-time random draw.
- Competitors (Marketing, admins): the cafés around the business, followed over time. What each
  charges for the same basket (the usual for a café in Spain, café con leche to matcha latte, or
  your own items; yours from Menu costing), every price kept with the day it was seen so rises
  show; what it offers (terrace, plant milks, brunch, dogs, delivery apps… thirty things, many read
  from Google); its hours; its Google rating and new reviews a month, week by week; and where each
  sits on price against rating. Notes from visits and ideas to borrow, from "to try" to "adopted".
  The page says what it all means in plain words: your prices against the area, what most nearby
  offer and you don't, what only you offer, who opens earlier or closes later, who's growing
  fastest on Google. Google (the Places key Reviews uses) finds the cafés nearby, looks again every
  week and tells admins in the bell when a new one appears or one closes; the AI connector reads it
  all and records prices and notes. Setup: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) section 16.
- Staff benefits (Team section): what everyone is entitled to in the business's country (`country` in
  `shared/business.config.ts`; Spain: 30 calendar days' holiday, 14 public holidays, sick pay from day 4,
  19 weeks' birth leave for each parent, nursing time, parental leave, and the Estatuto's paid leave for a
  wedding, a relative in hospital, a bereavement, a move…), each with who pays and its article, checked
  against the BOE on a stated date. Admins raise any amount (never below the law), add the business's own
  extras, give someone their own holiday for a year (their share when they start part-way, which Time off
  then holds requests to) and record leave for them. Everyone sees their own allocation (holiday taken,
  booked and left, sick days and other leave); admins and a payroll gestoría see the whole team.
- Sales reps & rewards (Sales section): the people who sell the café for it (someone on the team, an
  ambassador from outside it such as a hotel concierge or a yoga studio, or a customer who spreads the word),
  each with a code for their business cards (printable, ten to an A4 sheet, with what the card offers a new
  customer). The café's own list says what earns a reward and how much: a story reposted, a post with the café
  tagged, a new customer who shows a rep's card, an event or catering booked (a share of the sale), each with
  a monthly limit and, where it matters, an admin's approval. Customers earn credit to spend in the café; the
  team and ambassadors earn commission. The team logs rewards and takes credit off the bill at the till;
  admins approve what waits and record commission paid out (nobody approves or pays their own). Stories and
  posts about the café from Instagram are matched to reps by their handle, to reward in one press; a monthly
  leaderboard shows who sold most. Customers' credit is the whole team's to see, commission the admins' and
  the rep's own.
- Staff kitty (Team section): a share of each month's profit (5% to start; a month with a loss puts nothing
  in) and anything else put in (the tips jar, a bonus), saved up for goals chosen together, like the
  Christmas party or a pair of Ray-Bans for the café. The goals are jars on a shelf that fill with coffee
  beans in order, the first until it's full, then the next, each with when it'll be full at the pace money's
  been going in and whether that's in time for its date. Admins put last month's share in (worked out as
  Profit & loss does, or typed in), reorder and buy goals (what it cost comes out); the whole team sees it.
- Roles & responsibilities (Team section): who does what. Each role (owner, shift lead, barista, kitchen,
  cleaner…) opens to what it's for, who it answers to, who's in it, the rota position it's worked as, and its
  duties by when they're done (all the time, opening, during service, closing, every week). Everyone reads it,
  with their own roles open and marked; admins add a café's usual roles in one press (in the language they use
  the app in), change them, put them in order, and see who has no role yet.
- Staff rules (Team section): the house rules, in sections that open (being on time and clocking in, uniform
  and hygiene, food safety and allergens, phones, breaks, customers, the till, health and safety, respect).
  Each employee confirms they've read them and is asked again when a section is added or changed (what's new
  is open and marked; moving a section asks nobody); admins see who has read them since the last change.
  Starts from the usual rules for a café in Spain (free tap water, the hoja de quejas y reclamaciones, the
  14 allergens), to change to how the business works.
- Outsourcing (Team section, admins; a gestoría with finances access reads): the jobs done for the business by
  people and firms outside the team (social media, the books, cleaning, the windows, the coffee machine's
  service, pest control…). **Active** shows who does each job, the price agreed and how it's charged (a month,
  a year, an hour, a day, a visit or once for a project, with how many hours or visits so it adds up to a
  month), what's included, the contract dates (ending soon or past its end date marked) and how to reach
  them, with the total a month and a year; the usual jobs nobody does yet list how many options are on file.
  **Catalogue** is the freelancers, agencies and firms to choose from, grouped by job so the options sit side
  by side (starred first, then the best rated; the cheapest charged the same way marked, and who does it now),
  each with their usual rate, the business's own rating, their work and notes. Choosing someone gives them
  the job and ends it with whoever had it; **Past** keeps who did what. Someone who has done a job is
  archived, never deleted. Prices without IVA. The AI connector reads it all, adds people to the catalogue
  and gives or ends jobs.
- Licences (Business section): everything the business keeps open (licencia de apertura, SGAE
  and AGEDI/AIE for the music, the terrace permit, insurance, extinguisher and electrical checks, staff
  food handler certificates), each with its number, when it runs out, how often it renews, its cost
  and its document; one press marks it renewed, and admins are reminded in the bell beforehand.
- To Do List (Business section): the team's jobs by category, or as a kanban board (To do, Doing, Done)
  with jobs dragged across or moved from their menu. The board shows everyone's jobs, one person's (the
  owner's or an employee's) or nobody's yet, and each of those views keeps its own category filters.
- Legal (Business section): the business's legal documents (lease, company deeds, insurance, contracts,
  licences, policies) picked where they already are in the connected Google Drive or OneDrive (both can
  be connected; the admin chooses which), grouped by kind, shown in the page straight from the storage
  and opened there. Nothing is copied: only where each file is is kept. A gestoría with finances access
  reads. Setup: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) section 18.
- Menu (its own section): the menu as customers see it, by section, with each item's photo, price,
  description and variants; everyone on the team reads it, admins add, arrange and take items off the
  menu, and move items and whole sections up and down. The items are Menu costing's own (one list, two
  views). Allergens and diets aren't kept on the menu: each item's come from what goes into it on Menu
  costing and its ingredients' allergens (the **Allergens** page), so the Menu page, the printed menus
  and the screens say what the Allergens page says. An item with nothing in it on Menu costing shows
  no allergens or diet badges until it has; one with an ingredient whose allergens aren't entered yet
  shows none on the printed and screen menus. Finding what suits a customer, and the allergen chart to
  print, are on the Allergens page. Where the menu comes from is a choice: **Custom** (the default: kept
  on this page, starting from the café's printed Drinks, Food and The Fridge menus, hot and iced prices
  included) or **Square** (read from the Square item library every hour and on demand, its modifiers as
  extras; photos, featured and off the menu are still set here). **Design** (admins) makes the **physical** menus (A4, A3, A5, printed
  or saved as PDF at their paper size) and the **digital** ones (16:9 or 9:16, for the screens), each
  previewed on paper or on a TV: the app writes the menu from the items (names and prices always
  right, the writing sized to fit), **boxed** like the printed menus (logo, each section in a rounded
  box, hot and iced side by side, allergens as coloured letters, an illustration strip at the bottom) or
  as one **classic** list over an image; or an image is the whole menu. Images
  are made with AI through **Higgsfield** (the business's own API key: Ideogram, Recraft in the brand's
  colours, Qwen for photos and changes), uploaded or linked, kept in the café's Drive or OneDrive;
  items' photos can be made with AI too. Setup: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) section 19.
- Screens (Menu section, admins): the café's TVs and tablets as slideshows. Each has a secret link
  opened once on the screen (no sign-in), and slides added by address: pictures, MP4 videos, YouTube,
  Vimeo, Instagram posts, web pages, live pictures reloaded each time (a webcam), and the digital
  menus. Settings: how long each slide shows (or its own time; videos to their end), the change effect
  and its speed, shuffle, fill or fit, music (an MP3, a radio stream or YouTube) with its volume, videos'
  own sound, the time and a running line. The page previews the changes as they're made; the screen
  picks them up within a minute, keeps playing offline and stays awake.
- Documents (Business section): every file kept in the café's own Google Drive or OneDrive (the Tax
  page's, invoices brought in by email, licences' documents, and contracts, insurance policies and
  certificates kept here), all years in one list with what each belongs to (an invoice, a licence, the
  Tax page), a title, tags and when it runs out; searched and filtered by kind, year and what it belongs
  to. Browse storage looks inside the Business Agent folder there (folders and files, kept ones marked,
  each opened in Drive or OneDrive) and uploads into its Documents folder or a new folder made in it.
  Admins with pay access; a gestoría with finances access reads the list.
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
- Credit & debit (Accounts section): money the business still has to pay back (a loan from someone, a
  machine bought on finance) and money still to come in or that could be raised (something to sell, like
  the old coffee machine, a deposit, money it's owed), each with its regular payment and next date. Each
  payment made or received is recorded as it goes: a repeating one moves on to its next date and what's
  paid off is settled. The grants from Grants show here too (what was asked for while applying, what was
  awarded once it is, less what's come in), each opening at its application; money received on a grant
  is recorded from either page. AI connector: `credit_and_debit`, `record_credit_debit_payment`,
  `save_credit_debit`. A gestoría with finances access reads.
- Tax: the returns an SL files (303, 111, 115, 202, 390, 190, 180, 347, 200 and the annual accounts) with
  their last days, marked to do, with the gestoría or filed; documents (invoices, receipts, payslips,
  statements) uploaded in bulk, a folder at a time, into the connected Google Drive or OneDrive under
  Business Agent/Tax, sorted by year, quarter and kind or into a folder chosen there.
- Stock: Current stock shows how many of each item are in and where, what's low and its worth. The
  team records deliveries, counts and waste (or a whole stocktake at once); the order list groups what's
  low by supplier, with the order day and a message ready for WhatsApp or email. Wholesale lists every
  item bought (beans, milk, cups, pastries) and the shop's own products by supplier, with the link to
  order it, its cost with and without IVA, each price change kept over time (what went up, by how much
  and when) and the shop margin; a supplier's price list imported again updates the prices already
  there. Suppliers keep their contact details, website, order page and order days; admins star the ones
  they rely on, and the page shows the active ones, the whole catalogue or the starred.
  Menu costing works out what each drink or dish costs from the stock in it (with variants such as oat
  milk or an extra shot, and a waste allowance) and its margin against the menu price; the Waste log
  takes what's thrown away and why off the stock, with its cost for admins. Anything still to be entered
  (a menu price, what goes in, an item's cost) is shaded, and a dish with nothing in it has no margin yet.
  Setup: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) sections 7-18.
- Leads & enquiries (Sales section): what someone asked for (a party, the terrace, office coffee), where
  it came in, its value, the day it's for and when to follow it up (a reminder in the bell that day).
  Each belongs to someone on Customers, added there as a lead when they're new; a won enquiry makes
  them a customer.
- Expenses (Accounts section): what someone spent for the business, or drove for it in their
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
  The menu shows as cards tagged with what each item suits (vegan, vegetarian, gluten, dairy, nut and
  egg free), with a filter for each, the other allergens one by one, a category and a search; a variant
  that suits counts (a flat white with oat milk). Each stock item also says whether it's vegan,
  vegetarian or neither, which the database checks against what it contains.
- Insights: **Dashboards** are each person's own reports (kept in their preferences), made of widgets
  over today, this week, this month or the last 30 days, each against the period before: takings,
  payments, average sale, takings by day, hour and day of the week, best sellers, how people paid,
  team cost and its share of takings, hours worked, who's on today, late starts, what's low, stock
  value, waste, the lowest margins, Google reviews, prices against the area, the jobs to do and the
  advisor's findings. Two templates to start from: Executive and Shop manager. The **Business advisor**
  (admins) reads the last eight weeks (`shared/insights.ts`) and says what to try: an hour to open
  later or close earlier, busy first or last hours, weak days, the peak hours, the trend and the
  average sale, best and slow sellers, prices below the margin aimed for or below the area's, staffing
  against takings day by day, team cost against takings, late starts and forgotten clock-outs, waste,
  what's low and reviews waiting for a reply. Today opens with the same figures at a glance.
- Brand documents (Brand page): the guidelines PDF, logo packs and templates, uploaded (up to 10 MB,
  kept in the database) or picked where they are in Google Drive or OneDrive like the Legal page's.
  The team and partners read them; admins add, rename and remove them.
- Waste log entries can be changed or taken off by whoever logged them or an admin: the entry is
  marked undone and a correction puts its stock back, so the stock history still adds up.
- Suppliers are filtered by what they supply (drinks, food, coffee, fruit & veg, groceries), ticked on
  the supplier or worked out from its type, name and items. Allergens fills in the usual allergens and
  diet of every food and drink still to enter, from what each one is (`shared/allergenGuide.ts`), for
  an admin to check against the label. Competitors compares one item at every café, yours marked.

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
Branch pushes (and pull requests from forks) run only the browser tests for the areas a change touches, plus the
core ones that always run (sign-in, landing page, permissions, privacy, café tablet PIN, partners):
see `scripts/ci/select-e2e.ts`, where each area lists its files and test titles. Shared code (app
shell, data layer, theme, config, the tests themselves) or an unknown file runs everything, and
deploys and the merge queue always run everything.

Uptime: `.github/workflows/ci.yml` runs all of the above on every push;
`.github/workflows/monitor.yml` smoke-tests the live site every 15 minutes (`e2e/smoke.spec.ts`:
site up, Supabase reachable, email/Google/Microsoft sign-in switched on). Set the repo variable
`PRODUCTION_URL` to turn it on.

A single-file clickable demo (sample data, no backend) builds with
`node scripts/build-demo-page.mjs` → `dist-demo/easy-beans-demo.html`.

## Deploy (Cloudflare)

Changes reach `main` through pull requests and the **merge queue** (`.github/workflows/merge-queue.yml`,
rules for sessions in `CLAUDE.md`).

1. Open a pull request into `main` once the branch's own CI is green (not a draft; label it
   `queue:hold` to keep it out).
2. The queue merges it with `main` and the other ready ones, settles the conflicts where both sides
   only added lines, and gives new migrations a free number when theirs is taken.
3. It runs every test on the result and moves `main` to it.

A pull request it can't settle gets a comment naming the files. The repo secret `QUEUE_TOKEN` (a
fine-grained token for this repo with Contents and Workflows read and write) lets it
land pull requests that change workflows too.

Automatic: `.github/workflows/deploy.yml` runs every test (unless the merge queue just did, on the
same commit), applies new migrations to the live database by name (`scripts/ops/migrate.mjs`), then
deploys on each push to `main`. It sets the Worker's secrets (service key from Supabase, a generated
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

On football match days Spanish internet providers block many Cloudflare addresses (LaLiga's
court orders), and both addresses above can stop opening from Spain until the match ends. The
backup address <https://businesssagent.vercel.app> is the same app through Vercel: a project
(`business-agent`) holding only `ops/vercel-backup/vercel.json`, which passes every request to
the Worker. Nothing is deployed twice; each deploy shows on it straight away. Sign-ins started
there come back there (`scripts/ops/supabase-auth.mjs`). Links the Worker builds (invite emails,
connection and billing returns) still use the workers.dev address.

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

Licences and documents from the AI: `list_licences` (status, when each runs out, its document, the usual
ones not on file yet), `save_licence` (add one from a preset like `sgae`, point it at its document with a
link such as the file in Drive, mark it renewed) and `find_documents` (search the kept documents).
Uploading a file stays on the Documents and Licences pages: the app only reaches files it put in Drive.

The **AI assistants** page (account menu → AI assistants, `/ai-assistants`) shows the connector address
with a copy button, the steps for Claude, ChatGPT, Claude Code and other AIs, things to ask, and the
person's access keys (make one, shown once; revoke).

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
