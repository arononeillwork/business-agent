# The Business Agent's email: thebusinesssagent@gmail.com

The Business Agent has one address, its Gmail **thebusinesssagent@gmail.com**. The website, the
pricing page's "Contact sales", the privacy policy, the terms and the data-deletion page all give
it (`shared/legal.ts`, `shared/plans.ts`, the site footer), and HQ's own business details use it.
There are no hello@, sales@, support@ or privacy@ addresses on businesssagent.com, so nothing needs
forwarding: the deploy's "Business email" step says "off".

## Sign-in emails

Invites, sign-up confirmations, sign-in codes and password resets (`worker/authEmail.ts`) go:

1. From **The Business Agent <noreply@businesssagent.com>** once Cloudflare Email Sending is on
   (below), with replies going to thebusinesssagent@gmail.com.
2. Otherwise from the person's own business's Gmail or Outlook, for that business's own people.
3. For everyone else (a new sign-up with no business yet, or a business without a mailbox), from The
   Business Agent HQ's mailbox, never another business's. To make that thebusinesssagent@gmail.com:
   - Google Cloud → the app's **OAuth consent screen** → **Test users** → add
     thebusinesssagent@gmail.com (only while the app is in testing).
   - In the app, switch to **The Business Agent HQ** (account menu → Switch business) →
     **Connections** → **Gmail** → Connect, and sign in as thebusinesssagent@gmail.com.
   - Run **Actions → Deploy**: its summary says "for everyone else, from The Business Agent HQ's
     thebusinesssagent@gmail.com".

   Until HQ has a mailbox, the founding business's stays the last resort so email sign-ups keep
   working.

## Sign-in emails from noreply@businesssagent.com (Cloudflare Email Sending)

Cloudflare Email Sending sends them straight from the Worker, signed for the domain (SPF and DKIM),
with The Business Agent's robot at the top.

1. **Workers Paid plan** (US$5 a month): Cloudflare → Workers & Pages → Plans. Sending to anyone
   needs it; 3,000 emails a month are included.
2. **Onboard the domain** (2 minutes): Cloudflare → Compute → Email Service → **Email Sending** →
   Onboard Domain → businesssagent.com → Done. Cloudflare adds the `cf-bounce` and DKIM records.
3. **Deploy** (Actions → Deploy → Run workflow). The "Sign-in emails" step finds those records,
   switches the Worker's `send_email` binding on (`scripts/ops/email-sending.mjs`), and the sign-in
   settings step sends sign-in emails through it. The deploy summary says which it did.

If Cloudflare refuses an email (the plan lapsed, a sending limit), that one still goes, from the
mailbox, and the Worker's log says why. Sent emails show in Cloudflare → Email Sending → Activity.

## Addresses on the domain (not used)

`scripts/ops/email-routing.mjs` can still forward hello@, sales@, support@ and privacy@ the domain
to an inbox with Cloudflare Email Routing, if the repository secret `EMAIL_FORWARD_TO` names one and
the deploy's Cloudflare token has Zone → Email Routing Rules → Edit and Account → Email Routing
Addresses → Edit. Without the secret it does nothing.
