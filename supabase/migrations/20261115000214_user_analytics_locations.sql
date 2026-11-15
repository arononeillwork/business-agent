-- User analytics by location: one sign-in (the business's own Google account, say) can be used at several shops,
-- so a visit's location is where it was used, not whose it was. Each visit keeps which internet connection it
-- started on, as an id the Worker makes from the connection's address with a secret (worker/usage.ts): the
-- address can't be got back from it, and each business's ids are its own. A shop's broadband keeps its id, so
-- owners name it once ("San Pedro café") and its visits show under that name; a connection nobody has named
-- shows as its town. User analytics shows the locations together or one by one (shared/usage.ts).

-- 1. The connection a visit started on (none for the visits kept before this).
alter table public.usage_visits add column network text check (network ~ '^[0-9a-f]{16}$');
create index usage_visits_network_idx on public.usage_visits (business_id, network) where network is not null;

-- 2. Owners' names for connections.
create table public.usage_locations (
  network     text not null check (network ~ '^[0-9a-f]{16}$'),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  updated_at  timestamptz not null default now()
);
select public.add_business_scope('public.usage_locations');
create unique index usage_locations_network on public.usage_locations (business_id, network);
alter table public.usage_locations enable row level security;
revoke all on public.usage_locations from anon, authenticated;
grant select, insert, update, delete on public.usage_locations to authenticated;
create policy usage_locations_owners on public.usage_locations for all to authenticated
  using ((select public.can_see_pay())) with check ((select public.can_see_pay()));
grant all on public.usage_locations to service_role;

-- 3. record_usage() keeps the connection too (the user_analytics migration's, with p_network). The Worker
-- that's live while this is applied calls it without one, which still works.
drop function public.record_usage(uuid, uuid, text, text, text, boolean, text, text, text, jsonb);
create function public.record_usage(
  p_profile uuid, p_visit uuid, p_device text, p_os text default null, p_browser text default null,
  p_installed boolean default false, p_city text default null, p_region text default null, p_country text default null,
  p_pages jsonb default '[]'::jsonb, p_network text default null)
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
  insert into public.usage_visits as v (id, profile_id, device, os, browser, installed, city, region, country, network)
  values (p_visit, p_profile, p_device, nullif(left(btrim(coalesce(p_os, '')), 30), ''), nullif(left(btrim(coalesce(p_browser, '')), 30), ''),
          coalesce(p_installed, false), nullif(left(btrim(coalesce(p_city, '')), 100), ''), nullif(left(btrim(coalesce(p_region, '')), 100), ''),
          case when p_country ~ '^[A-Z]{2}$' and p_country not in ('XX', 'T1') then p_country end,
          case when p_network ~ '^[0-9a-f]{16}$' then p_network end)
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
alter function public.record_usage(uuid, uuid, text, text, text, boolean, text, text, text, jsonb, text) owner to app_definer;
revoke execute on function public.record_usage(uuid, uuid, text, text, text, boolean, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.record_usage(uuid, uuid, text, text, text, boolean, text, text, text, jsonb, text) to service_role;

-- 4. The owners' page, location by location: usage_report() (the user_analytics migration) with each total
-- kept apart for each location: a named connection's name, else its town (else its region or country; '' when
-- not known). With the connections seen, to name. usage_report() stays for the page that's live meanwhile.
create or replace function public.usage_report_by_location(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable set search_path = ''
as $$
  with v as (
    select uv.*, coalesce(l.name, uv.city, uv.region, uv.country, '') as location
      from public.usage_visits uv
      left join public.usage_locations l on l.network = uv.network and l.business_id = uv.business_id
     where uv.started_at >= p_from and uv.started_at < p_to
  )
  select jsonb_build_object(
    'people', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select profile_id, location, count(*)::int as visits, sum(seconds)::int as seconds, min(started_at) as first_at, max(last_seen_at) as last_at
          from v group by profile_id, location) x), '[]'::jsonb),
    'pages', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select u.profile_id, v.location, u.page, sum(u.views)::int as views, sum(u.seconds)::int as seconds, min(u.first_at) as first_at, max(u.last_at) as last_at
          from public.usage_pages u join v on v.id = u.visit_id group by u.profile_id, v.location, u.page) x), '[]'::jsonb),
    'devices', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select profile_id, location, device, os, browser, bool_or(installed) as installed, count(*)::int as visits, max(last_seen_at) as last_at
          from v group by profile_id, location, device, os, browser) x), '[]'::jsonb),
    'places', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select profile_id, location, city, region, country, count(*)::int as visits, max(last_seen_at) as last_at
          from v where country is not null group by profile_id, location, city, region, country) x), '[]'::jsonb),
    'visits', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.started_at desc) from (
        select v.id, v.profile_id, v.started_at, v.last_seen_at, v.device, v.os, v.browser, v.installed, v.city, v.region, v.country, v.seconds,
               v.location, v.network,
               coalesce((select jsonb_agg(jsonb_build_object('page', u.page, 'views', u.views, 'seconds', u.seconds) order by u.first_at)
                           from public.usage_pages u where u.visit_id = v.id), '[]'::jsonb) as pages
          from v order by v.started_at desc limit 500) x), '[]'::jsonb),
    -- The connections the period's visits came from, to name: the busiest first.
    'networks', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.visits desc, x.last_at desc) from (
        select v.network, min(l.name) as name, mode() within group (order by v.city) as city, mode() within group (order by v.country) as country,
               count(*)::int as visits, count(distinct v.profile_id)::int as people, max(v.last_seen_at) as last_at
          from v left join public.usage_locations l on l.network = v.network and l.business_id = v.business_id
         where v.network is not null group by v.network) x), '[]'::jsonb),
    'names', coalesce((
      select jsonb_agg(jsonb_build_object('profile_id', p.id, 'full_name', p.full_name, 'colour', p.colour, 'role', p.role))
        from public.profiles p where p.id in (select profile_id from v)), '[]'::jsonb),
    'total_visits', (select count(*)::int from v)
  );
$$;
revoke execute on function public.usage_report_by_location(timestamptz, timestamptz) from public, anon;
grant execute on function public.usage_report_by_location(timestamptz, timestamptz) to authenticated, service_role;
