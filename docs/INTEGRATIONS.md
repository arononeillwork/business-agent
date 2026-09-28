# Connecting Google, WhatsApp, social media and Square

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
5. The account must be professional (Business or Creator). Photos for posts are stored in
   Cloudflare R2 (bucket `business-agent-media`, set up by the deploy).

"Connected" means the app signed in, read the profile and posts, and was allowed to post. The
60-day access is renewed every night; if it stops working, admins get a notification.

The Connections page then shows followers and recent posts, and calendar events get a **Share**
button that posts to Instagram and the Google listing together.

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

## 7. Facebook Page (Social planner)

Posts go to a Facebook **Page** (not a personal profile). It uses a Meta app with Facebook Login
for Business; the WhatsApp app from section 3 can be reused.

1. <https://developers.facebook.com/apps> → your app → **Add product → Facebook Login for
   Business** → Settings → Valid OAuth redirect URIs:
   `https://<worker-url>/api/integrations/facebook/callback`.
2. App settings → Basic → **App ID** → GitHub repo secret `META_APP_ID` (the app secret is the
   `META_APP_SECRET` from section 3).
3. Permissions: `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`. Until App Review
   grants Advanced Access, only people with a role on the app (App roles → Roles) can connect.
4. In the app: Connections → **Connect Facebook**. If the account manages several Pages, choose
   the one to post to under **Facebook details → Page to post to**.

"Connected" means the app signed in, found the Page and holds a Page token allowed to post.

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

## 9. Square (takings on Finances)

1. <https://developer.squareup.com/apps> → **Create app** → OAuth → Production (or Sandbox for
   testing) → Redirect URL: `https://<worker-url>/api/integrations/square/callback`.
2. **Application ID** and **Application secret** → GitHub repo secrets `SQUARE_APP_ID`,
   `SQUARE_APP_SECRET`. For sandbox testing also set `SQUARE_ENVIRONMENT` to `sandbox`
   (leave it unset for real takings).
3. Permissions asked for: `MERCHANT_PROFILE_READ`, `PAYMENTS_READ` (read only; the app never
   takes or refunds payments).
4. In the app: Connections → Payments and sales → **Connect Square**.

The Finances page then shows takings for today, this week, last week and the last 30 days
(completed payments at every active location, by Madrid day), and team cost this week as a share
of takings. Only admins who can see pay see these figures. Access lasts 30 days and is renewed a
week before it runs out; if it stops working, admins get a notification.

## Social planner

Admins plan posts on **Social planner** (left menu): write once, pick Instagram, Facebook,
TikTok and Google Maps, post now or schedule for a Madrid date and time. Every minute the Worker
queues due posts (`queue_due_social_posts`), one outbox job per network, and each network's
outcome, with a link to the post, shows under **Sent → Where it went**. A post that fails on one
network but not others is marked *partly sent*; failures retry like every other outbox job.
