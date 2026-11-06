-- Business Agent's own sales reps (docs/REPS_PLAN.md, Phase 1). People who know business owners
-- sell Business Agent for us: each has a code, a business that signs up with it gets a month free
-- and help setting up, and the rep earns commission on what that business pays.
--
-- Business Agent runs them as a business of its own in the app, Business Agent HQ, on its Sales reps
-- & rewards page, which already has reps with codes, crews, each rep's own page, approvals and
-- payouts. This adds the bridge from sign-ups and Stripe to it:
-- 1. HQ: the business that is Business Agent itself (business.is_hq, one at most), with its reward
--    list (€50 at a business's first payment, 20% of what it pays for its first 12 paid months) and
--    its first rep, Julio, for cafés (a temporary email until we have his).
-- 2. A rep's code at sign-up: create_business() takes an HQ rep's code as well as another business's.
--    The new business gets its month free (billing.referred_month) and HQ has it on its list
--    (rep_introductions), kept up to date as the business sets up and pays. An owner who forgot the
--    code adds it on Billing within 30 days (add_rep_code()).
-- 3. Commission from Stripe: each invoice the business pays (record_rep_commission(), from the
--    Worker's webhook) earns its rep a line on HQ's ledger. Each waits 30 days, in case of a refund,
--    then counts by itself (release_rep_commission(), nightly); a refund takes it back
--    (reverse_rep_commission()).
-- What crosses businesses (a sign-up reading HQ's reps, a payment writing HQ's ledger) is done by the
-- few functions here that stay with postgres; everything HQ reads is in its own rows.

-- ---------------------------------------------------------------------------
-- 1. HQ, and when each business was made
-- ---------------------------------------------------------------------------
alter table public.business
  add column is_hq boolean not null default false,
  -- When the business was made (those already here: now). A rep's code can be added in its first 30 days.
  add column created_at timestamptz not null default now();
create unique index business_one_hq on public.business (is_hq) where is_hq;

-- Which business is HQ, and when a business was made, are Business Agent's to set, never the app's.
create or replace function public.business_fixed_columns() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if coalesce(public.request_role(), '') in ('authenticated', 'anon') then
    new.is_hq := old.is_hq;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
create trigger business_fixed_columns before update on public.business for each row execute function public.business_fixed_columns();

-- The kind of business, from what it's called (create_business() names each kind).
create or replace function public.business_kind(p_type text) returns text
language sql immutable set search_path = ''
as $$
  select case p_type when 'Café' then 'cafe' when 'Restaurant & bar' then 'restaurant' when 'Pub' then 'pub'
                     when 'Salon & beauty' then 'salon' when 'Real estate agency' then 'real_estate' else 'other' end;
$$;

-- The rep's name on the business's own Billing page ("Introduced by Julio").
alter table public.billing add column introduced_by text check (char_length(introduced_by) <= 120);

-- ---------------------------------------------------------------------------
-- 2. Reps: the kinds of business each covers; HQ's reps all earn commission
-- ---------------------------------------------------------------------------
alter table public.sales_reps add column categories text[] not null default '{}'
  constraint sales_reps_categories_check check (categories <@ array['cafe', 'restaurant', 'pub', 'salon', 'real_estate', 'other']);

-- At HQ nobody earns credit to spend in a café: someone added as a customer (a rep adding to their
-- crew from their page) is an ambassador. Categories are kept in order, once each.
create or replace function public.hq_rep_kind() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.kind = 'customer' and exists (select 1 from public.business where id = new.business_id and is_hq) then
    new.kind := 'ambassador';
  end if;
  new.categories := array(select distinct c from unnest(coalesce(new.categories, '{}')) c order by c);
  return new;
end $$;
create trigger sales_reps_hq_kind before insert or update on public.sales_reps for each row execute function public.hq_rep_kind();

-- HQ's list: the two rewards that count by themselves when a business pays.
alter table public.reward_rules add column hq_role text
  constraint reward_rules_hq_role_check check (hq_role in ('first_payment', 'payment')),
  add constraint reward_rules_hq_role_basis check (hq_role is null or (hq_role = 'first_payment') = (basis = 'fixed'));
create unique index reward_rules_hq_role_key on public.reward_rules (business_id, hq_role);

-- ---------------------------------------------------------------------------
-- 3. The businesses HQ's reps introduced
-- ---------------------------------------------------------------------------
-- HQ's own rows, one per business that signed up with a rep's code: who, and how it's doing (kept up
-- to date from that business by rep_introduction_sync()). Nothing from inside the business.
create table public.rep_introductions (
  id               uuid primary key default gen_random_uuid(),
  rep_id           uuid references public.sales_reps on delete set null,
  -- The business it introduced.
  introduced       int not null references public.business on delete cascade,
  -- The code it used.
  code             text not null check (char_length(code) <= 16),
  name             text not null,
  kind             text not null default 'other' check (kind in ('cafe', 'restaurant', 'pub', 'salon', 'real_estate', 'other')),
  set_up_at        timestamptz,
  plan             text not null default 'free',
  status           text not null default 'none',
  billing_interval text,
  -- Its first payment that earned commission.
  first_paid_at    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
select public.add_business_scope('public.rep_introductions');
create unique index rep_introductions_introduced_key on public.rep_introductions (business_id, introduced);
create index rep_introductions_introduced_idx on public.rep_introductions (introduced);
create index rep_introductions_rep_idx on public.rep_introductions (rep_id);
alter table public.rep_introductions enable row level security;
revoke all on public.rep_introductions from anon;
revoke insert, update, delete on public.rep_introductions from authenticated;
create policy rep_introductions_admin_read on public.rep_introductions for select to authenticated using ((select public.is_admin()));

-- Each time someone opens a rep's link (nothing about them: which rep, and when).
create table public.rep_code_opens (
  id        bigint generated always as identity primary key,
  rep_id    uuid not null references public.sales_reps on delete cascade,
  opened_at timestamptz not null default now()
);
select public.add_business_scope('public.rep_code_opens');
create index rep_code_opens_rep_idx on public.rep_code_opens (rep_id, opened_at);
alter table public.rep_code_opens enable row level security;
revoke all on public.rep_code_opens from anon;
revoke insert, update, delete on public.rep_code_opens from authenticated;
create policy rep_code_opens_admin_read on public.rep_code_opens for select to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- 4. The ledger: commission from payments, held 30 days, and refunds taken back
-- ---------------------------------------------------------------------------
alter table public.rep_rewards
  -- The business whose payment it was.
  add column introduction_id uuid references public.rep_introductions on delete set null,
  -- Where it came from: stripe:<invoice> (its 20%), stripe:<invoice>:first (the first payment's €50),
  -- refund:<line> (a refund taken back). Each counts once.
  add column source text check (char_length(source) <= 200),
  -- Of the 12 paid months that earn commission, how many this payment was (1 a month, up to 12 a year).
  add column months int check (months between 1 and 12),
  -- It waits until then (a refund in the meantime takes it back), then counts by itself.
  add column counts_from date,
  -- The line a refund takes back.
  add column reverses uuid references public.rep_rewards on delete cascade;
create unique index rep_rewards_source_key on public.rep_rewards (business_id, source);
create index rep_rewards_introduction_idx on public.rep_rewards (introduction_id);
create index rep_rewards_reverses_idx on public.rep_rewards (reverses);
create index rep_rewards_held_idx on public.rep_rewards (counts_from) where status = 'pending' and counts_from is not null;
-- clawback: a refund taken back (−). It waits with the line it takes back.
alter table public.rep_rewards drop constraint rep_rewards_kind_check,
  add constraint rep_rewards_kind_check check (kind in ('earn', 'redeem', 'payout', 'clawback'));
alter table public.rep_rewards drop constraint rep_rewards_settled,
  add constraint rep_rewards_settled check (kind in ('earn', 'clawback') or status = 'approved');

-- ---------------------------------------------------------------------------
-- 5. What every new business starts with (from create_business(), unchanged), for HQ too
-- ---------------------------------------------------------------------------
-- The business whose rows these are is the one in app.business_id. Not callable from the app: it runs
-- inside create_business() and start_hq().
create or replace function public.seed_new_business(p_kind text) returns void
language plpgsql set search_path = ''
as $$
declare v_id int := nullif(current_setting('app.business_id', true), '')::int;
begin
  if v_id is null then raise exception 'Say which business: app.business_id'; end if;
  insert into public.business_admin_notes default values;
  insert into public.settings default values;
  insert into public.billing default values;
  insert into public.brand default values;
  insert into public.music_player default values;
  insert into public.tax_settings default values;
  insert into public.ad_settings default values;
  insert into public.pnl_settings default values;
  insert into public.website_checks default values;
  insert into public.competitor_settings default values;
  insert into public.rep_settings default values;
  insert into public.kitty_settings default values;
  insert into public.grant_profile default values;
  -- Every app the others can connect, and the sports catalogue (nothing followed yet).
  insert into public.integrations (provider) select distinct provider from public.integrations where business_id <> v_id;
  insert into public.sports_competitions (code, source, source_id, name, sport, region, kind, season_style, followed, sort)
  select distinct on (code) code, source, source_id, name, sport, region, kind, season_style, false, sort
    from public.sports_competitions where business_id <> v_id order by code, business_id;
  insert into public.todo_categories (name, hint, colour, sort) values
    ('Legal & money',    'Contracts, licences, insurance, bills', '#2F4C73', 1),
    ('People',           'Roles, reviews, standards, hiring, pay', '#21907F', 2),
    ('Shop',             'The space: fit-out, repairs, cleaning',  '#D46A2E', 3),
    ('Buying',           'Stock, packaging, equipment',            '#C2961C', 4),
    ('Food & drink',     'Menu, recipes, ingredients, prep',       '#4F8A3F', 5),
    ('Tech & till',      'Till, wifi, TV, website',                '#4B4FB0', 6),
    ('Design',           'Menus, signage, branding, print',        '#7C52AE', 7),
    ('Social & content', 'Photos, videos, posts',                  '#2479A8', 8),
    ('Marketing',        'Events, collabs, outreach',              '#B23C78', 9),
    ('Future ideas',     'New business ideas for later',           '#6E7D1A', 10);
  insert into public.competitors (is_self, name) select true, left(name, 120) from public.business where id = v_id;
  insert into public.positions (name, colour, sort)
  select x.name, x.colour, x.sort from (values
      ('cafe', 'Barista', '#F79BA4', 1), ('cafe', 'Kitchen', '#6B8E4E', 2),
      ('restaurant', 'Floor', '#F79BA4', 1), ('restaurant', 'Kitchen', '#6B8E4E', 2), ('restaurant', 'Bar', '#B7A3D8', 3),
      ('pub', 'Bar', '#F79BA4', 1), ('pub', 'Kitchen', '#6B8E4E', 2),
      ('salon', 'Stylist', '#F79BA4', 1), ('salon', 'Reception', '#B7A3D8', 2),
      ('real_estate', 'Agent', '#F79BA4', 1), ('real_estate', 'Office', '#B7A3D8', 2)) x(kind, name, colour, sort)
   where x.kind = p_kind
  union all
  select 'Team', '#8d6e63', 1 where coalesce(p_kind, 'other') not in ('cafe', 'restaurant', 'pub', 'salon', 'real_estate');
  -- Spain: 15 minutes' break once a shift is over six hours (shared/rules.ts).
  insert into public.break_types (name, minutes, paid) values ('Rest 15 min (paid)', 15, true);
end $$;
revoke execute on function public.seed_new_business(text) from public, anon, authenticated, service_role;

-- An HQ rep by their code: active, and with an admin's OK. Null when it isn't one.
create or replace function public.hq_rep(p_code text) returns public.sales_reps
language sql stable set search_path = ''
as $$
  select r.* from public.sales_reps r join public.business h on h.id = r.business_id and h.is_hq
   where r.code = nullif(upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g')), '') and r.active and r.approved;
$$;
revoke execute on function public.hq_rep(text) from public, anon, authenticated, service_role;

-- A business came through a rep's code: its month free and the rep's name on its Billing page, a row
-- on HQ's list, and HQ's admins hear about it. Runs inside create_business() and add_rep_code().
create or replace function public.introduce_business(p_business int, p_rep public.sales_reps, p_code text) returns void
language plpgsql set search_path = ''
as $$
declare
  v_was text := current_setting('app.business_id', true);
  v_biz public.business;
begin
  select * into v_biz from public.business where id = p_business;
  perform set_config('app.business_id', p_business::text, true);
  update public.billing set introduced_by = left(p_rep.name, 120), referred_month = true, updated_at = now() where business_id = p_business;
  perform set_config('app.business_id', p_rep.business_id::text, true);
  insert into public.rep_introductions (rep_id, introduced, code, name, kind, set_up_at, plan, status, billing_interval)
  select p_rep.id, p_business, upper(p_code), v_biz.name, public.business_kind(v_biz.business_type), v_biz.setup_completed_at,
         b.plan, b.status, b.billing_interval
    from public.billing b where b.business_id = p_business
  on conflict (business_id, introduced) do nothing;
  insert into public.notifications (profile_id, title, body, link)
  select a.id, v_biz.name || ' signed up with ' || p_rep.name || '’s code', coalesce(v_biz.business_type, 'Another kind of business'), '/sales-reps'
    from public.profiles a where a.business_id = p_rep.business_id and a.role = 'admin' and a.active;
  perform set_config('app.business_id', coalesce(v_was, ''), true);
end $$;
revoke execute on function public.introduce_business(int, public.sales_reps, text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Create my business: also with a rep's code
-- ---------------------------------------------------------------------------
-- The pub_and_estate_agency_kinds migration's, with what every business starts with in
-- seed_new_business(), and the code either another business's (as before) or an HQ rep's. A rep's
-- code doesn't count for the rep's own new business (the same email).
create or replace function public.create_business(p_name text, p_kind text default null, p_timezone text default null,
  p_referral text default null)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_me    public.profiles;
  v_name  text := btrim(coalesce(p_name, ''));
  v_tz    text := coalesce(nullif(btrim(p_timezone), ''), 'Europe/Madrid');
  v_code  text := nullif(upper(regexp_replace(coalesce(p_referral, ''), '\s', '', 'g')), '');
  v_by    public.business;
  v_rep   public.sales_reps;
  v_id    int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into v_me from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Sign in first'; end if;
  if v_me.business_id is not null then raise exception 'Your account is already in a business'; end if;
  if char_length(v_name) not between 1 and 120 then raise exception 'Give your business a name (up to 120 characters)' using errcode = '22023'; end if;
  if p_kind is not null and p_kind not in ('cafe', 'restaurant', 'pub', 'salon', 'real_estate', 'other') then raise exception 'Unknown kind of business' using errcode = '22023'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_tz) then v_tz := 'Europe/Madrid'; end if;
  if v_code is not null then
    select * into v_by from public.business where referral_code = v_code;
    if v_by.id is null then
      v_rep := public.hq_rep(v_code);
      if v_rep.email is not null and v_rep.email = lower(coalesce(v_me.email, '')) then v_rep := null; end if;
    end if;
  end if;

  -- Everything from here is the new business's: its rows, and what their triggers write.
  v_id := nextval('public.business_id_seq');
  perform set_config('app.business_id', v_id::text, true);
  insert into public.business (id, name, business_type, timezone, referred_by)
  values (v_id, v_name,
          case p_kind when 'cafe' then 'Café' when 'restaurant' then 'Restaurant & bar' when 'pub' then 'Pub'
                      when 'salon' then 'Salon & beauty' when 'real_estate' then 'Real estate agency' end,
          v_tz, v_by.id);
  perform public.seed_new_business(p_kind);

  -- Its creator runs it.
  perform set_config('app.business_setup', 'on', true);
  update public.profiles set business_id = v_id, role = 'admin', can_see_pay = true, active = true where id = v_me.id;
  perform set_config('app.business_setup', '', true);

  if v_by.id is not null and v_by.id <> v_id then
    -- Its month for being referred, and the referrer's list (one row per business that joined).
    update public.billing set referred_by = v_by.name, referred_month = true, updated_at = now() where business_id = v_id;
    if v_me.email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      insert into public.referrals (business_id, business_name, contact_name, email, became)
      values (v_by.id, v_name, left(v_me.full_name, 120), lower(v_me.email), v_id)
      on conflict (business_id, email) do update set business_name = excluded.business_name, became = excluded.became;
    end if;
  elsif v_rep.id is not null then
    perform public.introduce_business(v_id, v_rep, v_code);
  end if;
  return v_id;
end $$;
revoke execute on function public.create_business(text, text, text, text) from public, anon;
grant execute on function public.create_business(text, text, text, text) to authenticated;

-- An owner who signed up without the rep's code adds it on Billing, in the business's first 30 days,
-- unless it already came through someone's code. Returns the rep's name.
create or replace function public.add_rep_code(p_code text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_biz public.business;
  v_rep public.sales_reps;
begin
  if not public.can_see_pay() then raise exception 'Only an owner can add a rep’s code'; end if;
  select * into v_biz from public.business where id = public.current_business_id();
  if v_biz.id is null or v_biz.is_hq then raise exception 'Only an owner can add a rep’s code'; end if;
  if v_biz.referred_by is not null or exists (select 1 from public.rep_introductions where introduced = v_biz.id) then
    raise exception 'Your business already came through someone’s code';
  end if;
  if v_biz.created_at < now() - interval '30 days' then raise exception 'A rep’s code can be added in your first 30 days'; end if;
  v_rep := public.hq_rep(p_code);
  if v_rep.id is null then raise exception 'That isn’t a rep’s code. Check it and try again.'; end if;
  if v_rep.email is not null and v_rep.email = lower(coalesce((select email from public.profiles where id = auth.uid()), '')) then
    raise exception 'That’s your own code';
  end if;
  perform public.introduce_business(v_biz.id, v_rep, p_code);
  return v_rep.name;
end $$;
revoke execute on function public.add_rep_code(text) from public, anon;
grant execute on function public.add_rep_code(text) to authenticated;

-- Someone opened a rep's link (the landing page, through the Worker): who it's from and what the
-- card offers, counted when asked. Null: not a rep's code.
create or replace function public.rep_by_code(p_code text, p_count boolean default true) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v public.sales_reps := public.hq_rep(p_code);
begin
  if v.id is null then return null; end if;
  if p_count then insert into public.rep_code_opens (business_id, rep_id) values (v.business_id, v.id); end if;
  return jsonb_build_object('name', v.name, 'categories', to_jsonb(v.categories),
    'offer', (select welcome_offer from public.rep_settings where business_id = v.business_id));
end $$;
revoke execute on function public.rep_by_code(text, boolean) from public, anon, authenticated;
grant execute on function public.rep_by_code(text, boolean) to service_role;

-- HQ's list follows each introduced business: its name, set-up, plan and billing.
create or replace function public.rep_introduction_sync() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name = 'business' then
    update public.rep_introductions set name = new.name, set_up_at = new.setup_completed_at, updated_at = now()
     where introduced = new.id and (name, set_up_at) is distinct from (new.name, new.setup_completed_at);
  else
    update public.rep_introductions set plan = new.plan, status = new.status, billing_interval = new.billing_interval, updated_at = now()
     where introduced = new.business_id and (plan, status, billing_interval) is distinct from (new.plan, new.status, new.billing_interval);
  end if;
  return null;
end $$;
revoke execute on function public.rep_introduction_sync() from public, anon, authenticated;
create trigger rep_introduction_business after update of name, setup_completed_at on public.business
  for each row execute function public.rep_introduction_sync();
create trigger rep_introduction_billing after update of plan, status, billing_interval on public.billing
  for each row execute function public.rep_introduction_sync();

-- ---------------------------------------------------------------------------
-- 7. Commission when an introduced business pays
-- ---------------------------------------------------------------------------
-- The Worker, for the business that paid (Stripe's invoice.paid): what it paid without IVA, in
-- euros, and how many months it was for (1, or 12 for a year). On HQ's ledger, from HQ's list: the
-- first payment's reward (€50) once, and the payment's share (20%) while the business's 12 paid months
-- last (a yearly payment past them counts in part). Each line waits 30 days. Once per invoice.
-- Returns how many lines it added.
create or replace function public.record_rep_commission(p_invoice text, p_amount numeric, p_months int, p_paid_at timestamptz)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_paying  int := public.current_business_id();
  v_was     text := current_setting('app.business_id', true);
  v_intro   public.rep_introductions;
  v_rep     public.sales_reps;
  v_rule    public.reward_rules;
  v_on      date;
  v_from    date;
  v_months  int := least(greatest(coalesce(p_months, 1), 1), 12);
  v_left    int;
  v_amount  numeric;
  v_added   int;
  v_lines   int := 0;
  v_total   numeric := 0;
begin
  if coalesce(p_invoice, '') !~ '^in_\w+$' then raise exception 'Not a Stripe invoice: %', p_invoice; end if;
  if v_paying is null or p_amount is null or p_amount <= 0 then return 0; end if;
  select * into v_intro from public.rep_introductions where introduced = v_paying for update;
  if v_intro.id is null or v_intro.rep_id is null then return 0; end if;
  select * into v_rep from public.sales_reps where id = v_intro.rep_id;
  if v_rep.id is null then return 0; end if;

  perform set_config('app.business_id', v_intro.business_id::text, true);
  v_on := (coalesce(p_paid_at, now()) at time zone public.business_tz())::date;
  v_from := v_on + 30;

  -- The payment's share, for what's left of the 12 paid months.
  select * into v_rule from public.reward_rules where business_id = v_intro.business_id and hq_role = 'payment' and active;
  select 12 - coalesce(sum(months), 0) into v_left from public.rep_rewards
   where introduction_id = v_intro.id and kind = 'earn' and status <> 'rejected' and months is not null;
  if v_rule.id is not null and v_left > 0 then
    v_amount := round(p_amount * v_rule.amount / 100 * least(v_months, v_left) / v_months, 2);
    if v_amount > 0 then
      insert into public.rep_rewards (rep_id, kind, rule_id, label, sale_amount, amount, status, note, occurred_on,
                                      introduction_id, source, months, counts_from, logged_by)
      values (v_rep.id, 'earn', v_rule.id, v_rule.name, p_amount, v_amount, 'pending', left(v_intro.name, 500), v_on,
              v_intro.id, 'stripe:' || p_invoice, least(v_months, v_left), v_from, null)
      on conflict (business_id, source) do nothing;
      get diagnostics v_added = row_count;
      v_lines := v_lines + v_added;
      if v_added > 0 then v_total := v_total + v_amount; end if;
    end if;
  end if;

  -- The first payment's reward, once (again if the one before was turned down).
  select * into v_rule from public.reward_rules where business_id = v_intro.business_id and hq_role = 'first_payment' and active;
  if v_rule.id is not null and not exists (
       select 1 from public.rep_rewards w join public.reward_rules u on u.id = w.rule_id
        where w.introduction_id = v_intro.id and u.hq_role = 'first_payment' and w.kind = 'earn' and w.status <> 'rejected') then
    insert into public.rep_rewards (rep_id, kind, rule_id, label, amount, status, note, occurred_on, introduction_id, source, counts_from, logged_by)
    values (v_rep.id, 'earn', v_rule.id, v_rule.name, v_rule.amount, 'pending', left(v_intro.name, 500), v_on,
            v_intro.id, 'stripe:' || p_invoice || ':first', v_from, null)
    on conflict (business_id, source) do nothing;
    get diagnostics v_added = row_count;
    v_lines := v_lines + v_added;
    if v_added > 0 then v_total := v_total + v_rule.amount; end if;
  end if;

  if v_lines > 0 then
    update public.rep_introductions set first_paid_at = coalesce(first_paid_at, p_paid_at, now()), updated_at = now() where id = v_intro.id;
    insert into public.notifications (profile_id, title, body, link)
    select a.id, v_intro.name || ' paid: €' || to_char(v_total, 'FM999990.00') || ' for ' || v_rep.name,
           'Counts from ' || to_char(v_from, 'FMDD Mon') || ', unless it''s refunded first', '/sales-reps'
      from public.profiles a where a.business_id = v_intro.business_id and a.role = 'admin' and a.active;
  end if;
  perform set_config('app.business_id', coalesce(v_was, ''), true);
  return v_lines;
end $$;
revoke execute on function public.record_rep_commission(text, numeric, int, timestamptz) from public, anon, authenticated;
grant execute on function public.record_rep_commission(text, numeric, int, timestamptz) to service_role;

-- The Worker, for the business whose payment was refunded (or a dispute lost): the share of the
-- invoice given back so far (0 to 1). A line still waiting is turned down when it's all given back;
-- otherwise a line takes that share back (a crew leader's share of it too), waiting with it if it's
-- still waiting. Safe to run again: each line's refund is kept up to date, not added twice.
-- Returns how many lines it changed.
create or replace function public.reverse_rep_commission(p_invoice text, p_share numeric)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_paying int := public.current_business_id();
  v_was    text := current_setting('app.business_id', true);
  v_intro  public.rep_introductions;
  v_share  numeric := least(greatest(coalesce(p_share, 0), 0), 1);
  r        public.rep_rewards;
  v_n      int := 0;
begin
  if coalesce(p_invoice, '') !~ '^in_\w+$' then raise exception 'Not a Stripe invoice: %', p_invoice; end if;
  select * into v_intro from public.rep_introductions where introduced = v_paying;
  if v_intro.id is null or v_share <= 0 then return 0; end if;
  perform set_config('app.business_id', v_intro.business_id::text, true);
  for r in
    select w.* from public.rep_rewards w
     where w.kind = 'earn' and w.status <> 'rejected'
       and (w.source in ('stripe:' || p_invoice, 'stripe:' || p_invoice || ':first')
            or w.bonus_for in (select id from public.rep_rewards where source in ('stripe:' || p_invoice, 'stripe:' || p_invoice || ':first')))
     order by w.bonus_for nulls first
  loop
    if r.status = 'pending' and v_share >= 1 then
      update public.rep_rewards set status = 'rejected', decided_at = now(), note = left(concat_ws(' · ', note, 'Refunded'), 500) where id = r.id;
      delete from public.rep_rewards where reverses = r.id;
    elsif round(r.amount * v_share, 2) > 0 then
      insert into public.rep_rewards (rep_id, kind, label, amount, status, note, occurred_on, introduction_id, source, counts_from, reverses, logged_by,
                                      decided_at)
      values (r.rep_id, 'clawback', 'Refunded', -round(r.amount * v_share, 2), r.status, left(r.label || ' · ' || v_intro.name, 500),
              (now() at time zone public.business_tz())::date, v_intro.id, 'refund:' || r.id, r.counts_from, r.id, null,
              case when r.status = 'approved' then now() end)
      on conflict (business_id, source) do update set amount = excluded.amount;
    end if;
    v_n := v_n + 1;
  end loop;
  perform set_config('app.business_id', coalesce(v_was, ''), true);
  return v_n;
end $$;
revoke execute on function public.reverse_rep_commission(text, numeric) from public, anon, authenticated;
grant execute on function public.reverse_rep_commission(text, numeric) to service_role;

-- Nightly, for each business: lines whose 30 days are up count (a crew leader gets their share). A
-- refund taken back of a line an admin turned down meanwhile goes with it.
create or replace function public.release_rep_commission() returns int
language plpgsql security definer set search_path = ''
as $$
declare
  r   record;
  v_n int := 0;
begin
  for r in select w.id, w.kind, (select status from public.rep_rewards o where o.id = w.reverses) as reversed
             from public.rep_rewards w
            where w.status = 'pending' and w.counts_from is not null and w.counts_from <= (now() at time zone public.business_tz())::date
            order by w.kind = 'clawback', w.created_at for update of w loop
    if r.kind = 'clawback' and r.reversed is distinct from 'approved' then
      if r.reversed = 'rejected' then delete from public.rep_rewards where id = r.id; end if;
      continue;
    end if;
    update public.rep_rewards set status = 'approved', decided_at = now() where id = r.id;
    if r.kind = 'earn' then perform public.pay_crew_bonus(r.id); end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
alter function public.release_rep_commission() owner to app_definer;
revoke execute on function public.release_rep_commission() from public, anon, authenticated;

-- The jobs that run for each business: the holiday_reminders_and_push migration's, plus HQ's commission.
create or replace function public.each_business(p_job text)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  b int;
  v_failed int := 0;
begin
  if p_job not in ('auto_close_entries', 'queue_shift_alerts', 'deliver_event_alerts', 'queue_due_social_posts',
                   'auto_fill_timecards', 'licence_reminders', 'enquiry_follow_ups', 'campaign_reminders',
                   'bank_holiday_reminders', 'release_rep_commission') then
    raise exception 'Not a job that runs for each business: %', p_job;
  end if;
  for b in select id from public.business order by id loop
    perform set_config('app.business_id', b::text, true);
    begin
      execute format('select public.%I()', p_job);
    exception when others then
      v_failed := v_failed + 1;
      raise warning '% failed for business %: %', p_job, b, sqlerrm;
    end;
  end loop;
  perform set_config('app.business_id', '', true);
  return v_failed;
end $$;

-- ---------------------------------------------------------------------------
-- 8. A rep's own page: the businesses they brought
-- ---------------------------------------------------------------------------
-- What the rep_page() doesn't have, for an HQ rep: their businesses (name, kind, how it's doing, its
-- plan, the months that have earned and what they've earned), and which rewards count by themselves.
create or replace function public.rep_page_businesses(p_token text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v public.sales_reps;
begin
  select r.* into v from public.rep_links l join public.sales_reps r on r.id = l.rep_id where l.token = p_token;
  if v.id is null or not v.active then return null; end if;
  return jsonb_build_object(
    'businesses', coalesce((
      select jsonb_agg(jsonb_build_object('name', i.name, 'kind', i.kind, 'since', i.created_at, 'set_up_at', i.set_up_at,
               'plan', i.plan, 'status', i.status, 'interval', i.billing_interval, 'first_paid_at', i.first_paid_at,
               'months_paid', (select coalesce(sum(w.months), 0) from public.rep_rewards w
                                where w.introduction_id = i.id and w.kind = 'earn' and w.status <> 'rejected'),
               'earned', (select coalesce(sum(w.amount), 0) from public.rep_rewards w
                           where w.introduction_id = i.id and w.status <> 'rejected' and w.bonus_for is null))
             order by i.created_at desc)
        from public.rep_introductions i where i.rep_id = v.id), '[]'::jsonb),
    'automatic', coalesce((select jsonb_agg(u.id) from public.reward_rules u where u.hq_role is not null), '[]'::jsonb));
end $$;
alter function public.rep_page_businesses(text) owner to app_definer;
revoke execute on function public.rep_page_businesses(text) from public, anon, authenticated;
grant execute on function public.rep_page_businesses(text) to service_role;

-- A rep tells the café what they shared (the rep_reach_and_crews migration's), except the rewards
-- that count by themselves when a business pays; and the ten-waiting limit counts what they sent.
create or replace function public.claim_reward(p_token text, p_rule_id uuid, p_note text default null, p_proof_url text default null,
  p_occurred_on date default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_rep  public.sales_reps;
  v_rule public.reward_rules;
begin
  select r.* into v_rep from public.rep_links l join public.sales_reps r on r.id = l.rep_id where l.token = p_token;
  if v_rep.id is null then raise exception 'This link has changed. Ask the café for your new one.'; end if;
  select * into v_rule from public.reward_rules where id = p_rule_id;
  if v_rule.hq_role is not null then raise exception '"%" counts by itself when the business pays', v_rule.name; end if;
  if v_rule.basis <> 'fixed' then raise exception 'The café logs "%" for you once it''s booked', v_rule.name; end if;
  if nullif(btrim(p_note), '') is null and nullif(btrim(p_proof_url), '') is null then
    raise exception 'Say what you shared, or add its link';
  end if;
  if (select count(*) from public.rep_rewards
       where rep_id = v_rep.id and status = 'pending' and logged_by is null and bonus_for is null and source is null) >= 10 then
    raise exception 'Ten of yours are waiting for the café already. Once they''re checked, send more.';
  end if;
  return public.add_reward(v_rep, v_rule, null, p_note, p_proof_url, null, p_occurred_on, 'pending', null);
end $$;

-- ---------------------------------------------------------------------------
-- 9. Business Agent HQ
-- ---------------------------------------------------------------------------
-- Makes HQ once: a business like any other (complimentary, like Easy Beans), with its reward list,
-- the message on its reps' pages and cards, and Julio for cafés. Returns its number. Run by this
-- migration on the live database; a brand-new database (nobody signed up yet: the tests, a fresh
-- set-up) runs `select public.start_hq();` when it wants one. Its first owner is invited to it
-- (scripts/ops/invite.mjs with the business "hq").
create or replace function public.start_hq() returns int
language plpgsql set search_path = ''
as $$
declare v_id int := (select id from public.business where is_hq);
begin
  if v_id is not null then return v_id; end if;
  v_id := nextval('public.business_id_seq');
  perform set_config('app.business_id', v_id::text, true);
  insert into public.business (id, name, timezone, email, is_hq) values (v_id, 'Business Agent HQ', 'Europe/Madrid', 'sales@businesssagent.com', true);
  perform public.seed_new_business(null);
  update public.rep_settings
     set welcome_offer = 'Your first month free, and I''ll set it up with you', boost_by_reach = false,
         pitch = 'Thank you for bringing businesses to Business Agent. Every business that signs up with your code is yours: '
              || '€50 when it first pays, then 20% of what it pays for its first 12 paid months.'
   where business_id = v_id;
  insert into public.reward_rules (name, who, basis, amount, needs_approval, monthly_limit, sort, hq_role) values
    ('A business’s first payment', 'reps', 'fixed', 50, false, null, 1, 'first_payment'),
    ('20% of a payment', 'reps', 'percent', 20, false, null, 2, 'payment');
  -- The email is temporary until we have Julio's (HQ's Sales reps & rewards page changes it).
  insert into public.sales_reps (name, kind, code, email, categories, notes)
  values ('Julio', 'ambassador', 'JULIO27', 'julio.temp@example.com', '{cafe}', 'Cafés lead, Costa del Sol. Temporary email until we have his.');
  perform public.grant_complimentary('founder', 'Business Agent HQ: Business Agent itself', v_id);
  perform set_config('app.business_id', '', true);
  return v_id;
end $$;
revoke execute on function public.start_hq() from public, anon, authenticated, service_role;

select public.start_hq() where exists (select 1 from public.profiles);
