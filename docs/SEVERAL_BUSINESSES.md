# Several businesses in one database

Business Agent started as Easy Beans' own app: one database with one business in it. Now any number
of businesses share the one database, Worker and app, each seeing only its own data. Easy Beans is
business 1 and kept everything it had.

## How a business's data stays its own

- **Every table has `business_id`.** It's filled in by the database (`default current_business_id()`),
  so nothing that adds a row has to say whose it is. The only tables without it are Business Agent's
  own plans and prices (`plan_limits`, `pay_per_use`). The `business` row itself is keyed by `id`.
- **One policy per table does the separating.** `business_scope` is a *restrictive* row-level security
  policy: `business_id = current_business_id()`. Restrictive means it's added to every other policy
  on the table, whatever they allow (admins, pay access, partners…), so those didn't change.
- **Who a request is for** (`current_business_id()`):
  - someone signed in: their business (`profiles.business_id`; none for someone who signed up and
    isn't in a business yet: they see their own profile and nothing else);
  - the Worker (service role): the business in its `x-business-id` header (nobody else's header counts);
  - the minute and nightly jobs: each business in turn (`each_business()`);
  - a trusted SQL function, for the rest of its transaction: `app.business_id`;
  - while there's only one business, the service role and the SQL editor fall back to it.
- **Keys are per business.** One-row tables (`settings`, `billing`, `brand`…) are keyed by
  `business_id` and keep `id = 1`, so `where id = 1` still means "this business's row". Rows named by
  something outside (a provider, a Google place, a match, a Square id, a position's name) are unique
  within a business, not across all of them.

## SQL functions

A `security definer` function runs as its owner. Owned by `postgres`, it skipped row security and saw
every business. They're now owned by **`app_definer`**, a role that doesn't skip it: inside one, a
query sees the caller's business only, so the functions themselves didn't change. A few stay with
`postgres` on purpose: the helpers the policies call (`is_admin()`, `can_see_pay()`… which read only
the caller's own profile), `current_business_id()`, `handle_new_user()` and `each_business()`.
Checks that run with the caller's rights (`plan_profiles_rule`, `claim_rules`…) filter by
`new.business_id`, because the Worker skips row security.

Some requests name no business: the service key without the `x-business-id` header, Supabase's
sign-in service (creating or deleting an account) and the SQL editor. A trigger that needs a
business's plan or writes a business's rows (`plan_profiles_rule()`, `audit_row()`) acts for the
row's own business while it does (`set_config('app.business_id', …, true)`), then puts back what was
set, so it works for those too (the `business_of_the_row` migration). The live tests' service key
names Easy Beans with the header, as the Worker does.

## The Worker

- `businessDb(env, id)` (`worker/supabase.ts`) is the service role acting for one business: every
  read, change and delete is filtered to its rows, and the header makes what it writes, and what the
  SQL functions do, that business's.
- Signed-in routes use `requestDb(c)`: the business of whoever signed in.
- Links and webhooks find their business first: a screen's token, a calendar feed's owner, a Stripe
  customer, a Square merchant, an AI image, a referral code, whoever started a connection.
- The minute and nightly jobs run for each business (`forEach` in `worker/index.ts`).
- `serviceClient(env)`, over every business, is only for finding which business something is and for
  accounts; `scripts/ci/business-scope.test.ts` lists where, so a new use is a choice.
- Business Agent's own accounts in the Worker's secrets, the WhatsApp number and Google place
  (`GOOGLE_PLACE_ID`), are Easy Beans' (`SECRETS_BUSINESS_ID`); other businesses connect their own.
- Media links name the business whose Drive or OneDrive holds the file: `/media/<g|o>/<business>/…`
  (older links without one are business 1's).

## Rules for new work

- **A new table:** `select public.add_business_scope('public.<table>');` right after creating it.
- **A unique key:** put `business_id` first, unless the column is unique by itself (a uuid, a secret token).
- **A new `security definer` function:** `alter function public.<name>(<args>) owner to app_definer;`
- **Seeding rows in a migration:** one per business: `insert … select id, … from public.business`.
- **An upsert:** the conflict target includes `business_id` (`onConflict: 'business_id,key'`).
- **The Worker:** `businessDb`/`requestDb`, never `serviceClient`, for a business's rows.

`supabase/tests/zzzz_several_businesses.test.sql` fails if a table has no `business_scope` policy, a
security definer function would see every business, or a unique key spans businesses; it also runs
two businesses side by side.

## A new business signs up

1. **Sign up.** Anyone can create an account on the sign-in page. Someone nobody invited is in no
   business yet (`handle_new_user()`); the one exception is a brand-new database whose only business
   has no admin, where the first person to sign up runs it.
2. **Add my business** (`src/pages/NewBusinessPage.tsx`). Signed in and in no business, the app
   asks for the business's name, kind and time zone and calls `create_business()`. That makes the
   business and everything a business starts with (its settings rows, the apps to connect, the sports
   catalogue, to-do categories, itself on Competitors, positions and a break for its kind), and makes
   its creator the admin and owner, on the Free plan. It stays with `postgres`: it works across
   businesses (the new one, and the referrer's list).
3. **The set-up guide** (`/setup`) opens, preset for the kind of business.

Someone joining a team instead asks their manager to add their email on the Team page: an account
that exists and is in no business joins straight away (`joinBusiness`).

A referral link (`/?ref=CODE`) is kept in the browser through sign-up. The new business gets its first
month free and is put down as referred (`business.referred_by`); the referrer's list shows it
(`referrals.became`), and the referrer's month counts once the new business finishes the set-up
guide (`business_set_up()`).

## By hand (SQL editor)

With several businesses, say which one: `select public.grant_complimentary('friends_family', 'Note', 7);`
(the business number last), `select public.end_complimentary(7);`. For anything else, inside a
transaction: `select set_config('app.business_id', '7', true);` first.
