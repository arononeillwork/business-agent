-- Instagram highlights (Content, admins): the circles under the business's Instagram profile ("Reviews ⭐",
-- "Doggos"). Instagram lets no app read highlights or add to them, so the circles are kept here, and a
-- photo or video from Content goes into one in two steps:
--   1. it goes up as an Instagram story: a social_posts row of kind 'story', posting itself at its time or
--      a reminder to post it yourself, like any other on the Social planner; highlight_stories links it to
--      its highlight (add_to_highlight() makes both, one story for each photo or video, in order);
--   2. once it's up, the admins are told to add it to the highlight in the Instagram app (open the story,
--      tap Highlight, choose the circle), and they mark it added on the Content page.
-- shared/highlights.ts has the same rules.

create table public.instagram_highlights (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 30),
  -- The circle's picture: the first photo put in it.
  cover_url   text check (char_length(cover_url) <= 1000 and cover_url ~* '^https?://\S+$'),
  created_by  uuid references auth.users on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
select public.add_business_scope('public.instagram_highlights');
create unique index instagram_highlights_name on public.instagram_highlights (business_id, lower(name));
create index instagram_highlights_created_by_idx on public.instagram_highlights (created_by);

-- The name trimmed, and each once (whatever the capitals).
create or replace function public.instagram_highlight_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.name := regexp_replace(btrim(new.name), '\s+', ' ', 'g');
  if exists (select 1 from public.instagram_highlights h
              where h.business_id = new.business_id and lower(h.name) = lower(new.name) and h.id <> new.id) then
    raise exception 'There’s a highlight called % already', new.name using errcode = '23505';
  end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  return new;
end $$;
revoke execute on function public.instagram_highlight_rules() from public, anon, authenticated;
create trigger instagram_highlights_rules before insert or update on public.instagram_highlights
  for each row execute function public.instagram_highlight_rules();
create trigger audit_instagram_highlights after insert or update or delete on public.instagram_highlights
  for each row execute function public.audit_row();

create table public.highlight_stories (
  id            uuid primary key default gen_random_uuid(),
  highlight_id  uuid not null references public.instagram_highlights (id) on delete cascade,
  -- The story on the Social planner (deleting it there takes it out of the highlight here).
  post_id       uuid not null references public.social_posts (id) on delete cascade,
  -- When an admin said they'd added it to the highlight in the Instagram app.
  added_at      timestamptz,
  created_at    timestamptz not null default now()
);
select public.add_business_scope('public.highlight_stories');
create unique index highlight_stories_post on public.highlight_stories (business_id, post_id);
create index highlight_stories_post_idx on public.highlight_stories (post_id);
create index highlight_stories_highlight_idx on public.highlight_stories (highlight_id);

-- Whether a story is up on Instagram: posted by itself, or a reminder someone marked posted.
create or replace function public.instagram_story_up(p_status text, p_results jsonb) returns boolean
language sql immutable set search_path = ''
as $$
  select coalesce(p_status in ('published', 'partly') and coalesce(p_results->'instagram'->>'status', 'published') = 'published', false);
$$;

-- A highlight's story is an Instagram story of the same business; it's marked added only once it's up.
create or replace function public.highlight_story_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.instagram_highlights h where h.id = new.highlight_id and h.business_id = new.business_id) then
      raise exception 'Pick one of your highlights' using errcode = '22023';
    end if;
    if not exists (select 1 from public.social_posts s where s.id = new.post_id and s.business_id = new.business_id
                    and s.kind = 'story' and 'instagram' = any(s.targets)) then
      raise exception 'Only an Instagram story goes into a highlight' using errcode = '22023';
    end if;
    new.created_at := now();
  else
    new.highlight_id := old.highlight_id;
    new.post_id := old.post_id;
    new.created_at := old.created_at;
  end if;
  if new.added_at is not null and (tg_op = 'INSERT' or old.added_at is null) then
    if not exists (select 1 from public.social_posts s where s.id = new.post_id and public.instagram_story_up(s.status, s.results)) then
      raise exception 'Add it to the highlight once the story is up on Instagram' using errcode = '22023';
    end if;
    new.added_at := now();
  end if;
  return new;
end $$;
revoke execute on function public.highlight_story_rules() from public, anon, authenticated;
create trigger highlight_stories_rules before insert or update on public.highlight_stories
  for each row execute function public.highlight_story_rules();
create trigger audit_highlight_stories after insert or update or delete on public.highlight_stories
  for each row execute function public.audit_row();

alter table public.instagram_highlights enable row level security;
alter table public.highlight_stories enable row level security;
revoke all on public.instagram_highlights, public.highlight_stories from anon;
-- Admins only, like the Content page and the Social planner. A highlight's name and picture change;
-- a story is only marked added (or not).
create policy instagram_highlights_admin on public.instagram_highlights for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy highlight_stories_admin on public.highlight_stories for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke update on public.instagram_highlights, public.highlight_stories from authenticated;
grant update (name, cover_url) on public.instagram_highlights to authenticated;
grant update (added_at) on public.highlight_stories to authenticated;

-- Photos and videos into a highlight (a new one when p_highlight is null, called p_name): one story each,
-- in the order given, a second apart from p_at (the minute job sends them in that order), posting
-- themselves (p_auto) or as reminders. A highlight without a picture takes the first photo's.
-- Runs with the caller's rights: the rules and the plan's posts a month apply to each story.
create or replace function public.add_to_highlight(p_highlight uuid, p_name text, p_media jsonb, p_at timestamptz, p_auto boolean)
returns uuid
language plpgsql set search_path = ''
as $$
declare
  v_id   uuid := p_highlight;
  v_post uuid;
  v_n    int := 0;
  m      jsonb;
begin
  if not public.is_admin() then raise exception 'Only an admin adds to a highlight' using errcode = '42501'; end if;
  if jsonb_typeof(p_media) is distinct from 'array' or jsonb_array_length(p_media) = 0 then
    raise exception 'Choose the photos and videos' using errcode = '22023';
  end if;
  if jsonb_array_length(p_media) > 20 then raise exception 'Up to 20 at a time' using errcode = '22023'; end if;
  if p_at is null then raise exception 'Pick when to post' using errcode = '22023'; end if;
  if v_id is null then
    insert into public.instagram_highlights (name) values (p_name) returning id into v_id;
  elsif not exists (select 1 from public.instagram_highlights where id = v_id) then
    raise exception 'That highlight isn’t here any more' using errcode = '22023';
  end if;
  for m in select value from jsonb_array_elements(p_media) with ordinality order by ordinality loop
    insert into public.social_posts (kind, caption, media, targets, status, scheduled_at, auto)
    values ('story', '', jsonb_build_array(m), array['instagram'], 'scheduled', p_at + make_interval(secs => v_n), coalesce(p_auto, true))
    returning id into v_post;
    insert into public.highlight_stories (highlight_id, post_id) values (v_id, v_post);
    v_n := v_n + 1;
  end loop;
  update public.instagram_highlights
     set cover_url = (select value->>'url' from jsonb_array_elements(p_media) with ordinality where value->>'type' = 'image' order by ordinality limit 1)
   where id = v_id and cover_url is null;
  return v_id;
end $$;
revoke execute on function public.add_to_highlight(uuid, text, jsonb, timestamptz, boolean) from public, anon;
grant execute on function public.add_to_highlight(uuid, text, jsonb, timestamptz, boolean) to authenticated;

-- Once a highlight's story is up, the admins are told to add it in the Instagram app (no app can): once
-- for a highlight while they haven't read it yet (several going up together tell them once). As the owner,
-- for the post's own business: the Worker writes the outcome.
create or replace function public.highlight_story_news() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_set  text;
  v_name text;
begin
  if not public.instagram_story_up(new.status, new.results) or public.instagram_story_up(old.status, old.results) then return null; end if;
  v_set := current_setting('app.business_id', true);
  perform set_config('app.business_id', new.business_id::text, true);
  for v_name in select h.name from public.highlight_stories s join public.instagram_highlights h on h.id = s.highlight_id
                 where s.post_id = new.id and s.added_at is null loop
    insert into public.notifications (profile_id, title, body, link, data)
    select p.id, 'Add your story to ' || v_name,
           'It’s up on Instagram. Instagram doesn’t let apps add to highlights: in the Instagram app, open the story, tap Highlight and choose '
             || v_name || '. The Content page shows which are still to add.',
           '/content', jsonb_build_object('highlight_story', new.id)
      from public.profiles p
     where p.business_id = new.business_id and p.role = 'admin' and p.active
       and not exists (select 1 from public.notifications n where n.profile_id = p.id and n.read_at is null and n.title = 'Add your story to ' || v_name);
  end loop;
  perform set_config('app.business_id', coalesce(v_set, ''), true);
  return null;
end $$;
alter function public.highlight_story_news() owner to app_definer;
revoke execute on function public.highlight_story_news() from public, anon, authenticated;
create trigger social_posts_highlight_news after update of status, results on public.social_posts
  for each row execute function public.highlight_story_news();
