# Google and Microsoft sign-in

Email + password and email codes work out of the box. "Continue with Google" and "Continue with
Microsoft" need a one-off setup each. Until then the buttons are greyed out with "being set up",
and every deploy prints a warning.

Never paste client secrets into chat or code. They go only into GitHub repo secrets.

## Google (about 10 minutes, in the browser)

Google does not let apps create sign-in keys automatically, so this part is manual.

1. Open <https://console.cloud.google.com/> signed in as the café's Google account. Create a
   project (top bar → project picker → **New project**), e.g. **Business Agent**.
2. **APIs & Services → OAuth consent screen** (or **Google Auth Platform → Branding**):
   - App name: **Business Agent** · User support email: your email
   - Authorised domains: `lhakrmmoxaareykglmtx.supabase.co` and `business-agent.arononeillwork.workers.dev` (skip any that Google refuses)
   - Developer contact: your email → **Save**
3. **Audience**: *External* → **Publish app** (status *In production*). Sign-in only asks for name
   and email, so Google doesn't need to review it.
4. **Data access / Scopes**: add `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`.
   Also add the ones for the Google connections: `business.manage` (Google Maps listing),
   `gmail.send` (Gmail: send team alerts) and `drive.file` (Google Drive: only files the app makes).
   Also enable the **Gmail API** and **Google Drive API** under APIs & Services → Library.
5. **Clients → Create client → Web application**, name **Business Agent web**:
   - Authorised JavaScript origins: `https://business-agent.arononeillwork.workers.dev`
   - Authorised redirect URIs (both):
     - `https://lhakrmmoxaareykglmtx.supabase.co/auth/v1/callback`  (sign-in)
     - `https://business-agent.arononeillwork.workers.dev/api/integrations/google/callback`  (Google Maps connection)
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

The same Google keys power sign-in, Google Maps, Gmail and Google Drive: one set of keys, and
each business just presses **Connect** on its Connections page.

## Microsoft (automatic, 2 minutes)

Run **Actions → Set up Microsoft sign-in → Run workflow** (or ask Claude to start it). Open the
log, copy the code it prints, and enter it at <https://microsoft.com/devicelogin> within 15 minutes
while signed in to your Microsoft account. The workflow creates the app and switches Microsoft on
in Supabase itself. The same run also gives the Worker the app for **Outlook** (send team alerts)
and **OneDrive** (save exports), so those Connect buttons start working too.
