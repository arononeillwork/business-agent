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
- Public pages: landing page with sign-in at `/` and the four plans at `/pricing`
- Plans and billing: Free, Starter €39, Pro €79, Business €129 (2 months free), Enterprise by contact with sales, paid through Stripe
  subscriptions; an unpaid trial or failed renewal drops the business to Free, enforced by the
  database ([docs/billing.md](docs/billing.md))
- Partners: outside businesses (gestoría, suppliers) get a read-only login to the areas an admin
  picks (rota, payroll, finances, calendar). Enforced by database row security and in the AI tools.
- Team roles: everyone on the team is an **employee**, a **shop manager** or an **owner**, picked
  on the Team page when inviting them or later, or by asking Claude (`set_team_role`). Employees see
  their own shifts, clock-ins, time off and expenses; a shop manager runs the shop (rota, timecards,
  time off, stock, the team, settings) without pay, takings, finances or billing; an owner does all of
  it with pay, finances and billing. They're stored as the access the database already checks (an owner is an admin
  with pay access), and only an owner makes someone an owner or changes an owner
  (`shared/teamRoles.ts`, the `team_roles` migration). The owner was called the boss / CEO before; the AI
  connector still takes `boss` for it.
- Sign-in emails: an owner or shop manager changes the email someone signs in with on the Team page (their
  panel → Change email), for a typo or a new address; they sign in with it straight away, with the same
  password. Only an owner changes an owner's (`emailBlock()` in `shared/teamRoles.ts`, `/api/admin/set-email`).
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
- Reach, crews and each rep's own page (Sales reps & rewards): a rep's Instagram, TikTok, YouTube and Facebook
  with their followers, and the people they see in person (a gym's members, a studio's clients), add up to
  their reach. A reward marked "grows with reach" (stories, posts, shout-outs) is worth ×2 from 1,000 people,
  ×5 from 10,000 and ×10 from 50,000 (the `steeper_reach` migration; it was ×3 and ×5). A crew puts a coach with their fighters, or a studio with its teachers: the
  leader earns a share (10% to start) of everything the crew earns, as a line of its own. Anyone on the team
  adds people; someone an employee or a shop manager adds waits for an owner to say yes (only owners do), and
  what's logged for them meanwhile counts once they do. Each rep has a private link to their own page (`/rep/<link>`, no
  sign-in): what they've earned, their place this month, their code, their reach and crew; from it they tell
  the café what they shared and add people to their crew, both waiting for an admin. Instagram gives the
  followers of people who've messaged the café or mentioned it in a story (looked up when adding someone, and
  kept up to date every 15 minutes); everything else is typed in (the `rep_reach_and_crews` migration,
  `worker/repPage.ts`).
- At the till (Sales reps & rewards): how the café knows who brought whom. Someone new shows a rep's card or
  says their code as they pay; whoever's at the till types it (or the rep's name) into "At the till", and the
  reward opens with the card's one ready. "How many times" logs several at once (a coach who brought ten people:
  10), each its own line, so monthly limits and approvals work as for one; the assistant's `log_reward` takes
  `times` too. The usual rewards keep customers' credit small (50 cents a story, €1 a post or a friend brought
  in, more for a bigger reach) and give reps commission (€3 a new customer, up to 20 a month).
- Business Agent's own reps ([docs/REPS_PLAN.md](docs/REPS_PLAN.md)): people who know business owners sell Business
  Agent for us, run as a business of its own in the app, **Business Agent HQ**, on its Sales reps & rewards page. Each rep has
  a code (Julio, for cafés: JULIO27) and leads kinds of business (café, restaurant & bar, pub, salon & beauty, real estate,
  anything else). A business that signs up with a rep's link (`/?ref=JULIO27`) or types the code on Add my business gets its
  first month free, and an owner who forgot it adds it on Billing in the first 30 days. HQ sees every business its reps
  brought, by kind and one by one (signed up, set up, on a trial, paying, payment failed, cancelled). What a business pays for
  its plan, from Stripe, earns its rep €50 at the first payment and 20% (without IVA) for its first 12 paid months, from HQ's
  own list; each line waits 30 days, then counts by itself, and a refund or a lost dispute takes it back. Each rep's own page
  shows their businesses. The `hq_reps` migration makes HQ on the live database; its first owner is invited with the third line
  of `ops/invite.txt` (`hq`).
- Staff kitty (Team section): a share of each month's profit (5% to start; a month with a loss puts nothing
  in) and anything else put in (the tips jar, a bonus), saved up for goals chosen together, like the
  Christmas party or a pair of Ray-Bans for the café. The goals are jars on a shelf that fill with coffee
  beans in order, the first until it's full, then the next, each with when it'll be full at the pace money's
  been going in and whether that's in time for its date. Admins put last month's share in (worked out as
  Profit & loss does, or typed in), reorder and buy goals (what it cost comes out); the whole team sees it.
- Leaderboard (Team section, after the kitty): the team side by side for this week, last week, this month or last
  month (`/leaderboard?period=last_month`). **On time** is clocking in within 5 minutes of the shift's start, as
  Late starts on Dashboards counts it (the share, then how many, then the longest run); **On-time streak**, **Hours
  worked** (finished timecards) and **Checklist items** ticked off come from the app's own records, added up by the
  database (`team_leaderboard()`, the `team_leaderboard` migration), so everyone sees the board without reading each
  other's timecards. **Most sales** comes from Square: each payment says which Square team member took it, and each
  person is linked to theirs. Everyone sees how many sales each person rang up; how much is the owners' (admins with
  pay access), as with takings, and it needs the takings plan. People level on a board share a place. The AI
  connector's `team_leaderboard` reads the same (`shared/leaderboard.ts`, `worker/leaderboard.ts`).
- Square logins (Team page and the Leaderboard, admins): each person's own login at the till is their Square team
  member. On their Team panel (while Square is connected) an admin picks theirs, or presses **Add to Square** to make
  them a team member at every location (someone already in Square with their email is linked instead); **Square
  logins** on the Leaderboard does everyone at once, with **Match by email or name**. Square doesn't let apps set a
  passcode or permissions: the owner sets their passcode (the PIN for Square Point of Sale) in the Square Dashboard
  (Staff → Team), and Square then sends them the invitation. Needs Square's `EMPLOYEES_READ` and `EMPLOYEES_WRITE`:
  a business connected before asks to connect Square again (`shared/squareTeam.ts`). The café tablet's clock-in
  PINs are separate, and still switched off.
- Square PINs (the Leaderboard, **Show PINs** beside Square logins): each person's Square passcode, the PIN they sign
  in to the till with, in a dialog. Square's API can neither read nor set passcodes, so an owner types each one as it
  is in the Square Dashboard (Team → their name), and changes it here when it changes there. Owners (admins with pay
  access) see and change everyone's; everyone else on the team, shop managers included, has **Show my PIN** and sees
  only their own. The PINs are read when the dialog opens and gone when it closes. Kept encrypted with the Worker's integration key in a table nobody
  signed in can read (the `square_pins` migration, `worker/squarePins.ts`); each look, change and removal is in the
  audit log, without the PIN.
- People (Team section): the team as a hierarchy, the owners at the top, then the shop managers, then the
  employees, each with the roles they hold on Roles & responsibilities (admins open someone on the Team
  page from there). **Show pets** puts everyone's dogs (and cats) under them with their photos. Each person
  adds their own pets on My account → Pets, with a photo cut square in the browser and kept in the
  database (the `pets` migration, which also brings Aron's dogs Fudge and Cooper at Easy Beans); the whole
  team sees them, each person changes their own and admins anyone's. Partners and the café tablet see none.
- Roles & responsibilities (Team section): who does what. Each role (owner, shift lead, barista, kitchen,
  cleaner…) opens to what it's for, who it answers to, who's in it, the rota position it's worked as, and its
  duties by when they're done (all the time, opening, during service, closing, every week). Everyone reads it,
  with their own roles open and marked; admins add a café's usual roles in one press (in the language they use
  the app in), change them, put them in order, and see who has no role yet.
- Role permissions (Roles & responsibilities, three tabs): Active is the business's roles; Category is
  ready-made roles for a café, a restaurant & bar, a salon & beauty business or any business, each with its
  duties and what it can do, to add in one press; Permissions is every role against each area of the app
  (rota, time off, timecards, calendar, stock, food safety, waste log, to-do list) and what that gives each
  person. A role gives Hidden (out of their menu), Read (what the team always had) or Update (what an admin
  does there, never deciding their own time off or timecards); the database checks Update (`can_update()`).
- What the team sees of their role: a page their roles hide is out of their menu and doesn't open; the
  Business page, Opening hours and Dashboards are roles' areas too; a To Do List set to Own shows only the
  jobs given to them (the database keeps the rest from them, `todo_own_only()`). Under their name, and on
  My account as fixed values, is their role (Barista / Bartender) and their access; their Roles page shows
  just their own role. The café's front-line templates (barista, kitchen, cleaner…) leave out the Business
  page and Dashboards and give Own tasks; the barista's also hides the stock; owners have everything.
- More of a role's areas: Brand, Expenses and AI assistants (shown or not); the café's front-line templates
  leave them out, and a hidden AI assistants leaves the account menu too. People is first in the Business
  section; your own card there opens My account, where you add your pets with a photo.
- The team's languages (My account → Language, admins): with both English and Spanish, everyone gets the
  flags at the top to switch, and each person's own choice is kept on their account.
- The Menu is a role's area too (shown or not), and so are the Business page's Company details (CIF/NIF,
  currency, where team alerts go): hidden, the page shows just the contact details. The café's barista
  template also leaves out the Company details and the Menu, and shows the Business page; Easy Beans'
  Barista / Bartender role has its contact details but not the Company details, Brand, Dashboards, Menu or Expenses.
- Agents (owners): the **Agents** button at the top right switches the app to one part of the business's
  view: the Finance, Marketing, Sales, Operations, People & HR and Stock & purchasing agents, and the Investor.
  The menu then shows just that agent's pages (and Settings), a line at the top says whose view it is with the
  way back to everything, and Today leads with the agent's first questions. Each owner's choice is kept on
  their account; the owners turn agents on or off, rename them, pick their pages and add their own on Roles
  & responsibilities → Agents (`shared/agents.ts`; only an owner changes them, the `agent_views` migration).
- Role ownership (Roles & responsibilities → Ownership, owners): a lane for each owner and one for the roles
  nobody owns yet. Owners drag a role into someone's lane or along it (or move it from its Owner menu, on a
  phone or with the keyboard), and open it to read what it's for, its duties and who's in it, and change who's
  in it. The Active tab and each person's own role say who owns it (`shared/roleOwners.ts`; only an owner
  changes it, and only to an owner of the business: the `role_owners` migration).
- Staff rules (Team section): the house rules, in sections that open (being on time and clocking in, uniform
  and hygiene, food safety and allergens, phones, breaks, customers, the till, health and safety, respect).
  Each employee confirms they've read them and is asked again when a section is added or changed (what's new
  is open and marked; moving a section asks nobody); admins see who has read them since the last change.
  Starts from the usual rules for a café in Spain (free tap water, the hoja de quejas y reclamaciones, the
  14 allergens), to change to how the business works.
- Daily checklists (Business section, after the To Do List): what to do to open the shop at the start of the day and to close it at the
  end, each thing in English and Spanish, read in the language each person uses the app in (the other one
  when it has none yet), some with steps under them. It opens on the start of the day until halfway through
  the day's opening hours, then the end of it. Everyone on the team ticks things off as they go and sees who
  did each and when (an item with steps is done when they all are, and its box ticks them all); whoever
  ticked something, or an admin, unticks it, and each day starts clear. Admins add, change, order and remove
  things and steps. Easy Beans starts with the owners' own "Employee Checklist" (`shared/checklists.ts`, the
  `day_checklists` migration).
- Company values (Business section, first in the menu): what the business stands for and how the team
  behaves, a line each with points under some, and the words nobody says in the café, each in English and
  Spanish and read in the language each person uses the app in. The whole team reads them; admins add,
  change, order and remove them. Easy Beans starts with the owners' own (`shared/companyValues.ts`, the
  `company_values` migration).
- Contacts (Business section, after Business; owners only): the people the business calls on (the lawyer,
  the bank advisor, the plumber…), each with what they do (the usual jobs shown in each person's language),
  their company, and a button to call, WhatsApp, email or open their website. Only the owners see the page and
  add, change and delete contacts; shop managers, employees, partners and the café tablet see none. Easy Beans
  starts with its lawyer, its BBVA bank advisor and its plumber & electrician, on WhatsApp
  (`shared/contacts.ts`, the `business_contacts` migration).
- Today: a top row of small cards (your clock, who's on today with faces and start times, the café music),
  then today's takings against the day's breakeven for admins with pay access and a till: the figure, a
  bar that fills to the breakeven mark and goes green past it, and the day so far as a line against the
  breakeven line (`shared/todayGlance.ts`, the breakeven of `shared/dailyCost.ts`). Beside it this week's
  takings, the three lowest on stock and the first three jobs (pinned, starred, being done); each card's
  arrow opens its page. The lawyer's email is on Contacts (the `lawyer_email` migration).
- A page's own buttons sit on the right, in a row of their own under the top row; on a computer the page's
  title is in the top row, beside the round buttons (`PageHeader` in `src/components/common.tsx`).
- Content (Marketing section, admins): the business's own photos and videos in one place, ready for
  posts, offers, the menu and the screens. **From Google Photos** opens Google Photos' own picker (Google
  Photos is a connection of its own, on Connections → Photos); what's picked is copied into the café's
  Google Drive or OneDrive (Business Agent/Content), since Google's links last an hour, and listed with
  when it was taken. Business Agent sees only what's picked, never the rest of the library, and
  something picked again isn't added twice. **Upload** adds photos (kept as JPEGs) and MP4 or MOV
  videos from the device. Each has a title and tags to filter by; a few chosen make a post, a reel or a
  carousel on the Social planner, and each has a link to paste into an offer, a screen or the menu.
  Taking one off the page leaves the file where it is. Setup: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)
  section 21 (`worker/content.ts`, `shared/content.ts`, the `content_library` migration).
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
- To Do List → Calendar: the jobs still to plan on the left, the month or the week on the right. A job
  dragged onto a day of the month is for some time that day; onto a time in the week, it takes an hour
  from where it lands (to the quarter hour), is dragged to move it and its bottom edge pulled (or arrowed)
  to change when it ends; dragged back to the list, it's off the calendar. A click on any job sets its day
  and times by hand (`shared/todo.ts`, the `todo_calendar` migration).
- Legal (Business section): the business's legal documents (lease, company deeds, insurance, contracts,
  licences, policies) picked where they already are in the connected Google Drive or OneDrive (both can
  be connected; the admin chooses which), grouped by kind, shown in the page straight from the storage
  and opened there. Nothing is copied: only where each file is is kept. A gestoría with finances access
  reads. Setup: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) section 18.
- Legal & licences (Business section): Licences and Legal are one page, a tab each (Licences first;
  `/legal?tab=documents` opens the documents, and the old `/licences` link opens the page).
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

  The menu on **Google Maps** follows the app's, the way opening hours do: with the listing connected
  (Connections), what's on the menu with a price goes onto it within a minute of a change, made on the
  Menu page or read from Square, by section with each item's description, price and the other ways
  it's sold as options; items off the menu are left out, and photos stay as they are on Google. Google
  replaces the listing's menu with the app's (its cuisines and menu link are kept), only listings in a
  food and drink category take one, and it's part of the plans with Google Maps. The Menu page says
  when it last went, why Google refused it if it did, and has **Send to Google Maps now**.

  The menu on the business's **own website** follows it too: with **Share the menu with the website** on
  (Website & SEO, admins), the website reads what's on the menu, by section in the menu's order with each
  item's prices, photo and allergens, from `/api/site/<business>/menu` (no sign-in, nothing until the
  business turns it on, customer-facing fields only), so a change here is on the website within a few
  minutes. Easy Beans' website reads its menu this way ([docs/WEBSITE.md](docs/WEBSITE.md), `worker/site.ts`).
- Screens (Menu section, admins): the café's TVs and tablets as slideshows. Each has a secret link
  opened once on the screen (no sign-in), and slides added by address: pictures, MP4 videos, YouTube,
  Vimeo, Instagram posts, web pages, live pictures reloaded each time (a webcam), and the digital
  menus. Settings: how long each slide shows (or its own time; videos to their end), the change effect
  and its speed, shuffle, fill or fit, music (an MP3, a radio stream or YouTube) with its volume, videos'
  own sound, the time and a running line. The page previews the changes as they're made; the screen
  picks them up within a minute, keeps playing offline and stays awake.
- Slides in English and Spanish (Screens, admins): each slide has a tab for each language, with its own
  address (the poster or page in Spanish) or digital menu, and its own switch; the screen plays the English
  version, then the Spanish one, skipping a version that's off or has nothing to show, and a slide's own
  switch still turns both off. A picture shown whole ("Show all of it") sits on a blurred copy of itself
  rather than black borders, so a portrait poster suits a landscape TV (`shared/screens.ts`, the
  `screen_languages` migration).
- Short links and picture slideshows (Screens, admins): each screen has a short link to type on the TV,
  `/display-menu/<name>` (Easy Beans' first screen also opens at the bare `/display-menu`, the address its TV
  had before; another business's links carry its number, `/display-menu/2/<name>`), shown with a QR code and
  changed from its pencil; the secret `/display/<token>` link keeps working as the private one. **New picture
  slideshow** makes one kept simple, with its own `/slideshow/<name>` link: pictures from the device or by
  address, as big tiles, and the **Live offers' pictures**, a slide that plays the picture of each offer on
  now and takes it off when the offer ends (it can go on any screen too). The slides fold up to one line
  each, and a bar to save follows down the page while there are changes (`shared/screens.ts`,
  `worker/screens.ts`, the `screen_links` migration).
- Offers & specials (Marketing section, admins): a special or an offer for a set time (an hour, until
  the end of the day, 24 hours like a story, a week, or until a time picked), with its price, what it
  usually costs crossed out, details and a photo. It shows on the screens picked from the minute it
  starts to the minute it ends, in turn with each screen's slides (for its own seconds) or on its own,
  the screen showing nothing else; each screen gets its offers two days ahead and puts them on and takes
  them off by its own clock, offline too. Saving one can make its story (suggested) or post: the Social
  planner's composer opens with a picture drawn from the offer in the brand's fonts and colour, the offer
  as its note, going out as the offer starts, and the post is remembered on the offer.
- Last-day offers (Offers & specials and Stock, admins): stock on its final day to sell goes on offer
  by itself. An item says how long it sells for once it comes in ("1 day" for today's pastries), or a
  delivery gives its use-by date; Stock marks what's on its last day and what's past it (a link to log
  it on the Waste log as expired). Rules say which categories or items, the discount (a % off the
  item's usual price, or a set price such as "2 for €3"), from how long before closing, on which
  screens, and whether to suggest its story. Every minute the Worker runs `start_last_day_offers()`:
  from the rule's time until closing (by the opening hours; nothing on a closed day), each item on its
  last day with some left becomes an ordinary offer, labelled automatic, its usual price crossed out,
  once a day; admins hear about it in the bell. It stops like any offer. Nothing is charged or changed
  in Square: the team rings it up at the offer price. A café's usual rule (today's bakes, 30% off, two
  hours before closing) is there for each business, switched off until an admin turns it on.
- Offers from posts (Offers & specials and Screens, admins): **From Instagram** lists the business's latest
  posts (its Facebook Page's while Instagram isn't connected), the newest with an offer in it marked; picking
  one fills in a new offer from the caption (its first line as the name, "€3.50 (usually €4.50)", "2x1", "20%
  off", the rest as details, "today only" or "this weekend" for how long) with the post's photo, copied to
  the café's storage so it outlasts Instagram's link, on every screen that's on (or the screen it was
  opened from), to check before saving (`shared/offerFromPost.ts`, `worker/offerPosts.ts`).
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
- Stock → Freshly made: what the team makes for the counter (a banana bread, the day's sandwiches), how
  many, when, how long it keeps and when its discount starts (a % off the menu price or a set price). A
  batch with a discount puts itself on Offers & specials from then until it has to be gone, the menu price
  crossed out, on the screens; sold out or thrown away first, its offer ends (one still to come goes). The
  offer is tagged Freshly made and links back. The team records batches; finance partners read
  (`shared/freshBatches.ts`, the `fresh_batches` migration).
- Stock → Freshly made, first of Stock's tabs, opens on what's made here: the menu items with a set shelf
  life (pastries, yoghurt pots, chia puddings, cheesecakes), how long each keeps, when it was last made and
  by whom, its offer ("25% off for its last 2 days") and when the batch on the counter goes on it. The shelf
  life comes from Square when the item has a "Shelf life" custom attribute there (in days, or "36 hours"),
  read with the menu, or an admin sets it; a batch recorded of one starts from its shelf life and offer
  (the `fresh_items` migration, `worker/menu.ts`).
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
- Suggested campaigns (Campaigns → Suggested): ready-made ideas for a café (brand awareness, loyalty
  sign-ups, win-back, quiet afternoons, local partnerships, Google reviews asked for without any reward,
  the autumn, Christmas and summer menus, match nights, English speakers, office catering, a welcome for
  new sign-ups), each with why it helps, its channels, the effort, what to measure and when to send it,
  the ones for this time of year first (`shared/campaignIdeas.ts`). One press fills in a new campaign
  planned for that day; an idea already started isn't offered again. Each campaign's **Inactive** switch
  moves it to a folded section at the bottom, with no reminder, until it's switched back on.
- Hiring (Team section): the jobs being filled (position, contract, hours, pay, where it's advertised)
  and who applied, stage by stage; an interview goes on the calendar for admins, and a hire is invited
  to the team in one step. Applicants not hired are kept a year (GDPR), then flagged to remove.
  InfoJobs, Indeed and LinkedIn Jobs are on Connections as coming.
- Hiring board: the page opens on a board with a swimlane per job and a column per stage; cards are
  dragged to the next stage (or another job's lane) or moved from their menu, and filled or closed jobs
  with nobody left in the running are hidden until asked for. **Candidates** lists everyone who applied,
  whichever job, searched by name, email or phone and narrowed to a job or a stage; **Jobs** is the job
  by job view.
- Hiring CV pool: CVs kept for a job to come, with no job posted (a CV handed in at the counter, sent
  by email, passed on). Each person has the roles they'd suit, the day they can start and when they can
  work, notes, and their CV uploaded (a PDF, a Word document or a picture, up to 10 MB, kept in the
  database as `applicant_cvs`) or linked; a PDF or a picture opens in the page, any of them downloads.
  The pool is a tab on Hiring, and the whole page when there are no jobs. It's searched and narrowed to
  a role or to who can start now, and **Add to a job** puts someone on a job's board at Applied, CV and
  all. They're applicants with no job (`applicants.opening_id` null), kept a year as everyone who
  applied. Any applicant's CV can be uploaded the same way.
- Off the rota (Team): an admin switches someone off the rota on their Team panel (an owner, the
  business's own login). They still sign in; the rota gives them no row and doesn't offer them for a
  shift, unless they already have one that week.
- Contracts (Team page, a tab of its own: `/team?tab=contracts`): each person's employment contract under
  Spanish law (indefinido, a tiempo parcial, fijo discontinuo, temporal por circunstancias de la producción
  or por sustitución, formativo, or autónomo), with its dates, trial period, hours a week, gross salary (an
  hour, a month or a year), convenio (Hostelería de Málaga to start), job and category, and a link to the
  signed contract. Contracts ending within 30 days and trial periods ending soon are marked; the top shows
  who's on a contract, the hours a week and the gross pay a month. Admins add, change and end them; the
  salary is its own table, so only an owner (or a payroll gestoría) sees pay and a shop manager runs the
  contracts without it; everyone else sees their own (`shared/contracts.ts`, the `employment_contracts` migration).
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
- Dashboards → Reports (admins): pick reports (takings and breakeven, best sellers, team hours, low on
  stock, waste, freshly made, jobs) and a period, pick who gets them (people on the team, the business's
  contacts for owners, any address), see the email, and send it from the connected Gmail or Outlook, one
  email to each person (`shared/reports.ts`, `worker/reports.ts`). The choice is remembered. The Calendar's
  theme days and routine filters sit under a "More" chip at the end of the category chips.
- Scheduled reports (Dashboards → Reports): a report set to go by itself every day, on the days of the week
  picked or on a day of the month (1–28), at a time, in the business's time zone, covering today, yesterday,
  this or last week, this or last month or the last 30 days. The Worker sends what's due each minute, once
  (up to six hours late if it was down), written the same way as the page's (`shared/reportSections.ts`) from
  what whoever last changed the schedule can see, in their language; the page shows when each goes next,
  when it last went and why it didn't (`worker/reportSchedules.ts`, the `report_schedules` migration).
- Brand documents (Brand page): the guidelines PDF, logo packs and templates, uploaded (up to 10 MB,
  kept in the database) or picked where they are in Google Drive or OneDrive like the Legal page's.
  The team and partners read them; admins add, rename and remove them.
- Waste log entries can be changed or taken off by whoever logged them or an admin: the entry is
  marked undone and a correction puts its stock back, so the stock history still adds up.
- Suppliers are filtered by what they supply (drinks, food, coffee, fruit & veg, groceries), ticked on
  the supplier or worked out from its type, name and items. Allergens fills in the usual allergens and
  diet of every food and drink still to enter, from what each one is (`shared/allergenGuide.ts`), for
  an admin to check against the label. Competitors compares one item at every café, yours marked.
- Cameras (Business section, admins): the café's CCTV cameras, with their video in its own Google Drive or
  OneDrive, no subscription. Reolink cameras that plug in or take a network cable (an E1 Zoom inside, an E1
  Outdoor outside) send by FTP to Business Agent's camera upload server (`cameras/`, on Fly.io: Cloudflare
  can't take FTP); the page shows each one's picture every few seconds and whether it's sending, and its
  clips by day (Business Agent/Cameras/<camera>/<day>/), to play or keep for an incident. Only the video
  in which something moves is kept unless a camera keeps everything, and it's deleted after the days
  chosen per camera (1 to 30; Spain allows a month at most). Live video stays in the free Reolink app. The
  Set up tab has what to type into the camera, and Spain's rules (the sign, telling the team, no sound).
  Setup: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) section 20.
- The cost of running the business each day (`shared/dailyCost.ts`): the running costs on Finances spread
  over the days the café opens, plus the team on the rota that day (paid hours × pay rate × the
  employer's multiplier; the Staff wages estimate on Finances stands in where the rota can't be costed,
  so wages never count twice). **Sales** draws it as a red line over each day's sales, with how many days
  took more than they cost. On **Finances**, Staff wages opens the rota's hours and cost for this month or
  next, person by person (a missing pay rate typed in there), the costliest week and day, sets the
  estimate to the rota's figure in one press, and opens the **Rota** with each day's cost picked out
  (`/rota?costs=1&week=…`). The **Staff kitty** takes 10% (the owner's share, changeable) of each day's
  takings above that day's breakeven, shown day by day for this month (the `kitty_over_breakeven`
  migration; Easy Beans' 5% became 10%).
- Owners only: Settings → Pages (which pages the menu shows) is the owners'; the rest of the team has the
  menu the owners set. Staff benefits is the admins' (and a payroll gestoría's). On a big monitor the page
  grows wider and the top-right buttons grow with it. On the To Do List, "All" is the brand's rose.
- People: a login that isn't a person (the business's own shared login) is left off People by a switch on
  its Team panel ("On the People page"; the `people_page_and_pets` migration). At Easy Beans that's
  "Owner" (easybeanscafe@gmail.com): the owners on People are Aron and Mark. Yoda and Cooper, with their
  photos, are Mark's.
- Suppliers: each has an **Invoices** link beside its phone and email, opening Invoices for that supplier
  (`/invoices?supplier=…`) with its emails that have files, searched over the last year by its email,
  the addresses or domains its invoices come from (a field on the supplier: G&M Cash & Carry's come from
  Transgourmet's no-reply@transgourmet.es) or its name. The `supplier_invoice_senders` migration moved By
  Eric, Leo Foods, Lifestyle Customization, Pan Bendito Bakehouse, Santa Roaster and Yomilook to the
  catalogue.
- Owner pay (Finances → Staff wages, owners only): whether the owners' hours on the rota are wages. On, an
  owner on the rota costs their pay rate on the Rota, Staff wages, Profit & loss and Timecards like anyone
  else; off, their hours cost nothing there. The breakeven (the cost of running the business each day on
  Sales, Finances and the staff kitty) always counts the owners' hours at their rate (the `owner_pay_and_rates`
  migration, which also gives Easy Beans' Mark €10 an hour and Maria €9, and sets Staff wages to what
  November's rota costs at those rates).
- Music: only YouTube Music's playlists. A YouTube playlist whose name or songs say it isn't music
  (shoulder stretches, a refit timelapse) isn't offered: not in the café's list, your own or a search.
- Email (Business section, admins): the business's connected Gmail or Outlook as a list, read only,
  newest first. One chip at a time narrows it: unread, starred, important, with attachments, invoices &
  receipts (a file attached and the word invoice, factura, receipt or recibo), from a supplier (matched
  by the address or company domain on the Suppliers page) and customers & bookings (someone on Customers,
  or a reserva, booking or enquiry), with Gmail's own search, the last 7, 30 or 90 days or 12 months,
  and one supplier. Each email shows its sender (and supplier or customer), subject, preview, files and
  when it came, and opens in Gmail or Outlook. Reading the mailbox is the same permission as Invoices →
  From email; each list is kept 5 minutes (`worker/email.ts`, `shared/email.ts`).
- Theme days (Calendar, Menu section): **Coffees** lists the coffees in use, bag by bag (origin with its flag,
  region or farm, roaster, roast, process, tasting notes, espresso or filter, the bag's price and a photo of it,
  made small in the browser). Each theme (Colombian day 🇨🇴, Irish day 🇮🇪, Brazilian roast day 🇧🇷…) serves
  one of them and plays a playlist, and runs on a weekly rotation (none on a day the café is closed) or on a
  date set apart from it (St Patrick's Day). The Calendar leads with today's theme, its coffee and a button
  that plays the playlist on the café speaker (or opens it), and colours each day with its theme; admins
  change a day's theme from the day itself, and the rest on the **Themes** tab. Today and Music show
  today's too (`shared/themeDays.ts`, the `theme_days` migration, which starts Easy Beans on Irish, then
  Colombian, then Brazilian roast from Monday).
- Coffee suppliers (Coffees): under the coffees, the roasters they come from (the active suppliers that supply
  coffee, or that a coffee names as its roaster, by name or company name): their website, order page, phone,
  WhatsApp and email, the coffees each roasts, and, for admins, how to pay them by bank transfer (account
  holder, IBAN with a copy button, BIC, bank). A supplier's bank details are kept on Suppliers too, the IBAN
  in capitals without spaces and its check digits checked before saving (`shared/stock.ts`, `shared/themeDays.ts`,
  the `coffee_suppliers` migration, which adds Puchero, Easy Beans' roaster, with its Brasil Fazenda Boa Vista).
- Coffees' tabs and links (Coffees): an **Active** and an **Inactive** tab, each with its coffees and coffee
  suppliers; admins switch a coffee or a roaster between them on its card (a roaster switched off is archived on
  Suppliers too). Each coffee can link to its page on the roaster's website, a button on its card (the
  `coffee_links` migration, which gives Easy Beans' Brasil Fazenda Boa Vista its Puchero page and a bag photo).
- Weekly routine (Calendar): what's done on set days, every week, every few weeks or one week of the month
  (the stock take and buying list, the wholesale run, the cleaner, the accounts talk with the gestoría, the
  coffee machine's deep clean, the business meeting…), each with its time, who does it (someone or a role)
  and a checklist. Each day shows its activities under its theme in their category's colour; each person
  hides categories, single activities or the whole routine for themselves (kept in their preferences), and
  ticks things done; admins set the week up on the **Routine** tab and switch an activity off for everyone
  (`shared/routine.ts`, the `weekly_routine` migration with a café's usual week for Easy Beans).
- QR codes (Business section; the owner calls them barcodes, and `/barcodes` and search find them by it):
  the business's codes, each a link (the menu on the tables, the competition on the café screen), a Wi-Fi
  network (`WIFI:T:WPA;S:…;P:…;H:false;;`, so a phone joins without typing the password) or some text,
  with where it's used, the line printed under it, its colours (the brand's darkest colour that scans
  well, else black) and the brand's logo in the middle if wanted (then error correction H, else M). Drawn
  in the browser with `qrcode-generator`; each downloads as a 1024 px PNG or an SVG, or prints on A4, one
  large or four to cut out. A code waiting for what it says (a Wi-Fi without its network) asks for it and
  offers no download until it's there. The team sees and downloads them; admins add, change, order and
  remove them, starting from suggestions (the menu from the website, the competition, the Wi-Fi, a Google
  review when the business's Google place is known on Competitors) (`shared/qrCodes.ts`, the `qr_codes`
  migration, which starts Easy Beans with its Menu, Competition and Wi-Fi codes).

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

When Supabase freezes (sign-in and the data API stop answering), `.github/workflows/supabase-watchdog.yml`
restarts it once they've been unanswered for five minutes, then re-runs a deploy the freeze stopped. Why it freezes and
how to stop it: `docs/supabase-freezes.md`.

A single-file clickable demo (sample data, no backend) builds with
`node scripts/build-demo-page.mjs` → `dist-demo/easy-beans-demo.html`.

The landing page's demo video (`public/video/business-agent-demo.mp4`) is made in `video/`:
the app recorded in demo mode and the café's own website, put together with Remotion over music
written in code. `video/README.md` says how to make it again; it shows while `FEATURES.demoVideo` is on.

The **Demos page** (`/demos`, `src/pages/DemosPage.tsx`) has every video, each a different way of seeing the
app: the demo and a day in the life (also on the landing page), and "Run your café from one place", an
owner's morning from Today and the advisor (`public/video/run-your-cafe.mp4`, `FEATURES.ownerVideo`). A new
video goes on the Demos page only: add it to `DEMOS` in `src/pages/marketing/DemoVideo.tsx`. **Demos** in the
site menu, the footer and the end of the landing page's videos link to it.

"Just say it" (`public/video/just-say-it.mp4`, `FEATURES.sayVideo`), also on the Demos page, shows Business
Agent from the owner's own AI: added once as a custom connector, then typed to at the counter or talked to on
the phone, each change landing in the app and everywhere it shows at once, ending on "How much is your time
worth?" (`video/README.md`).

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

### Who owns each key

**Actions → Key owners → Run workflow** asks each provider whose account or app every key opens
(Stripe, Google, Meta, Microsoft, TikTok, Square, Cloudflare, Supabase, Anthropic…) and puts a table
in the run's summary: Business Agent's, Easy Beans', personal, or not shown. The apps every business
connects or pays through should be Business Agent's; one business's own account (Easy Beans' WhatsApp
number) should be its connection, not a key. Read-only, and it prints no key
(`scripts/ops/key-owners.mjs`). Run it again after moving a key to see that it took.

## Push notifications and bank holiday reminders

Each person can get their notifications on their phone or computer, even with the app closed:
Notifications → Push notifications → On this device. On an iPhone or iPad it works once the app is
added to the Home Screen (Share → Add to Home Screen) and opened from there. Under "How you're told"
each person picks, kind by kind, in the app, on my phone, or both. Nothing to set up: the deploy makes
the signing key (`VAPID_KEY`, `scripts/ops/worker-secrets.mjs`) once, and the Worker sends what's new
every minute in each person's language (`worker/push.ts`, `shared/pushText.ts`, with `public/push-sw.js` on the device).

Admins are reminded about each public holiday on the calendar a week ahead and again the day before,
at 09:00 (on for every business; Notifications → Bank holiday reminders sets how far ahead, which kinds, and leaves any one out).

## Gift cards

Loyalty & gift cards has two tabs: **Loyalty** (the stamp card and its members) and **Gift cards**
(`/loyalty?tab=gift-cards`). Gift cards lists every Square gift card with its last 4 digits, state,
balance left, the amount first loaded, when it was issued and last used, and whose it is; it opens on
the ones that can be spent, with what's still owed on them (a liability) at the top. **Copy number**
asks Square for that one card's whole number when pressed (`GET /api/giftcards/:id/number`); lists
and `provider_cache` only ever hold the last 4 digits (`worker/loyalty.ts`, `worker/providers/squareLoyalty.ts`).

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

Offers and screens from the AI: `latest_social_posts` (the business's own latest posts on Instagram, or its
Facebook Page while Instagram isn't connected, each with the offer read from its caption, and which is the
latest with one), `list_screens`, `list_offers` and `save_offer` (typed in, or `from_post: "latest"`: the
caption gives the name, price, crossed-out price, details and how long it runs, the post's photo is kept in
the café's storage, and it goes on every screen that's on unless `screens` names some). Try: *"Put the
special in my last Instagram post on the café TV."*

Contacts from the AI, for the owners: `list_contacts` (the people the business calls on, found by name, what
they do, company or a number) and `save_contact` (add someone or change them). Try: *"What's the plumber's
number?"*

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
when paid plans start. The link shows "Invited by …" on the landing page (opens are counted,
`worker/referrals.ts`) and leads to creating an account; the code is kept until the new business
is created, which puts it on the referrer's list ("Joined"), and it counts ("Set up") when the new
business finishes the set-up guide (`create_business()` and `business_set_up()` in the
`self_serve_sign_up` migration).

## New business

Any business signs up for itself: **Create account** on the landing page (email, or one tap with
Google, Apple, Facebook or Microsoft), then **Add my business** (its name, what kind it is, its
time zone). Its creator runs it (admin and owner) on the Free plan and goes straight on to the set-up
guide (`/setup`) to connect its apps. Someone joining an existing team signs up the same way and
asks their manager to add their email on the Team page.

Every business shares the one database, Worker and app, each seeing only its own data
(`docs/SEVERAL_BUSINESSES.md`). Easy Beans is business 1.
