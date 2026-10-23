-- Music on social posts (docs/SOCIAL_MUSIC_PLAN.md): the business's music library, AI tracks
-- made with ElevenLabs and paid per use (PAY_PER_USE in shared/plans.ts), the music chosen for a
-- post, and the brand's sound. Numbered 62 so it never clashes with 59–61 on other branches.

-- 1. Pay per use: what each extra costs and how many each plan gets free a month. Keep in step
--    with PAY_PER_USE in shared/plans.ts (plans.test.ts checks it). A plan left out of
--    `included` can't use it.
create table public.pay_per_use (
  id           text primary key,
  price_cents  int not null check (price_cents > 0),
  included     jsonb not null check (jsonb_typeof(included) = 'object')
);
insert into public.pay_per_use (id, price_cents, included) values
  ('ai_music', 99, '{"starter": 0, "pro": 0, "business": 1}');
alter table public.pay_per_use enable row level security;
revoke all on public.pay_per_use from anon;
create policy pay_per_use_read on public.pay_per_use for select to authenticated using (true);

-- The monthly spending limit on pay per use (admins change it), and extra free AI tracks a month
-- we can give by hand (complimentary accounts have no subscription to charge).
alter table public.billing
  add column ai_music_limit_cents int not null default 2500 check (ai_music_limit_cents between 0 and 100000),
  add column ai_music_extra_free  int not null default 0 check (ai_music_extra_free between 0 and 100);

-- 2. The music library. Every track says where it came from and who said it may be used.
--    starter  made by Business Agent with ElevenLabs and given to every business
--    ai       made for this business with ElevenLabs (a pay-per-use AI track)
--    upload   the business's own file, with the "we have the right" tick
create table public.music_tracks (
  id           uuid primary key default gen_random_uuid(),
  source       text not null check (source in ('starter', 'ai', 'upload')),
  title        text not null check (char_length(btrim(title)) between 1 and 80),
  artist       text check (char_length(artist) <= 80),
  url          text not null check (url ~ '^https://'),
  duration_s   real not null check (duration_s > 0 and duration_s <= 900),
  bpm          real check (bpm is null or bpm between 40 and 220),
  energy       smallint check (energy between 1 and 5),
  moods        text[] not null default '{}' check (cardinality(moods) <= 8),
  genre        text check (char_length(genre) <= 40),
  vocals       boolean not null default false,
  -- Where the best part starts (the loudest stretch), and the shape of the sound for the picker.
  highlight_s  real not null default 0 check (highlight_s >= 0),
  waveform     jsonb check (waveform is null or (jsonb_typeof(waveform) = 'array' and jsonb_array_length(waveform) <= 400)),
  -- {"kind", "provider", "model", "prompt", "terms", "confirmed", "confirmed_by", "at"}
  licence      jsonb not null default '{}'::jsonb check (jsonb_typeof(licence) = 'object'),
  -- The starter pack's own key, so each of its tracks is made once.
  starter_key  text unique,
  saved        boolean not null default false,
  hidden       boolean not null default false,
  created_by   uuid references auth.users default auth.uid(),
  created_at   timestamptz not null default now()
);
create index music_tracks_list_idx on public.music_tracks (hidden, created_at desc);
alter table public.music_tracks enable row level security;
revoke all on public.music_tracks from anon;
create policy music_tracks_admin on public.music_tracks for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- From the app: uploads only (with the tick), and afterwards only the name, moods, saved and
-- hidden change. AI and starter tracks come from the Worker (service role).
create or replace function public.music_track_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    if new.source <> 'upload' then raise exception 'AI tracks are made with Create with AI'; end if;
    if coalesce((new.licence->>'confirmed')::boolean, false) is not true then
      raise exception 'Tick that you have the right to use this music on social media';
    end if;
    new.licence := new.licence || jsonb_build_object('kind', 'upload', 'confirmed_by', auth.uid(), 'at', now());
    new.starter_key := null;
    return new;
  end if;
  if (new.source, new.url, new.duration_s, new.licence, new.starter_key, new.created_by, new.created_at)
     is distinct from (old.source, old.url, old.duration_s, old.licence, old.starter_key, old.created_by, old.created_at) then
    raise exception 'Only a track''s name, moods and whether it''s saved can change';
  end if;
  return new;
end;
$$;
create trigger music_tracks_rules before insert or update on public.music_tracks
  for each row execute function public.music_track_rules();

-- 3. AI tracks: each "Make" is one use per started minute (two versions to choose from). The use
--    is reserved before ElevenLabs is called (ai_music_start), settled after (ai_music_finish), and
--    charged on the Stripe bill by the Worker. Failed or refused ones are never charged.
create table public.music_generations (
  id                   uuid primary key default gen_random_uuid(),
  prompt               text not null check (char_length(btrim(prompt)) between 3 and 600),
  seconds              real not null check (seconds between 3 and 600),
  uses                 smallint not null check (uses between 1 and 10),
  status               text not null default 'working' check (status in ('working', 'done', 'failed', 'refused')),
  -- Of the uses, how many were free (the plan's monthly ones) and what the rest cost.
  free                 smallint not null default 0 check (free >= 0),
  price_cents          int not null default 0 check (price_cents >= 0),
  model                text,
  track_ids            uuid[] not null default '{}',
  kept_id              uuid references public.music_tracks on delete set null,
  post_id              uuid references public.social_posts on delete set null,
  error                text,
  stripe_invoice_item  text,
  charged_at           timestamptz,
  created_by           uuid references auth.users default auth.uid(),
  created_at           timestamptz not null default now(),
  finished_at          timestamptz
);
create index music_generations_month_idx on public.music_generations (created_at desc);
alter table public.music_generations enable row level security;
revoke all on public.music_generations from anon, authenticated;
grant select on public.music_generations to authenticated;
create policy music_generations_admin_read on public.music_generations for select to authenticated using ((select public.is_admin()));

-- The start of this month, in the business's time zone (free uses and the limit are monthly).
create or replace function public.music_month_start() returns timestamptz
language sql stable security definer set search_path = ''
as $$
  select date_trunc('month', now() at time zone public.business_tz()) at time zone public.business_tz();
$$;

-- Uses that count this month: finished ones, and ones still being made (a quarter of an hour at most).
create or replace function public._ai_music_month() returns table (free_used int, spent_cents int)
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(free), 0)::int, coalesce(sum(price_cents), 0)::int from public.music_generations
   where created_at >= public.music_month_start()
     and (status = 'done' or (status = 'working' and created_at > now() - interval '15 minutes'));
$$;

-- What making an AI track of this length would cost right now, and whether it can be made:
--   allowed      the plan in force can use it (paid plans; complimentary counts as the top plan)
--   uses         one per started minute
--   free         how many of those are free (the plan's monthly ones, then any given by hand)
--   price_cents  the rest, at the pay-per-use price
--   reason       why it can't be made now (null: it can)
create or replace function public.ai_music_quote(p_seconds real default 30) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_plan     text := public.current_plan();
  v_ppu      public.pay_per_use;
  v_b        public.billing;
  v_inc      int;
  v_month    record;
  v_uses     int := greatest(1, ceil(greatest(p_seconds, 3) / 60.0))::int;
  v_free_left int;
  v_free     int;
  v_price    int;
  v_can_pay  boolean;
  v_reason   text;
begin
  select * into v_ppu from public.pay_per_use where id = 'ai_music';
  select * into v_b from public.billing where id = 1;
  select * into v_month from public._ai_music_month();
  v_inc := (v_ppu.included->>v_plan)::int;
  v_free_left := greatest(0, coalesce(v_inc, 0) + coalesce(v_b.ai_music_extra_free, 0) - v_month.free_used);
  v_free := least(v_uses, v_free_left);
  v_price := (v_uses - v_free) * v_ppu.price_cents;
  -- Charged on the subscription's bill: only a paid-up subscription can take it.
  v_can_pay := v_b.status in ('active', 'trialing') and v_b.stripe_customer_id is not null;
  v_reason := case
    when v_inc is null then 'AI music tracks need a paid plan. Choose one on the Billing page.'
    when v_price > 0 and v_b.status = 'comped' then 'This month''s free AI track is used. More next month.'
    when v_price > 0 and not v_can_pay then 'AI music tracks are added to your monthly bill, and there isn''t one to add to. Check the Billing page.'
    when v_price > 0 and v_month.spent_cents + v_price > v_b.ai_music_limit_cents then
      format('That would go over this month''s limit of €%s for pay per use. Raise it on the Billing page.', to_char(v_b.ai_music_limit_cents / 100.0, 'FM999990.00'))
  end;
  return jsonb_build_object(
    'allowed', v_inc is not null, 'plan', v_plan, 'uses', v_uses, 'free', v_free, 'free_left', v_free_left,
    'included', coalesce(v_inc, 0), 'unit_cents', v_ppu.price_cents, 'price_cents', v_price,
    'spent_cents', v_month.spent_cents, 'limit_cents', v_b.ai_music_limit_cents, 'reason', v_reason);
end;
$$;

-- Reserve a use before ElevenLabs is called (admins). Raises the quote's reason when it can't.
create or replace function public.ai_music_start(p_prompt text, p_seconds real, p_post uuid default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_q jsonb; v_id uuid;
begin
  if not public.is_admin() then raise exception 'Only an admin can make AI music'; end if;
  -- One at a time, so two quick presses can't both take the month's free track.
  perform 1 from public.billing where id = 1 for update;
  -- Uses that never finished (the Worker stopped) give their reservation back.
  update public.music_generations set status = 'failed', error = 'Stopped before it finished', finished_at = now(), free = 0, price_cents = 0
   where status = 'working' and created_at <= now() - interval '15 minutes';
  v_q := public.ai_music_quote(p_seconds);
  if v_q->>'reason' is not null then raise exception '%', v_q->>'reason' using errcode = 'P0402'; end if;
  insert into public.music_generations (prompt, seconds, uses, free, price_cents, post_id)
  values (btrim(p_prompt), p_seconds, (v_q->>'uses')::int, (v_q->>'free')::int, (v_q->>'price_cents')::int, p_post)
  returning id into v_id;
  return v_q || jsonb_build_object('id', v_id);
end;
$$;

-- The Worker, after ElevenLabs: done (with the tracks), failed or refused (nothing charged).
create or replace function public.ai_music_finish(p_id uuid, p_status text, p_track_ids uuid[] default '{}',
  p_model text default null, p_error text default null) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_status not in ('done', 'failed', 'refused') then raise exception 'Unknown status %', p_status; end if;
  update public.music_generations set status = p_status, track_ids = coalesce(p_track_ids, '{}'), model = p_model,
         error = left(p_error, 500), finished_at = now(),
         free = case when p_status = 'done' then free else 0 end,
         price_cents = case when p_status = 'done' then price_cents else 0 end
   where id = p_id and status = 'working';
end;
$$;

-- The Worker, once the charge is on the Stripe bill.
create or replace function public.ai_music_charged(p_id uuid, p_invoice_item text) returns void
language sql security definer set search_path = ''
as $$
  update public.music_generations set stripe_invoice_item = p_invoice_item, charged_at = now()
   where id = p_id and status = 'done' and price_cents > 0 and charged_at is null;
$$;

-- Which of a use's two versions the admin kept (the other stays in the library, hidden).
create or replace function public.ai_music_keep(p_id uuid, p_track uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_ids uuid[];
begin
  if not public.is_admin() then raise exception 'Only an admin can do that'; end if;
  update public.music_generations set kept_id = p_track where id = p_id and p_track = any (track_ids)
  returning track_ids into v_ids;
  if v_ids is null then raise exception 'That track isn''t from this one'; end if;
  update public.music_tracks set hidden = (id <> p_track), saved = (id = p_track) or saved where id = any (v_ids);
end;
$$;

-- The monthly limit on pay per use, in cents (admins, Billing page).
create or replace function public.set_ai_music_limit(p_cents int) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can change billing'; end if;
  if p_cents is null or p_cents < 0 or p_cents > 100000 then raise exception 'The limit must be between €0 and €1,000'; end if;
  update public.billing set ai_music_limit_cents = p_cents, updated_at = now() where id = 1;
end;
$$;

-- Extra free AI tracks a month, given by us (service role), e.g. for a complimentary account.
create or replace function public.grant_ai_music(p_free int) returns void
language sql security definer set search_path = ''
as $$
  update public.billing set ai_music_extra_free = greatest(0, least(100, p_free)), updated_at = now() where id = 1;
$$;

revoke execute on function public.ai_music_quote(real), public.ai_music_start(text, real, uuid), public.ai_music_keep(uuid, uuid),
  public.set_ai_music_limit(int), public.music_month_start(), public._ai_music_month() from public, anon;
grant execute on function public.ai_music_quote(real), public.ai_music_start(text, real, uuid), public.ai_music_keep(uuid, uuid),
  public.set_ai_music_limit(int), public.music_month_start() to authenticated, service_role;
revoke execute on function public._ai_music_month() from authenticated;
revoke execute on function public.ai_music_finish(uuid, text, uuid[], text, text), public.ai_music_charged(uuid, text),
  public.grant_ai_music(int), public.music_track_rules() from public, anon, authenticated;
grant execute on function public.ai_music_finish(uuid, text, uuid[], text, text), public.ai_music_charged(uuid, text),
  public.grant_ai_music(int), public._ai_music_month() to service_role;

-- 4. The brand's sound (Brand page): moods its music has, and moods it never has. Suggestions
--    and AI prompts start from these.
alter table public.brand
  add column sound_moods text[] not null default '{}' check (cardinality(sound_moods) <= 5),
  add column sound_avoid text[] not null default '{}' check (cardinality(sound_avoid) <= 5);
update public.brand set sound_moods = '{acoustic,chill,latin}' where id = 1 and sound_moods = '{}';

-- 5. Music on a post. `music` (null: none):
--      mode 'mixed'         the track goes into the file itself (stories and reels): track_id, title,
--                           artist, url, start, seconds, music_volume, original_volume, fade_in,
--                           fade_out, audio_name (reels), label (photo stories), source_media (the
--                           photo, video or photos before the music), rendered_url (the file with
--                           the music in, which is the post's media), rendered_for
--      mode 'in_instagram'  added by whoever posts it, in the Instagram app (reminders): song, start
--    `insights`: likes and comments Instagram counted, for suggestions that learn what works.
alter table public.social_posts
  add column music jsonb check (music is null or jsonb_typeof(music) = 'object'),
  add column insights jsonb check (insights is null or jsonb_typeof(insights) = 'object');

create or replace function public.social_post_rules() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_n int;
  v_videos int;
  v_plural text;
  v_mode text;
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

  -- Music: mixed into stories and reels; Instagram's own songs only on posts you finish yourself.
  v_mode := new.music->>'mode';
  if new.music is not null then
    if v_mode not in ('mixed', 'in_instagram') then raise exception 'Unknown kind of music'; end if;
    if v_mode = 'mixed' then
      if new.kind not in ('story', 'reel') then raise exception 'Music goes into stories and reels. Choose Story or Reel.'; end if;
      if coalesce(new.music->>'url', '') !~ '^https://' then raise exception 'Choose a track for the music'; end if;
    elsif char_length(btrim(coalesce(new.music->>'song', ''))) not between 1 and 120 then
      raise exception 'Write the song to add in Instagram';
    end if;
  end if;

  if new.status = 'scheduled' then
    if new.scheduled_at is null then raise exception 'Pick when to post'; end if;
    if cardinality(new.targets) = 0 then raise exception 'Pick at least one network'; end if;
    -- Posting by itself: the networks need the photos and videos (a reminder doesn't).
    if new.auto then
      if new.kind = 'carousel' and v_n < 2 then raise exception 'A carousel needs at least 2 photos or videos'; end if;
      if new.kind = 'reel' and v_n < 1 then raise exception 'Add the reel''s video'; end if;
      if new.kind = 'story' and v_n < 1 then raise exception 'Add the story''s photo or video'; end if;
    end if;
    if btrim(new.caption) = '' and v_n = 0 then
      raise exception '%', case when new.kind = 'story' then 'Add the photo or video for the story' else 'Write a caption or add a photo' end;
    end if;
    if new.auto then
      if v_n = 0 and ('instagram' = any(new.targets) or 'tiktok' = any(new.targets)) then
        raise exception 'Instagram and TikTok posts need a photo';
      end if;
      if 'tiktok' = any(new.targets) and exists (select 1 from jsonb_array_elements(new.media) m
                                                 where m->>'type' <> 'image' or m->>'url' !~* '\.(jpe?g)(\?|$)') then
        raise exception 'TikTok only takes JPEG photos';
      end if;
      if v_mode = 'in_instagram' then
        raise exception 'Songs from Instagram''s library are added in the Instagram app: choose Remind me';
      end if;
    end if;
    -- What goes out is the file with the music in it, not the photo or video from before.
    if v_mode = 'mixed' and (v_n <> 1 or new.media->0->>'url' is distinct from new.music->>'rendered_url') then
      raise exception 'The music isn''t in the file yet. Save it again to add it.';
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

-- Instagram reels with music carry the sound's name ("Easy Beans · Sunday Morning").
create or replace function public._publish_social_post(p_id uuid) returns int
language plpgsql security definer set search_path = ''
as $$
declare v public.social_posts; v_ev public.calendar_events; t text; n int := 0; v_key text; v_earlier int;
begin
  update public.social_posts set status = 'publishing',
         results = (select coalesce(jsonb_object_agg(x, jsonb_build_object('status', 'queued')), '{}'::jsonb) from unnest(targets) x)
   where id = p_id and status = 'scheduled'
  returning * into v;
  if v.id is null then return 0; end if;
  if v.event_id is not null then select * into v_ev from public.calendar_events where id = v.event_id; end if;
  foreach t in array v.targets loop
    v_key := 'social:' || v.id || ':' || t;
    select count(*) into v_earlier from public.outbox where dedupe_key = v_key or dedupe_key like v_key || ':%';
    perform public._enqueue(t || '_post',
      jsonb_build_object('post_id', v.id, 'target', t, 'caption', v.caption, 'image_url', v.image_url, 'kind', v.kind, 'media', v.media)
      || case when t = 'google' and v_ev.id is not null
           then jsonb_build_object('title', v_ev.title, 'starts_on', v_ev.starts_on, 'ends_on', coalesce(v_ev.ends_on, v_ev.starts_on))
           else '{}'::jsonb end
      || case when t = 'instagram' and v.kind = 'reel' and v.music->>'mode' = 'mixed' and nullif(btrim(v.music->>'audio_name'), '') is not null
           then jsonb_build_object('audio_name', left(btrim(v.music->>'audio_name'), 100))
           else '{}'::jsonb end,
      v_key || case when v_earlier > 0 then ':' || (v_earlier + 1) else '' end);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- A reminder whose time has come; with a song to add in Instagram, the notification says which.
create or replace function public._remind_social_post(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare v public.social_posts; v_where text; v_song text;
begin
  update public.social_posts set status = 'due' where id = p_id and status = 'scheduled' and not auto returning * into v;
  if v.id is null then return; end if;
  v_where := (select string_agg(case x when 'google' then 'Google Maps' when 'tiktok' then 'TikTok' when 'linkedin' then 'LinkedIn' else initcap(x) end, ' and ' order by x)
                from unnest(v.targets) x);
  if v.music->>'mode' = 'in_instagram' then
    v_song := '♫ ' || btrim(v.music->>'song')
      || case when coalesce((v.music->>'start')::real, 0) > 0
           then ' from ' || floor((v.music->>'start')::real / 60)::int || ':' || lpad((floor((v.music->>'start')::real)::int % 60)::text, 2, '0')
           else '' end;
  end if;
  insert into public.notifications (profile_id, title, body, link)
  select p.id,
         'Time to post your ' || lower(case v.kind when 'post' then 'post' when 'carousel' then 'carousel' when 'reel' then 'reel' else 'story' end)
           || ' on ' || coalesce(v_where, 'social media'),
         nullif(left(concat_ws(E'\n', v_song, nullif(btrim(v.caption), '')), 140), ''),
         '/social'
    from public.profiles p where p.role = 'admin' and p.active;
end;
$$;

revoke execute on function public._publish_social_post(uuid), public._remind_social_post(uuid), public.social_post_rules()
  from public, anon, authenticated;
