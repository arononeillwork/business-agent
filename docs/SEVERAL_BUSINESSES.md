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
- **A trigger that refuses deleting a row:** first `if public.business_being_deleted(old.business_id) then
  return old; end if;`, so the business can still be deleted with its rows ("Closing an account" below).

`supabase/tests/zzzz_several_businesses.test.sql` fails if a table has no `business_scope` policy, a
security definer function would see every business, or a unique key spans businesses; it also runs
two businesses side by side.

## Business Agent HQ

Business Agent itself is a business in the database, **Business Agent HQ** (`business.is_hq`, one at most;
nobody changes it from the app), whose reps sell Business Agent (docs/REPS_PLAN.md). Everything HQ reads is
in its own rows; what crosses businesses is done by functions that stay with postgres, each listed in
`zzzz_several_businesses.test.sql`: a sign-up reading HQ's reps (`create_business`, `add_rep_code`,
`rep_by_code`), a business's name, set-up and billing copied onto HQ's list (`rep_introduction_sync`), and
a payment or a refund writing HQ's ledger (`record_rep_commission`, `reverse_rep_commission`). The
`hq_reps` migration makes HQ on a database people already use; a brand-new one runs
`select public.start_hq();` when it wants one (the database tests do, last).

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

## Someone in more than one business

An account is in one business (`profiles.business_id`): its role, pay access, colour, PIN and rota
settings are that business's, and everything in the database leans on that. So someone in two
businesses (an owner with two cafés, Aron with Easy Beans and Business Agent HQ, a barista who works
at two places) has an account in each, and the app keeps them all signed in on the device and switches
between them, like Slack's workspaces. Nothing changes in the database.

- **Switch business:** top left on a computer, beside the business's name, and in the account menu (the
  phone's too). My account lists them as well. Switching starts the app again in the other business.
- **Add another business** shows sign-in for it, with the businesses already on the device a click away.
  A new business is a new account with another email (`name+cafe2@gmail.com` reaches the same inbox).
- **Sign out** signs out of every business on the device, so a shared tablet keeps none of them; one can
  be taken off on its own from My account.
- How: Supabase keeps the open business's sign-in under its own key; the others wait in localStorage
  (`business-agent.accounts`, `src/data/deviceAccounts.ts`) and switching hands one to `setSession()`.
  Adding one takes the open sign-in off the device without ending it. Other tabs start again too, so
  none goes on showing one business while it reads and writes as another.

A single sign-in for several businesses would need the per-business parts of `profiles` (role, pay
access, PIN, rota settings) moved to a table of memberships, and every policy and page that reads them
changed: worth doing if people in several businesses become common.

## By hand (SQL editor)

With several businesses, say which one: `select public.grant_complimentary('friends_family', 'Note', 7);`
(the business number last), `select public.end_complimentary(7);`. For anything else, inside a
transaction: `select set_config('app.business_id', '7', true);` first.

HQ's admins do the usual ones from the app instead: on the Businesses page each business's menu makes it
complimentary (founding account, or friends & family, with a note) or ends that (`hq_set_complimentary()`,
`hq_end_complimentary()`, the `hq_actions` migration; not while a Stripe subscription runs, so that is
cancelled in Stripe first), and gives a free trial 7, 14 or 30 days more (`worker/hq.ts`, through Stripe).

Under the totals, the page's funnel (`hq_funnel()`, the `hq_funnel` migration; `shared/hqFunnel.ts`) counts the
businesses that signed up, finished set-up, were active in week two, are on a trial, pay, and cancelled, each
with its share of the sign-ups. Active in week two: someone in the business clocked in, added a shift or made
a change the audit log keeps with who made it, from day 7 to day 14 after it was created; one younger than 14
days is "not yet" and left out of that share. Cancelled: an owner asked to close the account, or its Stripe
subscription was cancelled (ended or set to end; not a complimentary one), in the month of the earlier of the
two. Stripe's date is kept in `billing.canceled_at`, copied by the Worker's sync.

## Closing an account

An owner closes the account on Billing (`worker/account.ts`, the `close_account` migration). It closes 30
days after they ask (`business.closing_requested_at` and `closing_requested_by`); until then everything
works as before, a banner says when it closes, and an owner can keep it with one click. Its subscription
stops renewing at once (`cancel_at_period_end`, marked in Stripe so keeping the account renews it again):
nothing more is charged and nothing is refunded. HQ's admins get a notification each time (`notify_hq()`),
support@ an email when Cloudflare Email Sending is on, and the Businesses page shows when each closes. On
the same card the owner downloads everything as CSV files in a zip (`export_tables()`, `export_part()`:
the business's own rows only, without stored tokens, key and PIN hashes or the app's plumbing).

Deleting the data once it has closed is HQ's, by hand, for now. The working-hours record (registro de
jornada) must be kept for four years, and it hangs together with other rows: `time_entries` with their
`breaks`, `time_entry_changes` and `correction_requests`, the `profiles`, `positions` and `break_types` they
point to, and the `business` row, whose deletion deletes every row of the business. A nightly job that
deleted everything else wasn't safe enough to write without a way to try it on real data. So, once a
business has closed, HQ deletes it in two steps in the SQL editor (business 7 here):

1. **Once it has closed.** Cancel its Stripe subscription at once if it still has one. Then delete every
   row of it but the working-hours record, and switch its people off so nobody signs in. The transaction
   names the business twice: `app.business_id`, as for anything by hand, and `app.deleting_business`,
   which lets its rows past the checks meant for someone deleting one row (`business_being_deleted()`, the
   `delete_business` migration; it counts in the SQL editor only, never from the app or the API). It
   refuses a business that hasn't closed, and deletes nothing if a row is still pointed to.

   ```sql
   begin;
   select set_config('app.business_id', '7', true), set_config('app.deleting_business', '7', true);
   do $$
   declare
     v_business int := nullif(current_setting('app.deleting_business', true), '')::int;
     -- The working-hours record, kept four years, and the rows it points to.
     v_keep text[] := array['time_entries', 'breaks', 'time_entry_changes', 'correction_requests', 'profiles', 'positions', 'break_types'];
     v_table regclass;
     v_rows bigint;
     v_gone bigint;
     v_stuck text[];
   begin
     if v_business is null or v_business::text is distinct from current_setting('app.business_id', true) then
       raise exception 'Name the business in this transaction: app.business_id and app.deleting_business';
     end if;
     if not exists (select 1 from public.business where id = v_business and closing_requested_at <= now() - interval '30 days') then
       raise exception 'Business % hasn’t closed', v_business;
     end if;
     -- Every table with rows of it, round after round until one deletes nothing: a row that another one
     -- still points to goes in a later round, once that one has gone.
     loop
       v_gone := 0;
       v_stuck := '{}';
       for v_table in
         select c.oid::regclass from pg_class c
          where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname <> all (v_keep)
            and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'business_id' and not a.attisdropped)
          order by c.relname
       loop
         begin
           execute format('delete from %s where business_id = $1', v_table) using v_business;
           get diagnostics v_rows = row_count;
           v_gone := v_gone + v_rows;
         exception when foreign_key_violation then
           v_stuck := v_stuck || v_table::text;
         end;
       end loop;
       exit when v_gone = 0;
     end loop;
     if cardinality(v_stuck) > 0 then
       raise exception 'Nothing deleted: rows of % are still pointed to', array_to_string(v_stuck, ', ');
     end if;
     -- Its people switched off, so nobody signs in to it.
     update public.profiles set active = false where business_id = v_business;
   end $$;
   commit;
   ```

2. **Four years after its last timecard** (`select max(clock_in) from public.time_entries where business_id = 7;`).
   Delete the business row, which deletes everything left of it, and its people's accounts (an account
   is in one business):

   ```sql
   begin;
   create temp table closing_people on commit drop as select id from public.profiles where business_id = 7;
   delete from public.business where id = 7;
   delete from auth.users where id in (table closing_people);
   commit;
   ```

While a business row is being deleted the same checks let its rows go, so step 2 alone deletes a business
and everything of it in one go (one with no working hours to keep). Its photos, videos and camera video
are in its own Google Drive or OneDrive, and stay there. `supabase/tests/zzzzzzzzzzzzzzz_delete_business.test.sql`
runs both steps, and step 2 alone, on every business the tests made.
