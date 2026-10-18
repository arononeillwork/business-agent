-- Plans and billing. Business Agent is sold in four plans (shared/plans.ts); Stripe keeps the
-- subscription and the Worker copies its state here (webhook + nightly check). The database
-- decides which plan is in force and enforces its limits, so the app, REST API and AI connector
-- all get the same answer. Only the service role (the Worker) writes billing.

-- 1. What each plan allows. Keep in step with shared/plans.ts (plans.test.ts checks it).
create table public.plan_limits (
  plan             text primary key,
  people           int,           -- active admins + employees; null = no limit
  social_accounts  int not null,  -- Instagram, Facebook, TikTok connected at once
  posts_per_month  int,           -- social posts scheduled per calendar month; null = no limit
  features         text[] not null default '{}'
);
insert into public.plan_limits (plan, people, social_accounts, posts_per_month, features) values
  ('free',     3,    1, 1,    '{}'),
  ('starter',  10,   1, 12,   '{google_maps,apps}'),
  ('pro',      25,   3, 60,   '{google_maps,apps,whatsapp,takings,sports,music,kiosk}'),
  ('business', null, 3, null, '{google_maps,apps,whatsapp,takings,sports,music,kiosk,partners}');
alter table public.plan_limits enable row level security;
revoke all on public.plan_limits from anon;
create policy plan_limits_read on public.plan_limits for select to authenticated using (true);

-- 2. The business's subscription (one row, like business).
create table public.billing (
  id                      int primary key default 1 check (id = 1),
  plan                    text not null default 'free' references public.plan_limits,
  -- Stripe's subscription status, or 'none' (never subscribed) / 'comped' (given free by us).
  status                  text not null default 'none' check (status in ('none', 'comped', 'trialing', 'active', 'past_due',
                            'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused')),
  billing_interval        text check (billing_interval in ('month', 'year')),
  stripe_customer_id      text,
  stripe_subscription_id  text,
  trial_ends_at           timestamptz,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean not null default false,
  trial_used              boolean not null default false,
  updated_at              timestamptz not null default now()
);
-- A business already running when plans arrive keeps everything (given free); new ones start on Free.
insert into public.billing (plan, status)
  select case when exists (select 1 from public.business) then 'business' else 'free' end,
         case when exists (select 1 from public.business) then 'comped' else 'none' end;
alter table public.billing enable row level security;
revoke all on public.billing from anon, authenticated;
grant select on public.billing to authenticated;
create policy billing_admin_read on public.billing for select to authenticated using ((select public.is_admin()));

-- 3. The plan in force. Paid plans count only while paid up: trialing (until its end date),
--    active, or comped. A trial that ends without a payment, or a failed renewal, means Free
--    until Stripe takes the money. Mirrors effectivePlan() in shared/plans.ts.
create or replace function public.current_plan() returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when status in ('comped', 'active') then plan
      when status = 'trialing' and trial_ends_at > now() then plan
      else 'free' end
    from public.billing where id = 1), 'free');
$$;

create or replace function public.plan_allows(p_feature text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select p_feature = any (features) from public.plan_limits where plan = public.current_plan()), false);
$$;

-- Cheapest plan with a feature, for messages.
create or replace function public.plan_needed(p_feature text) returns text
language sql stable security definer set search_path = ''
as $$
  select initcap(plan) from public.plan_limits where p_feature = any (features)
   order by array_position(array['free', 'starter', 'pro', 'business'], plan) limit 1;
$$;

create or replace function public.plan_feature_of(p_provider text) returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_provider = 'google_business' then 'google_maps'
    when p_provider = 'whatsapp' then 'whatsapp'
    when p_provider in ('square', 'stripe') then 'takings'
    when p_provider in ('spotify', 'youtube_music') then 'music'
    when p_provider in ('gmail', 'outlook', 'google_drive', 'onedrive') then 'apps'
  end;
$$;

create or replace function public.posts_this_month(p_at timestamptz, p_except uuid default null) returns int
language sql stable security definer set search_path = ''
as $$
  select count(*)::int from public.social_posts
   where status <> 'draft' and scheduled_at is not null and id is distinct from p_except
     and date_trunc('month', scheduled_at at time zone public.business_tz())
       = date_trunc('month', p_at at time zone public.business_tz());
$$;

-- What the app shows: the plan in force, the one chosen, its limits and what's used so far.
create or replace function public.plan_status() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'plan', public.current_plan(),
    'limits', (select to_jsonb(l) - 'plan' from public.plan_limits l where l.plan = public.current_plan()),
    'usage', jsonb_build_object(
      'people', (select count(*) from public.profiles where active and role in ('admin', 'employee')),
      'social_accounts', (select count(*) from public.integrations where status = 'connected' and provider in ('instagram', 'facebook', 'tiktok')),
      'posts_this_month', public.posts_this_month(now())))
  where auth.uid() is null or exists (select 1 from public.profiles where id = auth.uid() and active);
$$;
revoke execute on function public.plan_status() from anon;

-- Raises a plain-language error when the plan doesn't allow connecting this app. Used by the
-- trigger below and by the Worker before it sends someone off to sign in to the app.
create or replace function public.plan_check_connect(p_provider text) returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_feature text := public.plan_feature_of(p_provider);
  v_max     int;
begin
  if v_feature is not null and not public.plan_allows(v_feature) then
    raise exception 'Connecting this app needs the % plan or higher. Upgrade on the Billing page.', public.plan_needed(v_feature)
      using errcode = 'P0402';
  end if;
  if p_provider in ('instagram', 'facebook', 'tiktok') then
    select social_accounts into v_max from public.plan_limits where plan = public.current_plan();
    if (select count(*) from public.integrations where status = 'connected'
          and provider in ('instagram', 'facebook', 'tiktok') and provider <> p_provider) >= v_max then
      raise exception 'Your plan includes % social account%. Disconnect one, or upgrade on the Billing page for more.',
        v_max, case when v_max = 1 then '' else 's' end using errcode = 'P0402';
    end if;
  end if;
end;
$$;
revoke execute on function public.plan_check_connect(text) from public, anon;
grant execute on function public.plan_check_connect(text) to authenticated, service_role;

-- 4. Enforcement, whoever writes.
create or replace function public.plan_integrations_rule() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status = 'connected' and old.status is distinct from 'connected' then
    perform public.plan_check_connect(new.provider);
  end if;
  return new;
end;
$$;
create trigger integrations_plan before update on public.integrations
  for each row execute function public.plan_integrations_rule();

create or replace function public.plan_social_posts_rule() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_max int;
begin
  if new.status = 'scheduled' and new.scheduled_at is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'scheduled'
          or date_trunc('month', old.scheduled_at) is distinct from date_trunc('month', new.scheduled_at)) then
    select posts_per_month into v_max from public.plan_limits where plan = public.current_plan();
    if v_max is not null and public.posts_this_month(new.scheduled_at, new.id) >= v_max then
      raise exception 'Your plan includes % scheduled post% a month, and that month is full. Upgrade on the Billing page for more.',
        v_max, case when v_max = 1 then '' else 's' end using errcode = 'P0402';
    end if;
  end if;
  return new;
end;
$$;
create trigger social_posts_plan before insert or update on public.social_posts
  for each row execute function public.plan_social_posts_rule();

create or replace function public.plan_profiles_rule() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_max  int;
  v_was  boolean := tg_op = 'UPDATE' and old.active and old.role = new.role;
begin
  if not new.active or v_was then return new; end if;
  if new.role in ('admin', 'employee') and not (tg_op = 'UPDATE' and old.active and old.role in ('admin', 'employee')) then
    select people into v_max from public.plan_limits where plan = public.current_plan();
    if v_max is not null and (select count(*) from public.profiles
         where active and role in ('admin', 'employee') and id <> new.id) >= v_max then
      raise exception 'Your plan includes % people, and the team is full. Switch someone off, or upgrade on the Billing page.', v_max
        using errcode = 'P0402';
    end if;
  elsif new.role = 'kiosk' and not public.plan_allows('kiosk') then
    raise exception 'The clock-in tablet needs the % plan or higher. Upgrade on the Billing page.', public.plan_needed('kiosk') using errcode = 'P0402';
  elsif new.role = 'partner' and not public.plan_allows('partners') then
    raise exception 'Partner access needs the % plan. Upgrade on the Billing page.', public.plan_needed('partners') using errcode = 'P0402';
  end if;
  return new;
end;
$$;
create trigger profiles_plan before insert or update of active, role on public.profiles
  for each row execute function public.plan_profiles_rule();

create or replace function public.plan_sports_rule() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.sports_enabled and not coalesce(old.sports_enabled, false) and not public.plan_allows('sports') then
    raise exception 'What''s on needs the % plan or higher. Upgrade on the Billing page.', public.plan_needed('sports') using errcode = 'P0402';
  end if;
  return new;
end;
$$;
create trigger business_sports_plan before update of sports_enabled on public.business
  for each row execute function public.plan_sports_rule();
