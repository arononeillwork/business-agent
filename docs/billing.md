# Plans and billing (Stripe)

Business Agent is sold in four plans (`shared/plans.ts`), prices in euros excluding VAT:

| Plan | Monthly | Yearly | People | Social accounts | Scheduled posts / month |
|---|---|---|---|---|---|
| Free | €0 | €0 | 3 | 1 | 1 |
| Starter | €25 | €250 | 10 | 1 | 12 |
| Pro | €49 | €490 | 25 | 3 | 60 |
| Business | €79 | €790 | Unlimited | 3 | Unlimited |

The custom MCP connection (Claude, ChatGPT, n8n…) and the REST API are on every plan, and so is the
registro de jornada (Spanish law requires it). Feature by feature: `/pricing`. Against Square and
GoHighLevel: `/compare` (numbers and sources in `shared/competitors.ts`, checked 18 October 2026).

## How it works

- Admins choose a plan on **Settings → Billing**. A new subscriber goes to **Stripe Checkout**;
  someone already paying moves plan straight away (prorated).
- **Business starts with a 2-month free trial**, once per business. Checkout takes the card up
  front (`payment_method_collection=always`), so Stripe charges it by itself when the trial ends.
- **No payment, no paid plan.** `public.current_plan()` gives the chosen plan only while Stripe says
  `trialing` (and the trial end hasn't passed), `active`, or we gave it free (`comped`). A trial that
  ends unpaid, a failed renewal (`past_due`, `unpaid`), or a cancellation means **Free** until Stripe
  takes the payment. Paid features pause (connections can't be added, WhatsApp and Google Maps jobs
  stop, Sports, Music, Partners and the tablet show an upgrade card); nothing is deleted. Admins see
  a banner with **Fix billing**, which opens Stripe's page to update the card.
- **The database enforces the limits** (migration 36): people, social accounts, posts a month and
  paid connections are checked by triggers, so the app, REST API and AI connector all obey them.
- **Stripe → app:** Stripe calls `/api/billing/webhook`. The Worker fetches each event back from
  Stripe with the secret key before believing it (no signing secret to manage), then copies the
  subscription into `public.billing`. The nightly job and the return from Checkout copy it again.
- Prices are created in Stripe the first time they're needed (lookup keys
  `business_agent_<plan>_<month|year>`). Changing an amount in `shared/plans.ts` makes a new price;
  existing subscribers keep theirs until they change plan.
- A business that was already running when plans arrived is set to Business, **given free**
  (`status = 'comped'`), so nothing changes for it. To bill it instead:
  `update public.billing set plan = 'free', status = 'none' where id = 1;`

## Setup (once)

1. **Apply migration** `supabase/migrations/20261019000036_billing_plans.sql` to the Supabase project
   (the same way as the others: the Supabase connector, or `supabase db push`).
2. GitHub repo secret **`STRIPE_SECRET_KEY`**: the Business Agent Stripe account's secret key
   (it's probably already there for the Stripe takings connection). Use `sk_test_…` to try it out
   first, `sk_live_…` to take real payments.
3. **Actions → Deploy → Run workflow.** The "Stripe billing webhook" step creates the webhook in
   Stripe and the summary says which mode (test or live).
4. In the Stripe dashboard: **Settings → Billing → Subscriptions and emails**: turn on *Smart
   retries* and *Send emails about failed payments* and *upcoming trial endings*. Optionally,
   **Settings → Tax** for automatic IVA.
5. Try it: Billing → **Start 2-month free trial** → Stripe test card `4242 4242 4242 4242`. Then in
   Stripe, open the subscription and **end the trial now** with the card `4000 0000 0000 0341`
   (declines): the app moves to Free and shows the banner within a minute.
