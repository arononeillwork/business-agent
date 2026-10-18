-- Social planner: kinds of post (post, carousel, reel, story), photos and videos, and posting
-- automatically or as a reminder to post it yourself.
--
--   kind   post: one photo (Facebook and Google Maps also take text only); carousel: 2–10 photos or
--          videos; reel: one video; story: one photo or video. Carousels, reels and stories go to
--          Instagram only for now.
--   media  [{"url": "https://…", "type": "image"|"video"}], in order; the first is the cover, also
--          kept in image_url for what reads that (the Share button, older app versions).
--   auto   true: it posts itself at the time (the app offers this once photos and videos have
--          somewhere to live: Google Drive or OneDrive). false: at the time it becomes "due", admins
--          get a reminder, and whoever posts it marks it posted.

alter table public.social_posts
  add column kind text not null default 'post' check (kind in ('post', 'carousel', 'reel', 'story')),
  add column media jsonb not null default '[]'::jsonb check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) <= 10),
  add column auto boolean not null default true;

alter table public.social_posts drop constraint social_posts_status_check;
alter table public.social_posts add constraint social_posts_status_check
  check (status in ('draft', 'scheduled', 'due', 'publishing', 'published', 'partly', 'failed'));

-- Posts from before: their photo is their media.
alter table public.social_posts disable trigger user;
update public.social_posts set media = jsonb_build_array(jsonb_build_object('url', image_url, 'type', 'image'))
 where image_url is not null and media = '[]'::jsonb;
alter table public.social_posts enable trigger user;

create index social_posts_kind_idx on public.social_posts (kind, scheduled_at);

-- The rules, whoever writes (the app checks the same first, in shared/social.ts).
create or replace function public.social_post_rules() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_n int;
  v_videos int;
  v_plural text;
begin
  -- Writes straight from the app (not the publishing functions or the Worker) follow the rules.
  if tg_op = 'UPDATE' and old.status in ('publishing', 'published', 'partly') and current_user in ('authenticated', 'anon') then
    raise exception 'This post has already gone out. Make a new post instead.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  -- From the app: a draft or a scheduled post; or a reminder that's due, marked as posted.
  if current_user in ('authenticated', 'anon') and new.status not in ('draft', 'scheduled')
     and not (tg_op = 'UPDATE' and old.status = 'due' and new.status in ('due', 'published')) then
    raise exception 'Save it as a draft or schedule it';
  end if;
  new.targets := array(select distinct unnest(new.targets) order by 1);

  -- A photo given the old way (image_url only) becomes the media; the cover is always media[0].
  if new.image_url is not null and jsonb_array_length(new.media) = 0
     and (tg_op = 'INSERT' or new.image_url is distinct from old.image_url) then
    new.media := jsonb_build_array(jsonb_build_object('url', new.image_url, 'type', 'image'));
  end if;
  if exists (select 1 from jsonb_array_elements(new.media) m
             where jsonb_typeof(m) <> 'object' or coalesce(m->>'url', '') !~ '^https://' or coalesce(m->>'type', '') not in ('image', 'video')) then
    raise exception 'Each photo or video needs a web address (https://)';
  end if;
  new.image_url := new.media->0->>'url';

  v_n := jsonb_array_length(new.media);
  select count(*) filter (where m->>'type' = 'video') into v_videos from jsonb_array_elements(new.media) m;
  if new.kind = 'post' and v_videos > 0 then raise exception 'Videos go out as reels: choose Reel'; end if;
  if new.kind = 'post' and v_n > 1 then raise exception 'A post has one photo. Choose Carousel for more'; end if;
  if new.kind = 'reel' and (v_n > 1 or v_videos <> v_n) then raise exception 'A reel is one video'; end if;
  if new.kind = 'story' and v_n > 1 then raise exception 'A story is one photo or video'; end if;
  if new.kind <> 'post' and exists (select 1 from unnest(new.targets) t where t <> 'instagram') then
    v_plural := case new.kind when 'carousel' then 'Carousels' when 'reel' then 'Reels' else 'Stories' end;
    raise exception '% go to Instagram only for now', v_plural;
  end if;

  if new.status = 'scheduled' then
    if new.scheduled_at is null then raise exception 'Pick when to post'; end if;
    if cardinality(new.targets) = 0 then raise exception 'Pick at least one network'; end if;
    if btrim(new.caption) = '' and v_n = 0 then
      raise exception '%', case when new.kind = 'story' then 'Add the photo or video for the story' else 'Write a caption or add a photo' end;
    end if;
    -- Posting by itself: the networks need the photos and videos (a reminder doesn't).
    if new.auto then
      if new.kind = 'carousel' and v_n < 2 then raise exception 'A carousel needs at least 2 photos or videos'; end if;
      if new.kind = 'reel' and v_n < 1 then raise exception 'Add the reel''s video'; end if;
      if new.kind = 'story' and v_n < 1 then raise exception 'Add the story''s photo or video'; end if;
      if v_n = 0 and ('instagram' = any(new.targets) or 'tiktok' = any(new.targets)) then
        raise exception 'Instagram and TikTok posts need a photo';
      end if;
      if 'tiktok' = any(new.targets) and exists (select 1 from jsonb_array_elements(new.media) m
                                                 where m->>'type' <> 'image' or m->>'url' !~* '\.(jpe?g)(\?|$)') then
        raise exception 'TikTok only takes JPEG photos';
      end if;
    end if;
    if 'google' = any(new.targets) and char_length(new.caption) > 1500 then
      raise exception 'Google Maps posts are limited to 1500 characters';
    end if;
  end if;

  -- Marked as posted by hand: when, and that it was by hand.
  if tg_op = 'UPDATE' and old.status = 'due' and new.status = 'published' then
    new.published_at := coalesce(new.published_at, now());
    new.results := (select coalesce(jsonb_object_agg(x, jsonb_build_object('status', 'published', 'manual', true, 'at', now())), '{}'::jsonb)
                      from unnest(new.targets) x);
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Each network's job carries the kind and every photo and video.
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
      jsonb_build_object('post_id', v.id, 'target', t, 'caption', v.caption, 'image_url', v.image_url, 'kind', v.kind, 'media', v.media)
      || case when t = 'google' and v_ev.id is not null
           then jsonb_build_object('title', v_ev.title, 'starts_on', v_ev.starts_on, 'ends_on', coalesce(v_ev.ends_on, v_ev.starts_on))
           else '{}'::jsonb end,
      'social:' || v.id || ':' || t);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- A reminder whose time has come: it's due, and every admin gets a notification (the bell).
create or replace function public._remind_social_post(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare v public.social_posts; v_where text;
begin
  update public.social_posts set status = 'due' where id = p_id and status = 'scheduled' and not auto returning * into v;
  if v.id is null then return; end if;
  v_where := (select string_agg(case x when 'google' then 'Google Maps' when 'tiktok' then 'TikTok' else initcap(x) end, ' and ' order by x)
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

create or replace function public.queue_due_social_posts() returns int
language plpgsql security definer set search_path = ''
as $$
declare r record; n int := 0;
begin
  for r in select id, auto from public.social_posts where status = 'scheduled' and scheduled_at <= now()
           order by scheduled_at limit 50 for update skip locked loop
    if r.auto then
      n := n + public._publish_social_post(r.id);
    else
      perform public._remind_social_post(r.id);
    end if;
  end loop;
  return n;
end;
$$;

revoke execute on function public._publish_social_post(uuid), public._remind_social_post(uuid), public.queue_due_social_posts(),
  public.social_post_rules() from public, anon, authenticated;
grant execute on function public.queue_due_social_posts() to service_role;
