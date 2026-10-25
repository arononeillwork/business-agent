# Plans and billing (Stripe)

Business Agent is sold in four plans (`shared/plans.ts`), prices in euros excluding VAT:

| Plan | Monthly | Yearly | People | Social accounts | Scheduled posts / month |
|---|---|---|---|---|---|
| Free | €0 | €0 | 3 | 1 | 1 |
| Starter | €39 | €390 | 10 | 1 | 12 |
| Pro | €79 | €790 | 25 | 3 | 60 |
| Business | €129 | €1,290 | Unlimited | 3 | Unlimited |

**Enterprise** (groups, franchises, several venues) isn't self-serve: "Contact sales" on the pricing
page writes to sales@businesssagent.com (docs/business-email.md), and the terms are agreed case by case.
Stripe prices follow `shared/plans.ts`: a changed amount gets a new Stripe price the next time someone
checks out (looked up by its lookup key); existing subscriptions keep the price they started on.

The custom MCP connection (Claude, ChatGPT, n8n…) and the REST API are on every plan, and so is the
registro de jornada (Spanish law requires it). Feature by feature: `/pricing`. Against Square and
GoHighLevel: `/compare` (numbers and sources in `shared/competitors.ts`, checked 18 October 2026).

## How it works

- Admins choose a plan on **Settings → Billing**. A new subscriber goes to **Stripe Checkout**;
  someone already paying moves plan straight away (prorated).
- **Billing is the boss's.** Only a boss (an admin with pay access, the top of the three team roles)
  sees Billing, chooses a plan, opens Stripe's page and gets the **Fix billing** banner. The Worker's
  `/api/billing/*` routes check `can_see_pay()`, and the `billing_boss_only` migration lets only
  bosses read `public.billing`. A shop manager who meets a paid feature is told to ask a boss;
  everyone still sees the plan in force (`plan_status()`), which the feature locks need.
- **Business starts with a 2-month free trial**, once per business. Checkout takes the card up
  front (`payment_method_collection=always`), so Stripe charges it by itself when the trial ends.
- **No payment, no paid plan.** `public.current_plan()` gives the chosen plan only while Stripe says
  `trialing` (and the trial end hasn't passed), `active`, or complimentary (`comped`, below). A trial that
  ends unpaid, a failed renewal (`past_due`, `unpaid`), or a cancellation means **Free** until Stripe
  takes the payment. Paid features pause (connections can't be added, WhatsApp and Google Maps jobs
  stop, Sports, Music, Partners and the tablet show an upgrade card); nothing is deleted. Admins see
  a banner with **Fix billing**, which opens Stripe's page to update the card.
- **The database enforces the limits** (migration 36): people, social accounts, posts a month and
  paid connections are checked by triggers, so the app, REST API and AI connector all obey them.
- **Stripe → app:** Stripe calls `/api/billing/webhook`. The Worker fetches each event back from
  Stripe with the secret key before believing it (no signing secret to manage), then copies the
  subscription into `public.billing`. The nightly job and the return from Checkout copy it again.
- **Stripe follows `shared/plans.ts`.** Every deploy runs `scripts/ops/stripe-prices.ts`: one
  product per paid plan and one active monthly and yearly price in euros (lookup keys
  `business_agent_<plan>_<month|year>`). Change an amount in `shared/plans.ts` and deploy: the new
  price takes the key over and the old one is archived (off sale; anyone already on it keeps it,
  as Stripe never deletes a used price). Prices and products of plans that are gone are archived
  too. Free and any plan without a price have nothing in Stripe.

## Complimentary accounts (founding account, friends & family)

Complimentary access is always the **top plan (Business), free**: no card, no trial, nothing from
Stripe can change it, and the Billing page shows the tag instead of plans to choose.

| Tag | Shown as | Who |
|---|---|---|
| `founder` | Founding account | Easy Beans Coffee, the business Business Agent was built with (set by migration 36) |
| `friends_family` | Friends & family | People we add by hand |

Only the service role can set it (Supabase SQL editor, the Supabase connector, or ask Claude). In
the business's Supabase project:

```sql
select public.grant_complimentary('friends_family', 'Café Lola, Aron''s sister');  -- give it
select public.end_complimentary();                                                -- take it away (back to Free)
select plan, status, complimentary, complimentary_note, complimentary_since from public.billing;  -- check
```

Free-trial businesses are separate: they are on Business with Stripe status `trialing` until the
trial ends, then paying (`active`) or back on Free.

## Pay per use

A few extras are charged each time they're used, on top of the plan, and billed monthly with it.
They are listed in `PAY_PER_USE` (`shared/plans.ts`), which the pricing page reads:

| Extra | Price (excl. VAT) | Free each month | Plans |
|---|---|---|---|
| AI music track for a story or reel (ElevenLabs, up to 60 s) | €0.99 | Business: 1 | Starter, Pro, Business |

How a use is charged (migration 85, `worker/socialMusic.ts`, `worker/billing.ts`):

- **Reserved first.** `ai_music_start()` locks the billing row, takes the month's free uses first
  (`pay_per_use.included` for the plan, plus `billing.ai_music_extra_free` for a complimentary
  allowance we give with `grant_ai_music()`), and refuses one that would go over the monthly
  spending limit (`billing.ai_music_limit_cents`, €25 by default, changed on the Billing page). A
  use is one track of up to a minute: a longer one is one use per started minute. Free can't.
- **Settled after.** `ai_music_finish()` marks it done, or gives the free use back and charges
  nothing when ElevenLabs refused or failed. A reservation left over 15 minutes is let go.
- **On the bill once.** A paid use becomes a Stripe invoice item on the subscription (amount in
  cents, `tax_behavior: exclusive`, idempotency key `business-agent-ai-music-<id>`), so it lands on
  the next invoice. Yearly subscriptions get `pending_invoice_item_interval: month`, so their uses
  are billed monthly too. If Stripe didn't answer, the nightly `chargePendingAiMusic()` puts it on;
  the key means it's never there twice.
- The Billing page lists this month's AI tracks, what they cost so far and the limit; the AI
  assistant's `make_music` tool goes through the same steps.

## Referral months as credit

Give a month, get a month (Referrals page): each referred business that finishes set-up earns this
business a free month (up to 12), and a business that was itself referred gets one month. Each
month goes onto the Stripe customer's balance as credit worth one month of its plan (a twelfth of
the yearly price on yearly billing), and Stripe takes it off the next invoices by itself, the first
payment after a trial included. Months are credited once there is a subscription (trialing or
active), each with its own idempotency key, and counted in `billing.referral_months_applied`, so a
month is never credited twice. Complimentary accounts have nothing to pay; their months wait.

Marking a business as referred (in its Supabase project, when we set it up):

```sql
select public.mark_referred('Easy Beans Coffee');
```

## Setup (once)

1. **Apply migrations** 36 to 38 (`supabase/migrations/2026101900003*`) to the Supabase project
   (the same way as the others: the Supabase connector, or `supabase db push`). Done on the
   BusinessAgent project on 19 October 2026.
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
