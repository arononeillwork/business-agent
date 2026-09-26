# Connecting Google, WhatsApp and Instagram

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
Business page shows anything waiting or failed.

---

## 1. Sign in with Google (staff login)

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

## 2. Google Maps opening hours, closures and posts (Google Business Profile)

1. Same Google Cloud project → enable **My Business Business Information API**,
   **My Business Account Management API** and **Google My Business API** (posts).
2. Request API access: <https://developers.google.com/my-business/content/prereqs> (Google
   approves Business Profile API access; allow a few days).
3. Credentials → the same (or a new) Web OAuth client → add redirect URI
   `https://<worker-url>/api/integrations/google/callback`.
4. Worker secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
5. In the app: Business → Connections → **Connect Google**, sign in with the Google account that
   owns the Easy Beans listing. Use **Compare with Google** once to decide which hours are right.

After that, changing opening hours in the app, adding a business closure ("Closed …") or, if
ticked, public holidays updates Google automatically within a minute.

## 3. WhatsApp (Meta Cloud API, direct)

1. <https://developers.facebook.com> → Create app → Business → add **WhatsApp**.
2. Meta Business Suite → verify the business (Easy Beans documents).
3. WhatsApp → API Setup → add the business phone number. It can't also be used in the normal
   WhatsApp app. Note the **Phone number ID** → Worker var `WHATSAPP_PHONE_NUMBER_ID`.
4. Business Settings → System users → add an admin system user → generate a **permanent token**
   with `whatsapp_business_messaging`, `whatsapp_business_management` (and for Instagram:
   `instagram_basic`, `instagram_content_publish`, `pages_show_list`) → secret `META_ACCESS_TOKEN`.
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

8. In the app: Business → Connections → WhatsApp → **Send test** to your own number.

Staff turn messages on under **My account** (their consent, as GDPR requires). Replying `STOP`
or `BAJA` turns them off.

## 4. Instagram

1. Switch @easy.beans.coffee to a **professional** account and link it to the café's Facebook Page.
2. Give the system user from step 3.4 access to the Page and the Instagram account.
3. Find the Instagram account ID (Graph API Explorer: `me/accounts?fields=instagram_business_account`)
   → Worker var `INSTAGRAM_USER_ID`.
4. Photos for posts are stored in Cloudflare R2: enable R2 in the Cloudflare dashboard, create the
   bucket `business-agent-media`, and uncomment the `r2_buckets` line in `wrangler.jsonc`.

The Business page then shows followers and recent posts, and calendar events get a **Share**
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
3. In the app: Business → Connections → **Connect Spotify** (one click, sign in with the café's
   Spotify account) → choose the **approved playlist**.
4. Keep Spotify open on the café speaker or tablet. Staff then see **Café music** on Today and can
   play or pause the approved playlist; it flags when something else is playing.

Play/pause from the app needs Spotify Premium. New Spotify apps start in development mode, which
is fine for one café account (add the café's Spotify email under the app's User Management).
