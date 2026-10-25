-- SumUp as a third payment system (next to Square and Stripe, one at a time), LinkedIn in the
-- social planner, Google Search Console (how the website does in Google Search), and the
-- business's website.

-- 1. The new connections. SumUp joins the payments group (one payment system at a time) and needs
--    the takings feature; LinkedIn counts as a social account; Search Console is on every plan.
alter table public.integrations drop constraint integrations_provider_check;
alter table public.integrations add constraint integrations_provider_check check (provider in (
  'google_business', 'whatsapp', 'instagram', 'spotify', 'gmail', 'outlook', 'google_drive', 'onedrive',
  'google_calendar', 'outlook_calendar', 'youtube_music', 'facebook', 'tiktok', 'square', 'stripe',
  'sumup', 'linkedin', 'search_console'));
insert into public.integrations (provider) values ('sumup'), ('linkedin'), ('search_console') on conflict do nothing;

create or replace function public.integration_group(p text) returns text
language sql immutable set search_path = ''
as $$
  select case
    when p in ('gmail', 'outlook') then 'email'
    when p in ('google_drive', 'onedrive') then 'files'
    when p in ('google_calendar', 'outlook_calendar') then 'calendar'
    when p in ('spotify', 'youtube_music') then 'music'
    when p = 'whatsapp' then 'communication'
    when p in ('square', 'stripe', 'sumup') then 'payments'
  end
$$;

create or replace function public.plan_feature_of(p_provider text) returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_provider = 'google_business' then 'google_maps'
    when p_provider = 'whatsapp' then 'whatsapp'
    when p_provider in ('square', 'stripe', 'sumup') then 'takings'
    when p_provider in ('spotify', 'youtube_music') then 'music'
    when p_provider in ('gmail', 'outlook', 'google_drive', 'onedrive') then 'apps'
  end;
$$;

-- Social accounts (the plan's limit): Instagram, Facebook, TikTok and LinkedIn. Keep in step with
-- SOCIAL_CONNECTIONS in shared/plans.ts.
create or replace function public.plan_status() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'plan', public.current_plan(),
    'limits', (select to_jsonb(l) - 'plan' from public.plan_limits l where l.plan = public.current_plan()),
    'usage', jsonb_build_object(
      'people', (select count(*) from public.profiles where active and role in ('admin', 'employee')),
      'social_accounts', (select count(*) from public.integrations where status = 'connected' and provider in ('instagram', 'facebook', 'tiktok', 'linkedin')),
      'posts_this_month', public.posts_this_month(now())))
  where auth.uid() is null or exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

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
  if p_provider in ('instagram', 'facebook', 'tiktok', 'linkedin') then
    select social_accounts into v_max from public.plan_limits where plan = public.current_plan();
    if (select count(*) from public.integrations where status = 'connected'
          and provider in ('instagram', 'facebook', 'tiktok', 'linkedin') and provider <> p_provider) >= v_max then
      raise exception 'Your plan includes % social account%. Disconnect one, or upgrade on the Billing page for more.',
        v_max, case when v_max = 1 then '' else 's' end using errcode = 'P0402';
    end if;
  end if;
end;
$$;

-- 2. LinkedIn in the social planner: a post (text, and up to one photo) goes out as a
--    'linkedin_post' outbox job, like Facebook's. Carousels, reels and stories stay Instagram-only
--    (social_post_rules, migration 39, already refuses them anywhere else). LinkedIn takes up to
--    3000 characters, more than a caption can hold (2200), so it needs no length rule of its own.
alter table public.outbox drop constraint outbox_kind_check;
alter table public.outbox add constraint outbox_kind_check
  check (kind in ('whatsapp', 'google_sync', 'google_post', 'instagram_post', 'facebook_post', 'tiktok_post', 'linkedin_post', 'email'));

alter table public.social_posts drop constraint social_posts_targets_check;
alter table public.social_posts add constraint social_posts_targets_check
  check (targets <@ array['instagram', 'facebook', 'tiktok', 'google', 'linkedin']::text[]);

-- Reminders name the networks properly ("LinkedIn", not "Linkedin").
create or replace function public._remind_social_post(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare v public.social_posts; v_where text;
begin
  update public.social_posts set status = 'due' where id = p_id and status = 'scheduled' and not auto returning * into v;
  if v.id is null then return; end if;
  v_where := (select string_agg(case x when 'google' then 'Google Maps' when 'tiktok' then 'TikTok' when 'linkedin' then 'LinkedIn' else initcap(x) end, ' and ' order by x)
                from unnest(v.targets) x);
  insert into public.notifications (profile_id, title, body, link)
  select p.id,
         'Time to post your ' || lower(case v.kind when 'post' then 'post' when 'carousel' then 'carousel' when 'reel' then 'reel' else 'story' end)
           || ' on ' || coalesce(v_where, 'social media'),
         nullif(left(btrim(v.caption), 140), ''),
         '/social'
    from public.profiles p where p.role = 'admin' and p.active;
end;
$$;
revoke execute on function public._remind_social_post(uuid) from public, anon, authenticated;

-- 3. The business's website (Search Console is matched to it). Admins change it like the other
--    contact details (the business table's own policies; no column grants involved).
alter table public.business add column website text
  constraint business_website_http check (website is null or website ~* '^https?://[^\s/]+\S*$');
update public.business set website = 'https://www.easybeanscoffee.com/' where website is null and name ilike 'easy beans%';
