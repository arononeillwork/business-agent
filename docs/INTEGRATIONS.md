# Connecting Google, WhatsApp, social media, Stripe, Square and SumUp

Everything below is built and tested in the app; each service only needs your account and a
few keys. Keys are Worker secrets (Cloudflare → Workers → business-agent → Settings →
Variables and secrets), never committed to the repo.

Common secret, set once:

| Secret | What |
|---|---|
| `INTEGRATION_KEY` | Any random string of 32+ characters. Encrypts stored Google tokens and signs sign-in links. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API keys → secret key. Needed for the outbox, invites and cron jobs. |

How delivery works: every message, post and Google update is written to the `outbox` table in
the same database transaction as the change that caused it. A Worker cron delivers it every
minute and retries failures after 1, 5, 15, 60 and 240 minutes before marking it failed. The
Alerts page shows everything sent, waiting or failed.

---

## 1. Sign in with Google or Microsoft / Outlook (staff login)

The app always opens on the sign-in screen; nothing is shown until someone signs in. The
"Continue with Google" button is already in place (PKCE flow via Supabase). To switch it on:

1. **Google Cloud Console** → create or pick a project → *APIs & Services → OAuth consent screen*:
   External, app name "Easy Beans Team", support email, authorised domain = your site's domain.
   Scopes: `openid`, `email`, `profile` only.
2. *Credentials → Create credentials → OAuth client ID → Web application*.
   - Authorised JavaScript origins: your site URL (e.g. `https://business-agent.<you>.workers.dev`)
     and `http://localhost:5173` for development.
   - Authorised redirect URI: `https://lhakrmmoxaareykglmtx.supabase.co/auth/v1/callback`
3. **Supabase** → *Authentication → Sign In / Providers → Google* → enable, paste the client ID
   and client secret → Save.
4. **Supabase** → *Authentication → URL Configuration*:
   - Site URL: your site URL.
   - Redirect URLs: `https://<your-site>/**` and `http://localhost:5173/**`.
5. Optional but recommended: *Authentication → Sign In / Providers → turn off "Allow new users to sign up"*
   for email. Invites still work.

Who gets in: only invited people. An invited email that signs in with Google lands straight in
the app (Supabase links the Google identity to the invited account). Anyone else who signs in
with Google sees "Your account isn't active yet" and nothing else.

### Microsoft (Outlook, Hotmail, Microsoft 365)

Supabase calls this provider **Azure**. The "Microsoft" button under the sign-in form uses it.

1. **Azure portal** (<https://portal.azure.com>) → *Microsoft Entra ID → App registrations → New registration*.
   - Name: "Easy Beans Team".
   - Supported account types: **Accounts in any organizational directory and personal Microsoft
     accounts** (so both @outlook.com / @hotmail.com and work Microsoft 365 accounts work).
   - Redirect URI: *Web* → `https://lhakrmmoxaareykglmtx.supabase.co/auth/v1/callback`
2. Copy the **Application (client) ID**. Then *Certificates & secrets → New client secret* and copy
   the secret **Value** (not the ID). Note its expiry date; the monitor goes red when it lapses.
3. *API permissions*: keep `User.Read`, add `openid`, `email`, `profile` (Microsoft Graph, delegated).
   *Token configuration → Add optional claim → ID → email*.
4. **Supabase** → *Authentication → Sign In / Providers → Azure* → enable, paste the client ID and
   secret. Leave *Azure Tenant URL* empty (it defaults to `common`, which allows personal and work
   accounts) → Save.
5. Same rule as Google: only invited emails get in. The invite must go to the same address the
   person signs in to Microsoft with.

### Checking it stays up

`/api/health?deep=1` reports whether Supabase answers and which sign-in methods are switched on.
`.github/workflows/monitor.yml` runs `e2e/smoke.spec.ts` against the live site every 15 minutes and
fails (GitHub emails you) if the site, Supabase, or email/Google/Microsoft sign-in is down. Set the
repo variable `PRODUCTION_URL` to switch it on; add secrets `SMOKE_EMAIL`/`SMOKE_PASSWORD` for a
low-privilege test account to also test a real sign-in.

## 2. Google Maps opening hours, closures and posts (Google Business Profile)

1. Same Google Cloud project → enable **My Business Business Information API**,
   **My Business Account Management API** and **Google My Business API** (posts).
2. Request API access: <https://developers.google.com/my-business/content/prereqs> (Google
   approves Business Profile API access; allow a few days).
3. Credentials → the same (or a new) Web OAuth client → add redirect URI
   `https://<worker-url>/api/integrations/google/callback`.
4. Worker secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
5. In the app: Connections → **Connect Google**, sign in with the Google account that
   owns the Easy Beans listing. Use **Compare with Google** once to decide which hours are right.

After that, changing opening hours in the app, adding a business closure ("Closed …") or, if
ticked, public holidays updates Google automatically within a minute.

Opening hours also come the other way: every 15 minutes the Worker reads the listing's hours, and
if they were changed on Google Maps (by you, or by Google from a suggested edit) the app takes them
and admins get a notification. Whichever side changed wins; if both changed since the last check,
the app wins. The first check after connecting sends the app's hours, so use **Compare with
Google** first if Google's are the right ones. Closures and phone only go app → Google.

## 3. WhatsApp (Meta Cloud API, direct)

1. <https://developers.facebook.com> → Create app → Business → add **WhatsApp**.
2. Meta Business Suite → verify the business (Easy Beans documents).
3. WhatsApp → API Setup → add the business phone number. It can't also be used in the normal
   WhatsApp app. Note the **Phone number ID** → Worker var `WHATSAPP_PHONE_NUMBER_ID`.
4. Business Settings → System users → add an admin system user → generate a **permanent token**
   with `whatsapp_business_messaging` and `whatsapp_business_management` → secret `META_ACCESS_TOKEN`.
5. App settings → Basic → **App secret** → secret `META_APP_SECRET`.
6. WhatsApp → Configuration → Webhook: callback `https://<worker-url>/api/webhooks/whatsapp`,
   verify token = any string you choose → secret `WHATSAPP_VERIFY_TOKEN`. Subscribe to `messages`.
7. WhatsApp Manager → Message templates → create these (category Utility, language Spanish `es`):

| Template name | Body (variables in order) |
|---|---|
| `shift_reminder` | Hola {{1}}, tu turno empieza a las {{2}} ({{3}}). ¡Hasta ahora! |
| `missed_clock_in` | Hola {{1}}, tu turno empezó a las {{2}} y no has fichado. ¿Todo bien? |
| `missed_clock_in_admin` | {{1}} no ha fichado para el turno de las {{2}}. |
| `rota_published` | Hola {{1}}, tus turnos de la semana del {{2}}: {{3}} |
| `time_off_requested` | {{1}} ha pedido tiempo libre: {{2}} ({{3}}). Revísalo en la app. |
| `time_off_decided` | Hola {{1}}, tu solicitud para {{2}} ha sido {{3}}. |

8. In the app: Connections → WhatsApp → **Send test** to your own number.

Staff turn messages on under **My account** (their consent, as GDPR requires). Replying `STOP`
or `BAJA` turns them off.

## 4. Instagram (one click for each business)

Each business connects its own Instagram with one click ("Connect Instagram", sign in on
instagram.com, allow). One Meta app serves every business; it is set up once:

1. <https://developers.facebook.com/apps> → **Create app** → use case *Manage messaging & content
   on Instagram* (type Business).
2. **Instagram → API setup with Instagram login** → note the **Instagram app ID** and
   **Instagram app secret** → GitHub repo secrets `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET`
   (the deploy passes them to the Worker).
3. Same page → **Set up Instagram business login** → OAuth redirect URI:
   `https://<worker-url>/api/integrations/instagram/callback`.
4. Until the app passes Meta's App Review (Advanced Access for `instagram_business_basic` and
   `instagram_business_content_publish`), only Instagram accounts added under **App roles →
   Instagram testers** can connect. Add the café's account there (and accept the invite in
   Instagram → Settings → Apps and websites), then press **Connect Instagram** in the app.
5. The account must be professional (Business or Creator).

**Photos and videos for posts.** Instagram (like Facebook, TikTok and Google) doesn't take files
from apps: it fetches each photo or video from a public web address when it posts. They live in
the café's own storage, the connected **Google Drive or OneDrive** (Connections → Files and
storage), in `Business Agent/Social/Posts`, `Carousels`, `Reels` and `Stories`. Business Agent
hands Instagram a signed address (`/media/g|o/<file>/<signature>.<ext>`) that opens only files it
saved there. Free: it uses the storage that comes with the account (15 GB on Google). If the
deploy has Cloudflare R2 (bucket `business-agent-media`), that's used when no Drive or OneDrive is
connected. Photos are sent as JPEG up to 8 MB (the app converts them, and crops feed photos to
between 4:5 and 1.91:1); videos MP4 or MOV up to 100 MB.

**Social planner.** Posts (one photo; Facebook, LinkedIn and Google Maps also take text only), carousels
(2–10 photos or videos), reels (one video, 3 s–15 min) and stories (one photo or video up to
60 s); carousels, reels and stories go to Instagram only for now. Each can **post automatically**
at its time (only offered once Drive or OneDrive is connected) or be a **reminder**: at the time
admins get a notification, the post shows under "Your turn to post" with the caption to copy and
the files to download, and whoever posts it marks it posted. Stickers, music and links on stories
are added in the Instagram app, so use a reminder for those. Instagram allows 100 posts a day
through the API; a carousel counts as one.

"Connected" means the app signed in, read the profile and posts, and was allowed to post. The
60-day access is renewed every night; if it stops working, admins get a notification.

The Connections page then shows followers and recent posts, and calendar events get a **Share**
button that posts to Instagram and the Google listing together.

**Messages page (Instagram DMs).** Connecting also asks for `instagram_business_manage_messages`
(read and answer direct messages) and `instagram_business_manage_comments` (posts the business is
tagged in); add both to the app's Instagram use case in the Meta dashboard. In the Instagram app,
turn on Settings → Messages and story replies → Message controls → **Allow access to messages**.
Connect works from Messages or Connections (it's one connection). What Instagram allows:
- chats and their 20 latest messages: text, photos, videos, voice messages, story mentions, story
  replies and shared posts; replies by text within 24 hours of the customer's last message;
- after that, up to 7 days, a person's reply goes with the `HUMAN_AGENT` tag. Add the **Human
  Agent** feature to the app's Instagram use case (Permissions and features); accounts with a
  role on the app can use it straight away, others once Meta's App Review approves it. Without
  it, the Messages page says so and points to the Instagram app;
- each customer's name and profile photo (User Profile API), looked up at most every 6 hours
  (Instagram's photo links expire after a few days);
- no Primary / General / Requests folders through the API (every chat shows together), and
  messages read here aren't marked read in the Instagram app until someone replies.
An account that declined messages still connects (posting is what "connected" needs); the Messages
page then asks to connect again with "Manage messages" ticked.

Not possible through Meta's API: editing the Instagram bio. Keep the bio link pointing at a page
that shows current hours (Google Maps listing), which the app keeps up to date.

## 5. Spotify (approved café playlist)

Licensing first: Spotify's standard plans are for personal use, and background music in a
Spanish café also needs SGAE/AGEDI licences. Spotify's business service, Soundtrack Your Brand,
covers both. The connection below works with any Spotify account; the licence is your call.

1. <https://developer.spotify.com/dashboard> → Create app → Web API.
   Redirect URI: `https://<worker-url>/api/integrations/spotify/callback`.
2. Worker secrets: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`.
3. In the app: Connections → **Connect Spotify** (one click, sign in with the café's
   Spotify account) → choose the **approved playlist**.
4. Keep Spotify open on the café speaker or tablet. Staff then see **Café music** on Today and can
   play or pause the approved playlist; it flags when something else is playing.

Play/pause from the app needs Spotify Premium. New Spotify apps start in development mode, which
is fine for one café account (add the café's Spotify email under the app's User Management).

## 6. Music page (each person's own Spotify or YouTube Music)

The Music page is locked until the person connects their own account. It reuses the apps above,
with the same redirect URIs, so there is little extra to set up:

- **Spotify**: the Spotify app from section 5. While it is in development mode Spotify only lets
  in people listed under the app's **User Management** (up to 25): add each team member's
  Spotify email there, or apply for extended quota. "Play on my devices" needs Premium; the
  player in the page works for everyone.
- **YouTube Music**: the Google OAuth client from sections 1-2. In the same Google Cloud
  project enable **YouTube Data API v3**, and under the OAuth consent screen add the scope
  `youtube.readonly` (and, while the app is in Testing, add team members as test users).
  Playlists play in the page with YouTube's embedded player; private playlists can't be
  embedded, so the page offers **Open** in YouTube Music for those.

Tokens are encrypted with `INTEGRATION_KEY` and stored per person (`music_accounts`), readable
only by the Worker. People can disconnect at any time from the Music page.

## 7. Facebook Page (Social planner and Messenger)

Posts go to a Facebook **Page** (not a personal profile). It uses a Meta app with Facebook Login
for Business; the WhatsApp app from section 3 can be reused.

1. <https://developers.facebook.com/apps> → your app → **Add product → Facebook Login for
   Business** → Settings → Valid OAuth redirect URIs:
   `https://<worker-url>/api/integrations/facebook/callback`.
2. App settings → Basic → **App ID** → GitHub repo secret `META_APP_ID` (the app secret is the
   `META_APP_SECRET` from section 3).
3. Permissions: `pages_show_list`, `pages_manage_posts`, `pages_read_engagement` and
   `pages_messaging` (the Page's Messenger chats, on the Messages page). Until App Review grants
   Advanced Access, only people with a role on the app (App roles → Roles) can connect.
   For Messenger, also add the **Messenger** use case (App Dashboard → Use cases → *Engage with
   customers on Messenger from Meta*) and connect the Page there. Until `pages_messaging` has
   Advanced Access, the Messages page only shows chats with people who have a role on the app
   (admins, developers, testers); real customers' messages appear once App Review approves it.
4. In the app: Connections → **Connect Facebook**. If the account manages several Pages, choose
   the one to post to under **Facebook details → Page to post to**.

"Connected" means the app signed in, found the Page and holds a Page token allowed to post.

**Messenger (Messages page).** As soon as Facebook is connected, **Messages → Messenger** shows the
Page's chats (an empty inbox until someone writes), and **All** puts them next to Instagram's, newest
first. They're read live from Facebook; nothing is stored. Replies follow Messenger's rules: within
24 hours of the person's last message a normal reply, up to 7 days a personal one (the *Human Agent*
tag: add the **Human Agent** feature to the Meta app), after that only from Meta Business Suite.
`pages_messaging` is optional: a Page connected before Messenger was added, or with that box
unticked, keeps posting, and the Messages page asks to connect Facebook again.

## 8. TikTok (Social planner)

1. <https://developers.tiktok.com> → Manage apps → **Create app** → add **Login Kit** and
   **Content Posting API** (turn on *Direct Post*).
2. Login Kit → Redirect URI: `https://<worker-url>/api/integrations/tiktok/callback`.
3. Content Posting API → **Verify domain** (URL prefix) for `https://<worker-url>/`: TikTok pulls
   each photo from our own domain, so the domain must be verified.
4. Scopes: `user.info.basic`, `video.publish`.
5. **Client key** and **Client secret** → GitHub repo secrets `TIKTOK_CLIENT_KEY`,
   `TIKTOK_CLIENT_SECRET`.
6. Until TikTok audits the app, posts can only be **private** (visible to the account only), and
   only accounts added as target users in the sandbox can connect. The app says so on the TikTok
   tile. Submit the app for audit to post publicly.

TikTok photo posts need a JPEG photo (`.jpg`/`.jpeg`); the planner checks this before scheduling.
Access lasts a day and is renewed automatically with the 1-year refresh token.

## 9. Square (Sales and takings)

The till is **Square or SumUp** (one at a time: connecting one replaces the other). **Stripe** is for
online payments and can be connected on top of either: Sales and Finances then add the two up, and
Sales shows how much came through each ("Where sales came from"). Square gives the most: best
sellers on the **Sales** page, and the takings on Finances.

**Once, for the whole app** (the Business Agent's own Square app; each business then signs in to its
own Square account with one click):

1. Go to <https://developer.squareup.com/apps>, sign in with any Square account and press **+**
   (Create an application). Name it "Business Agent".
2. Open the app → **OAuth** (left menu). At the top, pick **Production** (real takings) or
   **Sandbox** (test data). Set **Redirect URL** to
   `https://business-agent.arononeillwork.workers.dev/api/integrations/square/callback` → Save.
   Square takes one redirect URL per environment, so Square always comes back to the workers.dev
   address, which then sends the admin back to the address they connected from: connecting works
   from the workers.dev address and from businesssagent.com alike (the same Worker serves both). To
   register a different Redirect URL instead (say businesssagent.com), set the repository secret
   `SQUARE_REDIRECT_URL` to exactly that URL.
3. On the same page copy the **Application ID** and press **Show** to copy the **Application
   secret** (it starts `sq0csp-`; the *access token* on the Credentials page is a different thing,
   not needed).
4. GitHub → the repo → *Settings → Secrets and variables → Actions* → new repository secrets:
   `SQUARE_APP_ID` and `SQUARE_APP_SECRET`. For Sandbox also add `SQUARE_ENVIRONMENT` = `sandbox`
   (leave it out for real takings). Production and Sandbox have different ID and secret: use the
   pair for the environment you picked.
5. Redeploy (push to `main`, or re-run the Deploy workflow). The deploy passes the secrets to the
   Worker; until it has them, "Connect Square" says the keys are missing.

**Customers straight away (optional, once):** without this, new Square customers come in within
the hour; with it, within seconds.

- Square Developer Console → your app → **Webhooks → Subscriptions** → **Add subscription**
  (pick the same Production or Sandbox as above). Name it "Customers", URL
  `https://business-agent.arononeillwork.workers.dev/api/webhooks/square`, events
  **customer.created** and **customer.updated** → Save.
- Open the subscription and copy its **Signature key** → GitHub repo secret
  `SQUARE_WEBHOOK_SIGNATURE_KEY` → redeploy. Use **Send test event** to check: the subscription's
  log should show `200`. (A different URL in Square needs `SQUARE_WEBHOOK_URL` set to exactly that
  URL: the signature covers it.)

**Each business:**

6. In the app: **Connections → Payments and sales → Connect Square**, sign in with the Square
   account the till uses and press **Allow**. You come back connected; "Connected" means the business
   and at least one open location were found. Every active location is included.

Permissions asked for, all read only: `MERCHANT_PROFILE_READ` (business name and locations),
`PAYMENTS_READ` (takings, tips, refunds, card/cash), `ORDERS_READ` (what was sold, for best
sellers) and `CUSTOMERS_READ` (the customer directory, for Customers). The app can't take, move or
refund money, or change anything in Square.

Testing with Sandbox: in the Developer Console open **Sandbox test accounts → Default Test Account →
Open in Square Dashboard** first (Square only lets a sandbox seller authorise while that dashboard is
open in the same browser), then Connect Square. Take a few test payments in the sandbox (the Square
API Explorer's *Payments → CreatePayment* with source `cnon:card-nonce-ok`) to see figures.

What shows where (admins who can see pay only; Pro plan and up):

- **Accounts → Sales**, like Square's own dashboard: gross and net sales, transactions and average
  sale for today, yesterday, this or last week, this or last month or the last 30 days, each against
  the period before; sales over time (or by hour for one day) with the earlier period as a line;
  busiest hours; days of the week; how people paid; best sellers; and every day in a table, with
  Excel/CSV/PDF export. Days run midnight to midnight, Madrid time.
- **Accounts → Finances**: takings today, this week, last week and the last 30 days, and team cost
  this week as a share of takings.
- **Sales → Customers**: everyone in Square's customer directory (Square → Customers), brought in
  straight after connecting, then within seconds of being added or changed in Square (with the
  webhook above), and every hour as a safety net (people added or changed since). Each is a
  *Customer* with source **Square** (a "Square" tag in the list, and "Square" in the source filter).
  Someone already on the list with the same email or phone is linked instead of added twice, and
  keeps where they came from; Square only fills fields that are empty in the app, so edits made here
  stay. Nobody is ticked as agreeing to marketing (Square doesn't record that yes), and deleting
  someone in Square doesn't delete them here. People without a name, email or phone are left out,
  as is a birthday with no year.

Access lasts 30 days and is renewed a week before it runs out; if it stops working, admins get a
notification. A business connected **before best sellers were added** keeps its takings, and the
Best sellers card asks for one reconnect (Connections → Square → Connect Square again) to allow
`ORDERS_READ`. The same goes for customers: a connection made before they were added needs one
reconnect to allow `CUSTOMERS_READ`; until then takings carry on and no customers come in.

## 10. Stripe (online payments, on top of the till)

Each business connects its own Stripe account with one click (sign in on Stripe, allow read-only
access). One Stripe *platform* account serves every business; it's set up once:

1. <https://dashboard.stripe.com> (the Business Agent account) → **Settings → Connect** → turn on
   Connect, then **Connect → Settings → OAuth**: enable OAuth for Standard accounts and add the
   redirect URIs `https://businesssagent.com/api/integrations/stripe/callback` and
   `https://business-agent.arononeillwork.workers.dev/api/integrations/stripe/callback`.
2. Note the **client ID** (`ca_…`, same page) and the platform **secret key** (Developers → API
   keys) → GitHub repo secrets `STRIPE_CLIENT_ID` and `STRIPE_SECRET_KEY` (the deploy passes them
   to the Worker). Use test-mode keys first if you like; live keys when it works.
3. Redeploy, then **Connections → Payments and sales → Connect Stripe**.

The app keeps only the connected account's id (`acct_…`) and reads its balance transactions
(payments and refunds) with the platform key, read-only: it can't take, refund or move money.
Disconnecting also removes the app's access on Stripe's side. "Connected" means the account was
found and its payments could be read; it's checked again every night.

## 11. SumUp (Sales and takings)

The third payment system, for businesses whose card reader is SumUp. One SumUp app serves every
business; it's set up once:

1. <https://me.sumup.com/developers> (sign in with any SumUp account) → **Create OAuth app**
   (OAuth → Create client credentials). Name it "Business Agent", type *Web*.
2. Redirect URI: `https://businesssagent.com/api/integrations/sumup/callback` (add the workers.dev
   address too if you connect from there).
3. Copy the **Client ID** and **Client secret** → GitHub repo secrets `SUMUP_CLIENT_ID` and
   `SUMUP_CLIENT_SECRET`, then redeploy.
4. Scopes asked for, both read only: `transactions.history` (payments, tips, refunds, card or cash)
   and `user.profile_readonly` (the business name and merchant code). Not `payments` or
   `user.app-settings`: the app can't take, refund or move money, or change the SumUp app.

Each business: **Connections → Payments and sales → Connect SumUp**, sign in, allow. "Connected"
means the merchant account was found and its transactions could be read. Takings show on Sales
(by day, by hour, and card, cash or Apple/Google Pay) and on Finances, like Square's. SumUp's history
has no line items, so the Best sellers card says SumUp doesn't send them. Access lasts an hour and is
renewed with the refresh token (which lapses after 6 months unused); checked every night.

## 12. LinkedIn (Social planner)

Posts go to the café's LinkedIn **company Page**, or to the owner's own profile. One LinkedIn app
serves every business:

1. <https://www.linkedin.com/developers/apps> → **Create app** (it needs a LinkedIn Page to belong
   to: the Business Agent Page) → **Auth** → Authorized redirect URL:
   `https://businesssagent.com/api/integrations/linkedin/callback`.
2. **Products**: add **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn**
   (both granted straight away: post as the person who signs in), and request the **Community
   Management API** (company Pages: `r_organization_admin`, `w_organization_social`; LinkedIn reviews
   it, which takes a while and needs a registered business).
3. **Auth** → copy the **Client ID** and **Primary Client Secret** → GitHub repo secrets
   `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`.
4. Until the Community Management API is approved, LinkedIn refuses the sign-in when the Page
   permissions are asked for. Set the GitHub repo **variable** `LINKEDIN_PAGES` = `off` and redeploy:
   the app then asks for the person's profile only (`openid profile w_member_social`) and posts there.
   Remove the variable once the product is approved.
5. Redeploy, then **Connections → Social media → Connect LinkedIn**. If the person administers
   company Pages, the card asks where posts go: a Page or their own profile.

What goes: posts (text, or text and one photo, uploaded to LinkedIn); carousels, reels and stories
stay Instagram-only. Videos aren't sent to LinkedIn. #hashtags become LinkedIn hashtags. Each post's
result links to it (`linkedin.com/feed/update/…`). LinkedIn counts as a social account for the plan.

LinkedIn access lasts **60 days** and, for most apps, can't be renewed without the person: admins
get a notification a week before, and after that the card turns red ("LinkedIn access has expired.
Connect it again."). Apps LinkedIn has approved for refresh tokens are renewed by themselves.
The Posts API version is `LINKEDIN_VERSION` (YYYYMM, default in `worker/connections.ts`); LinkedIn
retires each version after about a year, so move it on now and then.

## 13. Google Search Console (Analytics: the website on Google)

Shows how the business's website does in Google Search: clicks, views (impressions), click-through
rate and position, by day, search, page, device and country. It uses the Google app from sections
1-2, read only (`webmasters.readonly`). Once, in the same Google Cloud project:

1. *APIs & Services → Library* → **Google Search Console API** → Enable.
2. *OAuth consent screen* (Google Auth Platform → Data access) → **Add or remove scopes** → add
   `https://www.googleapis.com/auth/webmasters.readonly` → Save. While the app is in *Testing*, the
   Google account that connects must be a test user; `webmasters.readonly` is a sensitive scope, so
   Google verifies the app before anyone else can use it.

Each business: set the website on **Business** (Café → Business details), then **Connections → Maps
and search → Connect Search Console** and sign in with a Google account that has the website in
Search Console (<https://search.google.com/search-console>, verified as a domain or URL-prefix
property). The property for the business's website is picked by itself (a `sc-domain:` property
first, then the `https://…/` one); with several and none matching, the card asks which. No website
in the account means not connected, with the steps to add it. Google's figures are 2-3 days behind.
Checked every night (the website must still be in the account); on every plan.

## Social planner

Admins plan posts on **Social planner** (left menu): write once, pick Instagram, Facebook,
TikTok, LinkedIn and Google Maps, post now or schedule for a Madrid date and time. Every minute the Worker
queues due posts (`queue_due_social_posts`), one outbox job per network, and each network's
outcome, with a link to the post, shows under **Sent → Where it went**. A post that fails on one
network but not others is marked *partly sent*; failures retry like every other outbox job.

## Sign-in emails from the business's own mailbox

Invites, sign-up confirmations, sign-in codes and password resets are sent by Supabase Auth. Once
the business has connected **Gmail or Outlook** (Connections page), the next deploy switches on
Supabase's *send email hook*: Supabase then hands each of these emails to the Worker
(`/api/auth/send-email`, signed with a secret derived from the service key) and the Worker sends
it from that mailbox, like the team alerts. Until a mailbox is connected, Supabase sends them itself.
The deploy summary says which is in use ("Sign-in emails: …"). If the mailbox stops working, the
emails fail with the reason (and admins are told the connection broke); the next deploy switches
back to Supabase's sender until it is reconnected. Admins can always add people with a temporary
password, which needs no email.
