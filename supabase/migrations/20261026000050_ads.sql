-- The Ads page: Meta Ads (Facebook and Instagram ads) and Google Ads as connections, and the
-- monthly limits the business sets itself for each. The ads themselves are read live from each
-- platform by the Worker; nothing about them is stored here.

-- 1. The two connections. Any number of ad platforms at once (no group); both need the apps
--    feature, like the other Google and Microsoft sign-ins (Starter and up).
alter table public.integrations drop constraint integrations_provider_check;
alter table public.integrations add constraint integrations_provider_check check (provider in (
  'google_business', 'whatsapp', 'instagram', 'spotify', 'gmail', 'outlook', 'google_drive', 'onedrive',
  'google_calendar', 'outlook_calendar', 'youtube_music', 'facebook', 'tiktok', 'square', 'stripe',
  'sumup', 'linkedin', 'search_console', 'meta_ads', 'google_ads'));
insert into public.integrations (provider) values ('meta_ads'), ('google_ads') on conflict do nothing;

create or replace function public.plan_feature_of(p_provider text) returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_provider = 'google_business' then 'google_maps'
    when p_provider = 'whatsapp' then 'whatsapp'
    when p_provider in ('square', 'stripe', 'sumup') then 'takings'
    when p_provider in ('spotify', 'youtube_music') then 'music'
    when p_provider in ('gmail', 'outlook', 'google_drive', 'onedrive', 'meta_ads', 'google_ads') then 'apps'
  end;
$$;

-- 2. Monthly limits per platform (null: none), and when the Ads page starts warning. They don't
--    stop the platforms spending: each platform's own budgets do that. One row, admins only.
create table public.ad_settings (
  id                      int primary key default 1 check (id = 1),
  meta_ads_monthly_cap    numeric(10,2) check (meta_ads_monthly_cap >= 0),
  google_ads_monthly_cap  numeric(10,2) check (google_ads_monthly_cap >= 0),
  alert_at_percent        int not null default 80 check (alert_at_percent between 1 and 100),
  updated_at              timestamptz not null default now(),
  updated_by              uuid references auth.users on delete set null default auth.uid()
);
insert into public.ad_settings (id) values (1);

create or replace function public.ad_settings_stamp() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger ad_settings_stamp before update on public.ad_settings
  for each row execute function public.ad_settings_stamp();
create trigger audit_ad_settings after update on public.ad_settings
  for each row execute function public.audit_row();

alter table public.ad_settings enable row level security;
revoke all on public.ad_settings from anon;
revoke insert, delete on public.ad_settings from authenticated;
create policy ad_settings_read on public.ad_settings for select to authenticated using ((select public.is_admin()));
create policy ad_settings_write on public.ad_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
