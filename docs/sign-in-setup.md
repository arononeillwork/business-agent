# Google, Apple, Facebook and Microsoft sign-in

Email + password works out of the box. The one-tap Google, Apple, Facebook and
Microsoft buttons need a one-off setup each. Until a method is switched on its button is left off
the sign-in card (so nobody lands on an error page), and every deploy prints a warning.

Instagram: Supabase has no "Log in with Instagram" (Instagram's own login is only for business
APIs, not for signing people in). Instagram accounts belong to Meta, so people use **Facebook**.

Never paste client secrets into chat or code. They go only into GitHub repo secrets.

## Google (about 10 minutes, in the browser)

Google does not let apps create sign-in keys automatically, so this part is manual.

1. Open <https://console.cloud.google.com/> signed in as the café's Google account. Create a
   project (top bar → project picker → **New project**), e.g. **Business Agent**.
2. **APIs & Services → OAuth consent screen** (or **Google Auth Platform → Branding**):
   - App name: **Business Agent** · User support email: your email
   - Authorised domains: `lhakrmmoxaareykglmtx.supabase.co`, `businesssagent.com` and `arononeillwork.workers.dev`
     (not `supabase.co` or `workers.dev` on their own: Google refuses shared domains with "must be a top private domain")
   - Developer contact: your email → **Save**
3. **Audience**: *External* → **Publish app** (status *In production*). Sign-in only asks for name
   and email, so Google doesn't need to review it.
4. **Data access / Scopes**: add `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`.
   Also add the ones for the Google connections: `business.manage` (Google Maps listing),
   `gmail.send` (Gmail: send team alerts), `drive.file` (Google Drive: only files the app makes)
   and `youtube.readonly` (YouTube Music: read playlists).
   Also enable the **Gmail API**, **Google Drive API** and **YouTube Data API v3** under
   APIs & Services → Library. (If one is off, connecting that app says exactly which to switch on.)
   For Google Maps, enable **My Business Account Management API** and **My Business Business
   Information API** (connecting and syncing hours; the *Performance* API is not used). Google Maps
   also needs Google to switch on Business Profile access for the project once: request it with
   Google's "Business Profile API access" form (usually approved in a few days). After approval,
   **Google My Business API** appears in the Library too: enable it for posting to Google.
5. **Clients → Create client → Web application**, name **Business Agent web**:
   - Authorised JavaScript origins: `https://businesssagent.com` and `https://business-agent.arononeillwork.workers.dev`
   - Authorised redirect URIs (all three):
     - `https://lhakrmmoxaareykglmtx.supabase.co/auth/v1/callback`  (sign-in)
     - `https://businesssagent.com/api/integrations/google/callback`  (Google connections)
     - `https://business-agent.arononeillwork.workers.dev/api/integrations/google/callback`  (same, on the workers.dev address)
   - **Create**, then copy the **Client ID** and **Client secret**.
6. GitHub → the `business-agent` repo → **Settings → Secrets and variables → Actions →
   New repository secret**, add:
   - `GOOGLE_CLIENT_ID` = the client ID
   - `GOOGLE_CLIENT_SECRET` = the client secret
7. **Actions → Deploy → Run workflow** (or ask Claude to redeploy). The deploy switches Google on
   in Supabase and gives the same keys to the Worker for the Google Maps connection.
8. Check: the deploy summary says `google=true`, and the live test "the Google button reaches
   Google sign-in" passes (it fails if Google shows an error such as `redirect_uri_mismatch`).
   Then open the site → **Google** → pick your account.

The same Google keys power sign-in, Google Maps, Gmail, Google Drive and YouTube Music: one set of
keys, and each business just presses **Connect** on its Connections page. An app only shows as
connected once it has really worked (Gmail sends itself a confirmation, Drive gets its folder…),
and every connection is checked again each night.

## Microsoft (automatic, 2 minutes)

Run **Actions → Set up Microsoft sign-in → Run workflow** (or ask Claude to start it). Open the
log, copy the code it prints, and enter it at <https://microsoft.com/devicelogin> within 15 minutes
while signed in to your Microsoft account. The workflow creates the app and switches Microsoft on
in Supabase itself. The same run also gives the Worker the app for **Outlook** (send team alerts)
and **OneDrive** (save exports), so those Connect buttons start working too.

**Which Microsoft account to use.** The app is created in the Microsoft directory (tenant) of the
account that signs in, so use one that belongs to the business, not an employer's work account.
A work or school account (e.g. one ending in your company's domain) creates it in that company's
directory, which usually needs an administrator and multi-factor sign-in. A personal
Outlook/Hotmail account works if it has its own directory: sign in once at
<https://entra.microsoft.com> (this creates a free "Default Directory"). To pick a directory, run
the workflow with the **tenant** box filled in (e.g. `yourname.onmicrosoft.com`). If the run says
"Microsoft sign-in didn't finish", run it again and complete every prompt, including the
multi-factor one, within 15 minutes.

## Facebook (5 minutes, reuses the Meta app you already have)

"Log in with Facebook" uses the same Meta app as the Facebook Page connection (`META_APP_ID` and
`META_APP_SECRET`, see [INTEGRATIONS.md](INTEGRATIONS.md) section 7), so there are no new keys.

1. <https://developers.facebook.com/apps> → your app → **Facebook Login → Settings** →
   **Valid OAuth Redirect URIs**: add
   `https://lhakrmmoxaareykglmtx.supabase.co/auth/v1/callback` (keep the existing
   `/api/integrations/facebook/callback` ones) → **Save changes**.
2. **App settings → Basic**: *Privacy policy URL* `https://businesssagent.com/privacy`, *Terms of
   service URL* `https://businesssagent.com/terms`, *User data deletion* → **Data deletion
   instructions URL** `https://businesssagent.com/data-deletion`, an app icon and a category.
3. **Use cases → Authentication and account creation → Customise**: make sure the `email` and
   `public_profile` permissions are added (both are standard access, no App Review needed).
4. Top bar: switch the app to **Live** (in *Development* only people with a role on the app
   can log in).
5. Deploy (**Actions → Deploy → Run workflow**). Facebook is on by default; to switch it off, add the
   repository variable `FACEBOOK_SIGN_IN` = `off`.
6. Check: the deploy summary says `facebook=true`, and the live test "the Facebook button reaches
   Facebook sign-in" passes.

Steps 1 to 4 must be done before Facebook is on: without step 1, the button opens Facebook's
"URL blocked" page.

## Apple (about 15 minutes, needs an Apple Developer account)

1. <https://developer.apple.com/account/resources/identifiers/list> → **+** → **App IDs** →
   App → description *Business Agent*, bundle ID e.g. `com.businesssagent.app` → tick
   **Sign in with Apple** → Register.
2. **+** → **Services IDs** → description *Business Agent web*, identifier e.g.
   `com.businesssagent.web` (this is the client ID) → Register. Open it → tick **Sign in with
   Apple** → **Configure**: primary App ID from step 1; domains `lhakrmmoxaareykglmtx.supabase.co`
   and `businesssagent.com`; return URL `https://lhakrmmoxaareykglmtx.supabase.co/auth/v1/callback`
   → Save → Continue → Save.
3. **Keys → +** → name *Business Agent sign-in*, tick **Sign in with Apple** → Configure → the App
   ID from step 1 → Register → **Download** the `.p8` file (only once!) and note the **Key ID**.
   Your **Team ID** is at the top right of the developer site.
4. GitHub repo secrets:
   - `APPLE_CLIENT_ID` = the Services ID from step 2 (e.g. `com.businesssagent.web`)
   - `APPLE_TEAM_ID` = your Team ID
   - `APPLE_KEY_ID` = the Key ID
   - `APPLE_PRIVATE_KEY` = the whole contents of the `.p8` file, including the `BEGIN`/`END` lines
5. **Actions → Deploy → Run workflow**. Apple's client secret only lasts 6 months, so every deploy
   signs a fresh one from the key: no reminder needed as long as the app is deployed at least
   twice a year.
