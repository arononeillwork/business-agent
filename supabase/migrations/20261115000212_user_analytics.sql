-- User analytics (Settings → User analytics, the owners'): who uses the app, on what, from where, and the time
-- they spend on each page ("how long did people spend reading the staff rules?").
--
-- The app reports what it's used for (src/app/usage.ts): a visit is a tab used without a 30-minute break, and
-- each page's time counts while it's on screen and in use (a touch, scroll or key in the last 3 minutes). It
-- sends what's built up about once a minute, and as the app is hidden or closed, to the Worker (POST
-- /api/usage, worker/usage.ts), which adds the device from the browser's own description and the town from
-- Cloudflare (the internet connection's, not GPS; the address itself isn't kept) and keeps it through
-- record_usage(). Owners read it all through usage_report(). Visits go after a year (worker/usage.ts, nightly).

-- 1. Visits: one a tab, from when it starts being used until a 30-minute break.
create table public.usage_visits (
  -- The app's own id for the visit.
  id            uuid primary key,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  started_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  device        text not null check (device in ('phone', 'tablet', 'computer')),
  os            text check (char_length(os) between 1 and 30),
  browser       text check (char_length(browser) between 1 and 30),
  -- Opened as the installed app (from the home screen), not in the browser.
  installed     boolean not null default false,
  -- Where the internet connection was, as Cloudflare places it.
  city          text check (char_length(city) between 1 and 100),
  region        text check (char_length(region) between 1 and 100),
  country       text check (country ~ '^[A-Z]{2}$'),
  -- Time in use, in seconds: its pages' together.
  seconds       int not null default 0 check (seconds >= 0)
);
select public.add_business_scope('public.usage_visits');
create index usage_visits_started_idx on public.usage_visits (business_id, started_at desc);
create index usage_visits_profile_idx on public.usage_visits (profile_id, started_at desc);

-- 2. Each page's time in a visit: the menu's name for the page ('rules' is Staff rules, 'today' is Today).
create table public.usage_pages (
  visit_id    uuid not null references public.usage_visits (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  page        text not null check (page ~ '^[a-z0-9-]{1,40}$'),
  -- Times it was opened, and the seconds it was in use.
  views       int not null default 0 check (views >= 0),
  seconds     int not null default 0 check (seconds >= 0),
  first_at    timestamptz not null default now(),
  last_at     timestamptz not null default now()
);
select public.add_business_scope('public.usage_pages');
create unique index usage_pages_visit_page on public.usage_pages (business_id, visit_id, page);
create index usage_pages_visit_idx on public.usage_pages (visit_id);
create index usage_pages_profile_idx on public.usage_pages (profile_id);

-- Owners (admins with pay access) read them; only the Worker writes them, through record_usage().
alter table public.usage_visits enable row level security;
alter table public.usage_pages enable row level security;
revoke all on public.usage_visits, public.usage_pages from anon, authenticated;
grant select on public.usage_visits, public.usage_pages to authenticated;
create policy usage_visits_owners on public.usage_visits for select to authenticated using ((select public.can_see_pay()));
create policy usage_pages_owners on public.usage_pages for select to authenticated using ((select public.can_see_pay()));
grant all on public.usage_visits, public.usage_pages to service_role;

-- 3. What the app reported, from the Worker: the visit (made the first time, with its device and place) and
-- the time on each page added to it. Someone's report counts only on their own visit, and only while they're
-- active in this business. True when it was kept.
create or replace function public.record_usage(
  p_profile uuid, p_visit uuid, p_device text, p_os text default null, p_browser text default null,
  p_installed boolean default false, p_city text default null, p_region text default null, p_country text default null,
  p_pages jsonb default '[]'::jsonb)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner uuid;
  v_page jsonb;
  v_views int;
  v_seconds int;
  v_total int := 0;
  v_n int := 0;
begin
  if p_profile is null or p_visit is null
     or not exists (select 1 from public.profiles where id = p_profile and active and business_id = public.current_business_id()) then
    return false;
  end if;
  insert into public.usage_visits as v (id, profile_id, device, os, browser, installed, city, region, country)
  values (p_visit, p_profile, p_device, nullif(left(btrim(coalesce(p_os, '')), 30), ''), nullif(left(btrim(coalesce(p_browser, '')), 30), ''),
          coalesce(p_installed, false), nullif(left(btrim(coalesce(p_city, '')), 100), ''), nullif(left(btrim(coalesce(p_region, '')), 100), ''),
          case when p_country ~ '^[A-Z]{2}$' and p_country not in ('XX', 'T1') then p_country end)
  on conflict (id) do update set last_seen_at = now()
    where v.profile_id = excluded.profile_id and v.business_id = excluded.business_id
  returning v.profile_id into v_owner;
  if v_owner is null then
    return false;
  end if;

  for v_page in select value from jsonb_array_elements(case when jsonb_typeof(p_pages) = 'array' then p_pages else '[]'::jsonb end) loop
    v_n := v_n + 1;
    exit when v_n > 40;
    continue when jsonb_typeof(v_page) <> 'object' or coalesce(v_page->>'page', '') !~ '^[a-z0-9-]{1,40}$';
    v_views := case when jsonb_typeof(v_page->'views') = 'number' then least(greatest(round((v_page->>'views')::numeric), 0), 100)::int else 0 end;
    v_seconds := case when jsonb_typeof(v_page->'seconds') = 'number' then least(greatest(round((v_page->>'seconds')::numeric), 0), 3600)::int else 0 end;
    continue when v_views = 0 and v_seconds = 0;
    insert into public.usage_pages as u (visit_id, profile_id, page, views, seconds)
    values (p_visit, p_profile, v_page->>'page', v_views, v_seconds)
    on conflict (business_id, visit_id, page) do update set
      views = u.views + excluded.views, seconds = u.seconds + excluded.seconds, last_at = now();
    v_total := v_total + v_seconds;
  end loop;
  if v_total > 0 then
    update public.usage_visits set seconds = seconds + v_total, last_seen_at = now() where id = p_visit;
  end if;
  return true;
end $$;
alter function public.record_usage(uuid, uuid, text, text, text, boolean, text, text, text, jsonb) owner to app_definer;
revoke execute on function public.record_usage(uuid, uuid, text, text, text, boolean, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_usage(uuid, uuid, text, text, text, boolean, text, text, text, jsonb) to service_role;

-- 4. The owners' page: the visits that started in [p_from, p_to), totalled for each person, each person's
-- time on each page, their devices and places, the latest 500 visits with their pages, and whose they are. It reads as the
-- person asking, so anyone but an owner gets nothing (the policies above).
create or replace function public.usage_report(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable set search_path = ''
as $$
  with v as (
    select * from public.usage_visits where started_at >= p_from and started_at < p_to
  )
  select jsonb_build_object(
    'people', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select profile_id, count(*)::int as visits, sum(seconds)::int as seconds, min(started_at) as first_at, max(last_seen_at) as last_at
          from v group by profile_id) x), '[]'::jsonb),
    'pages', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select u.profile_id, u.page, sum(u.views)::int as views, sum(u.seconds)::int as seconds, min(u.first_at) as first_at, max(u.last_at) as last_at
          from public.usage_pages u join v on v.id = u.visit_id group by u.profile_id, u.page) x), '[]'::jsonb),
    'devices', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select profile_id, device, os, browser, bool_or(installed) as installed, count(*)::int as visits, max(last_seen_at) as last_at
          from v group by profile_id, device, os, browser) x), '[]'::jsonb),
    'places', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select profile_id, city, region, country, count(*)::int as visits, max(last_seen_at) as last_at
          from v where country is not null group by profile_id, city, region, country) x), '[]'::jsonb),
    'visits', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.started_at desc) from (
        select v.id, v.profile_id, v.started_at, v.last_seen_at, v.device, v.os, v.browser, v.installed, v.city, v.region, v.country, v.seconds,
               coalesce((select jsonb_agg(jsonb_build_object('page', u.page, 'views', u.views, 'seconds', u.seconds) order by u.first_at)
                           from public.usage_pages u where u.visit_id = v.id), '[]'::jsonb) as pages
          from v order by v.started_at desc limit 500) x), '[]'::jsonb),
    -- Whose they are, partners included (the app's own list of the team has no partners).
    'names', coalesce((
      select jsonb_agg(jsonb_build_object('profile_id', p.id, 'full_name', p.full_name, 'colour', p.colour, 'role', p.role))
        from public.profiles p where p.id in (select profile_id from v)), '[]'::jsonb),
    'total_visits', (select count(*)::int from v)
  );
$$;
revoke execute on function public.usage_report(timestamptz, timestamptz) from public, anon;
grant execute on function public.usage_report(timestamptz, timestamptz) to authenticated, service_role;
