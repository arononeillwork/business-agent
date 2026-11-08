# Business Agent's own email: hello@, sales@ and support@businesssagent.com

The website shows **hello@**, **sales@** (Enterprise: "Contact sales") and **support@**
businesssagent.com. They all arrive in one Gmail inbox, and you reply *as* those addresses from
Gmail. It costs nothing: Cloudflare Email Routing receives the mail, Gmail sends it.

## 1. A Gmail for Business Agent (done)

The business's Gmail is **thebusinesssagent@gmail.com**. Turn on **2-Step Verification** (Google
Account → Security): Gmail needs it to send as your own addresses.

## 2. Where the deploy forwards (nothing to do)

The deploy forwards to thebusinesssagent@gmail.com (`scripts/ops/email-routing.mjs`). To use another
inbox, set the repository secret `EMAIL_FORWARD_TO` to it.

## 3. Let the deploy set up Email Routing (2 minutes)

Cloudflare → My Profile → **API Tokens** → edit the token the deploy uses → add:
- **Zone → Email Routing Rules → Edit** (for businesssagent.com)
- **Account → Email Routing Addresses → Edit**

Then redeploy (or ask for one). The "Business email" step switches on Email Routing (Cloudflare adds
its MX records), creates hello@, sales@ and support@ forwarding to the Gmail, lets Google send for
the domain (SPF) and adds a DMARC policy. Its result shows in the deploy summary.

Prefer clicking? Cloudflare → businesssagent.com → **Email → Email Routing → Get started**, add
the three addresses with the Gmail as destination, and the deploy step will find them and leave
them as they are.

## 4. Confirm the Gmail (1 minute)

Cloudflare emails the Gmail once: open **"Verify email address"** and press the button. Mail to
the three addresses is delivered from then on.

## 5. Reply as hello@ from Gmail (5 minutes)

1. Google Account → Security → **App passwords** → create one called "Business Agent mail".
2. Gmail → Settings (gear) → See all settings → **Accounts and Import** → Send mail as →
   **Add another email address**: name `Business Agent`, address `hello@businesssagent.com`,
   untick "Treat as an alias".
3. SMTP server `smtp.gmail.com`, port `587`, username the full Gmail address, password the app
   password, TLS. Gmail sends a code to hello@, which arrives in the same inbox: enter it.
4. Repeat for sales@ and support@ if you want to send from those too, and pick a default.
   Tick "Reply from the same address the message was sent to".

Test: send an email to hello@businesssagent.com from another account; reply from Gmail and check
the reply shows hello@businesssagent.com as the sender.

## Sign-in emails from noreply@businesssagent.com (Cloudflare Email Sending)

Invites, sign-up confirmations, sign-in codes and password resets come from **The Business Agent
<noreply@businesssagent.com>**, with replies going to support@. Cloudflare Email Sending sends them
straight from the Worker, signed for the domain (SPF and DKIM), with The Business Agent's robot at
the top. Until it's set up, they go out as before, from a business's own Gmail or Outlook.

1. **Workers Paid plan** (US$5 a month): Cloudflare → Workers & Pages → Plans. Sending to anyone
   needs it; 3,000 emails a month are included.
2. **Onboard the domain** (2 minutes): Cloudflare → Compute → Email Service → **Email Sending** →
   Onboard Domain → businesssagent.com → Done. Cloudflare adds the `cf-bounce` and DKIM records.
3. **Deploy** (Actions → Deploy → Run workflow). The "Sign-in emails" step finds those records,
   switches the Worker's `send_email` binding on (`scripts/ops/email-sending.mjs`), and the sign-in
   settings step sends sign-in emails through it. The deploy summary says which it did.

If Cloudflare refuses an email (the plan lapsed, a sending limit), that one still goes, from the
mailbox, and the Worker's log says why. Sent emails show in Cloudflare → Email Sending → Activity.

## Sign-in emails while Cloudflare Email Sending is off

Until Email Sending is on (above), sign-in emails go from a connected mailbox
(`worker/authEmail.ts`): the person's own business's Gmail or Outlook, and for everyone else (a new
sign-up with no business yet, or a business without a mailbox) The Business Agent HQ's, never
another business's. To make that thebusinesssagent@gmail.com:

1. Google Cloud → the app's **OAuth consent screen** → **Test users** → add thebusinesssagent@gmail.com
   (only while the app is in testing).
2. In the app, switch to **The Business Agent HQ** (account menu → Switch business) → **Connections**
   → **Gmail** → Connect, and sign in as thebusinesssagent@gmail.com.
3. Run **Actions → Deploy**: its summary says "for everyone else, from The Business Agent HQ's
   thebusinesssagent@gmail.com".

Until HQ has a mailbox, the founding business's stays the last resort so email sign-ups keep working.

