-- Referrals: the business shares its link to Business Agent. When a business it referred finishes
-- set-up, both get a month of Business Agent free (stacking up to 12 for the referrer), applied
-- when paid plans start. Until self-serve sign-up opens, the link leads to the waitlist, so a
-- referral starts as "joined" and becomes "set up" when that business goes live.
alter table public.business add column referral_code text unique
  default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
update public.business set referral_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  where referral_code is null;
alter table public.business alter column referral_code set not null;

create table public.referrals (
  id            uuid primary key default gen_random_uuid(),
  business_name text not null check (char_length(btrim(business_name)) between 1 and 120),
  contact_name  text check (contact_name is null or char_length(contact_name) <= 120),
  email         text not null unique check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  joined_at     timestamptz not null default now(),
  set_up_at     timestamptz
);

-- Each time the link is opened (no personal data: just when).
create table public.referral_opens (
  id        bigint generated always as identity primary key,
  opened_at timestamptz not null default now()
);

alter table public.referrals enable row level security;
alter table public.referral_opens enable row level security;
create policy referrals_admin_read on public.referrals for select to authenticated using (public.is_admin());
create policy referral_opens_admin_read on public.referral_opens for select to authenticated using (public.is_admin());
-- Writes only come from the Worker (service role): the public link page, and set-up.
revoke all on public.referrals, public.referral_opens from anon, authenticated;
grant select on public.referrals, public.referral_opens to authenticated;

-- A referred business finished set-up: that's when the free months count.
create or replace function public.mark_referral_set_up(p_email text) returns boolean
language sql security definer set search_path = ''
as $$
  with done as (
    update public.referrals set set_up_at = coalesce(set_up_at, now())
    where lower(email) = lower(btrim(p_email)) returning 1
  )
  select exists (select 1 from done)
$$;
revoke execute on function public.mark_referral_set_up(text) from public, anon, authenticated;
grant execute on function public.mark_referral_set_up(text) to service_role;
