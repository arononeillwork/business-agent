-- Social media planner (Instagram, Facebook, TikTok, Google Maps) and Square as the payment system.

-- 1. New connections: a Facebook Page, a TikTok account, and Square (takings). Square is the
--    business's one payment system (more may come), so it joins the one-per-group rule.
alter table public.integrations drop constraint integrations_provider_check;
alter table public.integrations add constraint integrations_provider_check check (provider in (
  'google_business', 'whatsapp', 'instagram', 'spotify', 'gmail', 'outlook', 'google_drive', 'onedrive',
  'google_calendar', 'outlook_calendar', 'youtube_music', 'facebook', 'tiktok', 'square'));
insert into public.integrations (provider) values ('facebook'), ('tiktok'), ('square') on conflict do nothing;

create or replace function public.integration_group(p text) returns text
language sql immutable set search_path = ''
as $$
  select case
    when p in ('gmail', 'outlook') then 'email'
    when p in ('google_drive', 'onedrive') then 'files'
    when p in ('google_calendar', 'outlook_calendar') then 'calendar'
    when p in ('spotify', 'youtube_music') then 'music'
    when p = 'whatsapp' then 'communication'
    when p = 'square' then 'payments'
  end
$$;

alter table public.outbox drop constraint outbox_kind_check;
alter table public.outbox add constraint outbox_kind_check
  check (kind in ('whatsapp', 'google_sync', 'google_post', 'instagram_post', 'facebook_post', 'tiktok_post', 'email'));

-- 2. Posts: written once, published to each chosen network at the planned time. Admins only.
create table public.social_posts (
  id            uuid primary key default gen_random_uuid(),
  caption       text not null default '' check (char_length(caption) <= 2200),
  image_url     text check (image_url is null or image_url ~ '^https://'),
  targets       text[] not null default '{}' check (targets <@ array['instagram', 'facebook', 'tiktok', 'google']::text[]),
  scheduled_at  timestamptz,
  status        text not null default 'draft'
                check (status in ('draft', 'scheduled', 'publishing', 'published', 'partly', 'failed')),
  -- Per network: {"instagram": {"status": "queued|retrying|published|failed", "id", "url", "error", "at"}}
  results       jsonb not null default '{}'::jsonb,
  event_id      uuid references public.calendar_events on delete set null,
  created_by    uuid references auth.users default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  published_at  timestamptz
);
create index social_posts_due_idx on public.social_posts (scheduled_at) where status = 'scheduled';
alter table public.social_posts enable row level security;
revoke all on public.social_posts from anon;
create policy social_posts_admin on public.social_posts for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- The rules, whoever writes: a scheduled post needs a time, networks and something to post;
-- Instagram and TikTok need a photo (TikTok only takes JPEG); nothing already sent can change.
create or replace function public.social_post_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  -- Writes straight from the app (not the publishing functions or the Worker) follow the rules.
  if tg_op = 'UPDATE' and old.status in ('publishing', 'published', 'partly') and current_user in ('authenticated', 'anon') then
    raise exception 'This post has already gone out. Make a new post instead.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if current_user in ('authenticated', 'anon') and new.status not in ('draft', 'scheduled') then
    raise exception 'Save it as a draft or schedule it';
  end if;
  new.targets := array(select distinct unnest(new.targets) order by 1);
  if new.status = 'scheduled' then
    if new.scheduled_at is null then raise exception 'Pick when to post'; end if;
    if cardinality(new.targets) = 0 then raise exception 'Pick at least one network'; end if;
    if btrim(new.caption) = '' and new.image_url is null then raise exception 'Write a caption or add a photo'; end if;
    if new.image_url is null and ('instagram' = any(new.targets) or 'tiktok' = any(new.targets)) then
      raise exception 'Instagram and TikTok posts need a photo';
    end if;
    if 'tiktok' = any(new.targets) and new.image_url !~* '\.(jpe?g)(\?|$)' then
      raise exception 'TikTok only takes JPEG photos';
    end if;
    if 'google' = any(new.targets) and char_length(new.caption) > 1500 then
      raise exception 'Google Maps posts are limited to 1500 characters';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger social_posts_rules before insert or update or delete on public.social_posts
  for each row execute function public.social_post_rules();

-- 3. Publishing: every minute the cron sends posts that are due. Each network is its own outbox
--    job (retried with backoff); the job's outcome is written back onto the post.
create or replace function public._publish_social_post(p_id uuid) returns int
language plpgsql security definer set search_path = ''
as $$
declare v public.social_posts; v_ev public.calendar_events; t text; n int := 0;
begin
  update public.social_posts set status = 'publishing',
         results = (select coalesce(jsonb_object_agg(x, jsonb_build_object('status', 'queued')), '{}'::jsonb) from unnest(targets) x)
   where id = p_id and status = 'scheduled'
  returning * into v;
  if v.id is null then return 0; end if;
  if v.event_id is not null then select * into v_ev from public.calendar_events where id = v.event_id; end if;
  foreach t in array v.targets loop
    perform public._enqueue(t || '_post',
      jsonb_build_object('post_id', v.id, 'target', t, 'caption', v.caption, 'image_url', v.image_url)
      || case when t = 'google' and v_ev.id is not null
           then jsonb_build_object('title', v_ev.title, 'starts_on', v_ev.starts_on, 'ends_on', coalesce(v_ev.ends_on, v_ev.starts_on))
           else '{}'::jsonb end,
      'social:' || v.id || ':' || t);
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.queue_due_social_posts() returns int
language plpgsql security definer set search_path = ''
as $$
declare r record; n int := 0;
begin
  for r in select id from public.social_posts where status = 'scheduled' and scheduled_at <= now()
           order by scheduled_at limit 50 for update skip locked loop
    n := n + public._publish_social_post(r.id);
  end loop;
  return n;
end;
$$;

-- Outbox outcome → the post: published, retrying (with the reason) or failed; the post as a whole
-- is published, partly published or failed once every network has finished.
create or replace function public._social_post_result() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_post uuid := nullif(new.payload->>'post_id', '')::uuid;
  v_target text := new.payload->>'target';
  v_results jsonb;
begin
  if v_post is null or new.status is not distinct from old.status or new.status not in ('sent', 'failed', 'dead') then
    return null;
  end if;
  update public.social_posts set results = results || jsonb_build_object(v_target, jsonb_strip_nulls(jsonb_build_object(
      'status', case new.status when 'sent' then 'published' when 'failed' then 'retrying' else 'failed' end,
      'id', case when new.external_id !~ '^https?://' then new.external_id end,
      'url', case when new.external_id ~ '^https?://' then new.external_id end,
      'error', case when new.status <> 'sent' then new.last_error end,
      'at', now())))
   where id = v_post
  returning results into v_results;
  if v_results is null then return null; end if;
  if not exists (select 1 from jsonb_each(v_results) e where e.value->>'status' in ('queued', 'retrying')) then
    update public.social_posts set
      status = case
        when not exists (select 1 from jsonb_each(v_results) e where e.value->>'status' = 'failed') then 'published'
        when exists (select 1 from jsonb_each(v_results) e where e.value->>'status' = 'published') then 'partly'
        else 'failed' end,
      published_at = case when exists (select 1 from jsonb_each(v_results) e where e.value->>'status' = 'published') then now() end
     where id = v_post;
  end if;
  return null;
end;
$$;
create trigger outbox_social_post_result after update of status on public.outbox
  for each row execute function public._social_post_result();

-- 4. Sharing a calendar event (Share button) goes through the planner too, straight away.
create or replace function public.queue_share(p_caption text, p_image_url text, p_targets text[], p_event_id uuid default null)
returns int
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'Only an admin can post'; end if;
  if coalesce(btrim(p_caption), '') = '' then raise exception 'Write a caption first'; end if;
  insert into public.social_posts (caption, image_url, targets, scheduled_at, status, event_id)
  values (p_caption, p_image_url, p_targets, now(), 'scheduled', p_event_id)
  returning id into v_id;
  return public._publish_social_post(v_id);
end;
$$;

revoke execute on function public._publish_social_post(uuid), public.queue_due_social_posts(), public._social_post_result(),
  public.social_post_rules() from public, anon, authenticated;
grant execute on function public.queue_due_social_posts() to service_role;
