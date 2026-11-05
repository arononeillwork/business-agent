# Business Agent's own sales reps — plan

Goal: people who know business owners sell Business Agent for us. Each rep has a code. A business
that signs up with it gets a month free and help setting up; the rep earns commission on what that
business pays. Each rep covers a category of business: **Julio covers cafés**.

Written 5 Nov 2026 against `main` (`7b1ff57`). **Status: plan only. Nothing is built and the live app
is unchanged.**

The app already has three things with similar names. This is none of them:

| Already in the app | What it is | How this is different |
|---|---|---|
| **Sales reps & rewards** (Sales section) | A business's own reps, who bring customers to *that café* | These reps bring *business owners* to Business Agent |
| **Referrals** (give a month, get a month) | A business shares its link with another business | A rep isn't a business, and earns money, not free months |
| **Partners** | A gestoría's read-only login to some areas | A rep never sees inside a business |

In the code, call these **HQ reps**, to keep them apart from the café's `sales_reps`.

## 1. How it works

```
 Julio (rep, cafés)              Café owner                          Business Agent (HQ)
 ──────────────────              ──────────                          ───────────────────
 shows the 2-minute video   ──▶  scans Julio's QR or types JULIO27
 or the demo on his phone        signs up, "Add my business": Café   business marked as Julio's
                                 set-up guide with the café apps     stage: signed up → set up
 sits with them to connect       chooses a plan, a month free        stage: trial → paying
 Square, Google, Instagram                                           each paid invoice: Julio earns
 sees it all on his own page ◀─────────────────────────────────────  paid out monthly
```

## 2. Categories

The six kinds a business picks at sign-up today (`src/pages/NewBusinessPage.tsx`), each with its
set-up guide (`src/app/setupPresets.ts`). A rep covers one or more; the business's own kind says
which category every sign-up is, so the numbers by category need nothing from the rep.

| Category | What sells it | Who knows these owners (good reps) | Rep |
|---|---|---|---|
| **Café & coffee shop** | Built with Easy Beans. Rota and the registro de jornada (the law), Square sales, one change and Google Maps, the website, the TV and the menu follow, menu costing, Instagram and TikTok | Coffee roasters' and machine reps, equipment technicians, bakery, milk and packaging suppliers | **Julio** |
| **Restaurant & bar** | Reviews answered, the Google listing right, menu and allergens, split-shift rota, WhatsApp to the team | Food and drink wholesalers, wine merchants, kitchen equipment, till installers | open |
| **Pub** | The football, rugby and UFC calendar with the big nights, match and quiz nights posted, rota, Square | Brewery and drinks reps (they visit every pub every week), sports-TV installers | open |
| **Salon & beauty** | Instagram and TikTok planner, WhatsApp reminders, reviews | Pro-product distributors, salon furniture sellers, beauty academies | open |
| **Real estate agency** | Enquiries, viewings in the calendar, each property's files, new listings on the socials and ads | Property photographers, lawyers and notaries, mortgage brokers | open |
| **Something else** | Rota, the legal hours record, the Google listing | Gestorías and accountants: they know every small business, and some already use Partners | open |

Categories to add next, for the Costa del Sol: **beach club & chiringuito**, **gym, fitness & yoga
studio**, **bakery & pastry**, then hotel / B&B / holiday lets, shop & boutique, clinic (physio,
dental, vet). Each is a small build: a kind at sign-up (and in `create_business()`), a set-up guide
preset, ready-made roles, and a line on the landing page.

**Not exclusive.** A category has a lead rep (Julio for cafés) who knows its pitch and can build a
crew, but any rep can sign any business: the code the business used decides whose it is.

## 3. Codes

- One code per rep, made from their name like the café reps' codes: **JULIO27** (`new_rep_code()`).
- It comes as a link (`<site>/?ref=JULIO27`, the link businesses already use for referrals), a QR
  code, and business cards to print, ten to an A4 sheet (the Sales reps & rewards cards).
- The owner can also type it on **Add my business** ("Did someone introduce you? Their code").
- A rep code and a business's referral code never look alike (a name and two digits against eight
  random letters and digits), and making a code checks both lists.

## 4. What the business gets

**A month free**, on top of the 2-month trial on Business: the same month a referred business gets
today, credited on its Stripe bill (`referred_month`, `worker/billing.ts`). **And the rep helps set
it up**: half an hour together on the owner's phone, connecting the till, Google and Instagram. That
help is the real reason to sign with a rep rather than alone.

## 5. What the rep earns (suggested)

- **€50** when the business makes its first payment, on any paid plan.
- **20% of what it pays** (without IVA) for its **first 12 paid months**. On a yearly plan: 20% of
  the year's payment, once.
- **Nothing for the Free plan.** Those businesses still show on the rep's page and count as sign-ups.
- **A crew's lead earns 10%** of what their crew earns (the crew share Sales reps & rewards already
  has). Julio can bring in, say, a roaster's delivery driver who sees thirty cafés a week.
- Each line **waits 30 days** (in case of a refund), then counts. Paid monthly, once over €50,
  against the rep's invoice.

What it comes to for Julio with 10 cafés, all on monthly billing:

| | Cafés | They pay a month | Julio earns |
|---|---|---|---|
| Starter (€39) | 4 | €156 | |
| Pro (€79) | 4 | €316 | |
| Business (€129) | 2 | €258 | |
| **Total** | **10** | **€730** | **€146 a month** (20%) |
| First payments | | | **€500** once (10 × €50) |
| **First year** | | | **about €2,250** |

For Business Agent that's about a quarter of what those cafés pay in their first year, and nothing
after. Business-plan cafés pay first after their trial and free month, so Julio's money from those
starts later.

## 6. Rules

- **One rep per business.** The code used when the business is created wins. Forgot it? HQ can add
  it within 30 days of sign-up.
- **No commission on** the rep's own business, a business that was already signed up, or one with
  the rep's email.
- **Refunds:** a refund or chargeback within the 30 days turns the line down; after it's paid, it
  comes off the next payout.
- **Cancelled:** commission stops; if the business comes back inside its 12 months, it carries on.
- **A rep who stops:** what's earned is paid. The rest of the 12 months for businesses they brought
  is a decision (section 10).
- **Conduct:** no discounts beyond the month free, no promising features that aren't there, no paid
  ads on the name "Business Agent", no codes on coupon sites, no cold messaging in bulk. A rep never
  asks for an owner's passwords; they set things up on the owner's phone, together.

## 7. Julio's kit

- His code, link, QR and printed cards ("A month of Business Agent free, and I'll set it up with you").
- The café video, *Run your café from one place* (2 minutes, on the Demos page), and the clickable
  demo to show on his phone: one file with sample data that works offline
  (`node scripts/build-demo-page.mjs`; it isn't on the website).
- A café one-pager: the five things above, the plans, Easy Beans as the café it was built with.
- His own page (section 8).

## 8. Who sees what

- **The rep**, on their own private page (a link, no sign-in, like the café reps' `/rep/<link>`):
  their code, link, QR and cards; **their businesses** with name, category, stage (signed up, set
  up, trial, paying, cancelled), plan and since when; what they've earned, what's waiting, what's
  been paid; their place this month; their crew; the pitch kit for their category. **Nothing from
  inside a business**: no team, sales, money or messages.
- **The business owner**: "Julio, from Business Agent, introduced you: your first month is free" at
  sign-up, and "Introduced by Julio" on Billing. The privacy policy says what a rep sees.
- **HQ (Aron)**: every rep by category with their code; every introduced business by rep and stage;
  by category: links opened, sign-ups, set up, paying, monthly revenue brought in, cancelled within
  90 days; commission to approve and pay.

## 9. Building it

### Run it as our own business in the app

Business Agent itself becomes a business in the app, **Business Agent HQ**, and runs its reps on its
own **Sales reps & rewards** page (not a paid feature, so the Free plan is enough). Most of what's needed is there:
reps with codes, printable cards, crews with a leader's share, each rep's private page, approvals,
commission paid out, the monthly leaderboard and the AI connector's tools ("how much do we owe Julio
this month?"). It also shows owners how they can run reps of their own. What's missing is the
bridge from sign-ups and Stripe to that page. A separate HQ console would be cleaner but means
building all of that again; it's worth it only with dozens of reps.

### Phase 0: start Julio this week, nothing built

1. Agree the terms with Julio (section 11).
2. Aron signs up **Business Agent HQ** as a new business on the live app, with a second email (an
   account is in one business, and his runs Easy Beans), sets its card offer, and adds Julio on its
   Sales reps & rewards page (an ambassador, so he earns commission). Julio gets his code
   **JULIO27**, his private page and cards to print.
3. Until the sign-up page takes rep codes, Julio sends Aron each café that signs up, the same day.
4. **The month free:** Aron adds it as credit on the café's Stripe customer (Customers → the
   business → Adjust balance), the way the app adds referral months. Not a Stripe promotion code: a
   "first invoice" coupon is used up by the €0 invoice that starts the Business trial.
5. Each month Aron checks the cafés' payments in Stripe and logs Julio's €50s and 20% lines on the
   HQ's Sales reps & rewards (a "20% of a payment" reward, a percentage of the sale), then records
   the payout against Julio's invoice.

### Phase 1: codes at sign-up, commission from Stripe

One pull request, switched off (`src/app/features.ts`) with its migration in `supabase/pending/`
until it's switched on.

1. **The HQ business:** `business.is_hq` (one at most).
2. **Rep codes at sign-up:** `/api/referrals/open` (`worker/referrals.ts`) also finds an active HQ
   rep by code and says who and what the offer is; the landing page shows "Julio introduced you" and
   **Add my business** picks the rep's category to start with. `create_business()` puts the business
   down as the rep's (`business.introduced_by`) and gives it its month (`referred_month`), unless the
   new owner's email is the rep's.
3. **Stages** from what's already recorded: created, set up (`business_set_up()`), the billing
   status from Stripe.
4. **Commission from Stripe:** on `invoice.paid` (`worker/billing.ts`), for a business with a rep,
   a service-role function writes the HQ's lines: the €50 on the first payment, 20% of each payment
   for the first 12 paid months. Once per invoice (a unique Stripe invoice id on `rep_rewards`).
   Lines wait 30 days, then the nightly job lets them count; a refund (`charge.refunded`) turns one
   down or takes it off.
5. **Categories on reps:** which kinds each rep covers (`sales_reps`), shown and filtered on the
   HQ's Sales reps & rewards only.
6. **The rep's businesses on their page** (`worker/repPage.ts`). This reads across businesses, so
   it goes on the list in `scripts/ci/business-scope.test.ts`.
7. **HQ's Businesses view:** every introduced business with its rep and stage, and the numbers by
   category.
8. **Billing page:** "Introduced by Julio". The privacy policy's paragraph on reps.
9. **Tests:** sign-up with a rep code (and the rep's own email refused), one commission per
   invoice, the 12-month limit, refunds, the business-scope test, the banner and the rep's page in
   the demo browser tests.

### Phase 2

- **Leads:** a rep puts down a business they're talking to; if it signs up within 60 days without a
  code, it's still theirs.
- A one-pager per category, made from the landing page's words.
- A monthly payout export (CSV) for the gestoría.
- The AI connector: each rep's businesses and what's owed.

### Phase 3

- The next categories (section 2).
- A "Become a rep" page on the website with an application form.
- Areas (Marbella, Estepona, Málaga…) once there are several reps per category.

## 10. Decisions for you

| # | Question | Suggested | Other ways |
|---|---|---|---|
| 1 | What does the business get? | A month free, and set-up help | A third month of trial on Business; 20% off for 3 months |
| 2 | What does the rep earn? | €50 at first payment + 20% for 12 paid months | 30% for 12 months, no €50; a flat €100 per paying business |
| 3 | What does a category lead get extra? | 10% of their own crew's commission | A share of every business in their category, from any rep |
| 4 | Are categories exclusive? | No: the code decides | Yes, one rep per category per area |
| 5 | Where does it run? | Business Agent HQ as a business in the app | A separate HQ console |
| 6 | A rep who stops: the rest of their 12 months? | Paid, unless they broke the rules | Stops when they stop |
| 7 | Who can be a rep? | Anyone who can invoice us (autónomo or company) | Also friends who just pass a code on, for a smaller one-off thank-you |

## 11. Paperwork

A one-page rep agreement: independent (not employed, can't sign for Business Agent), the
commission in section 5, the 30-day wait and refunds, the conduct rules, no access to businesses'
data, 30 days' notice to end, paid monthly against the rep's invoice.

Questions for the gestoría and the lawyer before Julio's first payout:

- How Julio invoices (autónomo or company), the IVA on his invoice and any IRPF retention.
- Whether an ongoing commission arrangement is a *contrato de agencia* (Ley 12/1992), which can
  give the rep a payment for the clients they brought when it ends, and how the agreement handles that.
- What the privacy policy has to say about a rep seeing a business's name, category, stage and plan.
