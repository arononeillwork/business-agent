-- Post ideas (Social planner → Ideas): posts the business wants made, so anyone on the team can see
-- what's needed and make it ("The coffees we have now: Puchero, Cocobrew and Santa Roaster's decaf Colombia",
-- wanting photos or a video). shared/postIdeas.ts has the same rules.
-- Who: the whole team (owners, shop managers, employees) reads them, adds them, says they'll make one,
-- adds the photos or video and hands it in. Only admins make the post from one (post_id), mark one done,
-- give one to someone else, or change or delete someone else's idea. Someone else's idea can be deleted
-- by its author only while nobody's started on it.
-- Handing one in tells the admins; an admin giving one to someone tells that person.

create table public.post_ideas (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  details     text check (char_length(details) <= 1000),
  wants       text not null default 'either' check (wants in ('photo', 'video', 'either')),
  status      text not null default 'open' check (status in ('open', 'doing', 'ready', 'done')),
  taken_by    uuid references public.profiles (id) on delete set null,
  -- The photos and videos made for it: [{ "url": "https://…", "type": "image" | "video" }], up to 10.
  media       jsonb not null default '[]'::jsonb check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) <= 10),
  post_id     uuid references public.social_posts (id) on delete set null,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint post_ideas_doing check (status <> 'doing' or taken_by is not null),
  constraint post_ideas_ready check (status <> 'ready' or jsonb_array_length(media) > 0)
);
select public.add_business_scope('public.post_ideas');
create index post_ideas_taken_by_idx on public.post_ideas (taken_by);
create index post_ideas_post_idx on public.post_ideas (post_id);
create index post_ideas_created_by_idx on public.post_ideas (created_by);

-- Who may change what (the policies let the whole team write; this says which parts), and tidying.
-- Runs with the caller's rights: the Worker and SQL (no one signed in) are trusted.
create or replace function public.post_idea_rules() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_me    uuid := auth.uid();
  v_admin boolean := v_me is null or public.is_admin();
begin
  new.title := btrim(new.title);
  new.details := nullif(btrim(new.details), '');
  if exists (select 1 from jsonb_array_elements(new.media) m
              where jsonb_typeof(m) <> 'object' or coalesce(m->>'type', '') not in ('image', 'video') or coalesce(m->>'url', '') !~ '^https://') then
    raise exception 'Add photos or videos' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(v_me, new.created_by);
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();

  if not v_admin then
    if new.post_id is distinct from (case when tg_op = 'UPDATE' then old.post_id end) then
      raise exception 'Only an admin makes the post' using errcode = '42501';
    end if;
    if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
      raise exception 'Only an admin marks an idea done' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and old.status = 'done' then
      raise exception 'This one’s done: an admin can open it again' using errcode = '42501';
    end if;
    -- Saying you'll make it, or letting it go: only for yourself, and not over someone else.
    if new.taken_by is distinct from (case when tg_op = 'UPDATE' then old.taken_by end)
       and ((new.taken_by is not null and new.taken_by <> v_me)
            or (tg_op = 'UPDATE' and old.taken_by is not null and old.taken_by <> v_me)) then
      raise exception 'Someone else is making this one' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and old.created_by is distinct from v_me
       and (new.title, new.details, new.wants) is distinct from (old.title, old.details, old.wants) then
      raise exception 'Only an admin or whoever added it changes the idea' using errcode = '42501';
    end if;
  else
    if new.taken_by is not null and (tg_op = 'INSERT' or new.taken_by is distinct from old.taken_by)
       and not exists (select 1 from public.profiles p where p.id = new.taken_by and p.business_id = new.business_id
                        and p.active and p.role in ('admin', 'employee')) then
      raise exception 'Pick someone on the team' using errcode = '22023';
    end if;
    if new.post_id is not null and (tg_op = 'INSERT' or new.post_id is distinct from old.post_id) then
      if not exists (select 1 from public.social_posts s where s.id = new.post_id and s.business_id = new.business_id) then
        raise exception 'That post isn’t on the planner' using errcode = '22023';
      end if;
      new.status := 'done';
    end if;
  end if;

  -- Nobody making it any more: back up for grabs.
  if new.status = 'doing' and new.taken_by is null then new.status := 'open'; end if;
  return new;
end $$;
revoke execute on function public.post_idea_rules() from public, anon, authenticated;
create trigger post_ideas_rules before insert or update on public.post_ideas for each row execute function public.post_idea_rules();

-- Deleting: admins any; anyone else only their own, while nobody's started on it.
create or replace function public.post_idea_delete_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (old.created_by is distinct from auth.uid() or old.status <> 'open' or jsonb_array_length(old.media) > 0) then
    raise exception 'Only an admin deletes an idea someone’s working on' using errcode = '42501';
  end if;
  return old;
end $$;
revoke execute on function public.post_idea_delete_rules() from public, anon, authenticated;
create trigger post_ideas_delete_rules before delete on public.post_ideas for each row execute function public.post_idea_delete_rules();

-- Telling people: the admins when one's handed in (not the one who handed it in), and the person an
-- admin gives one to. As the owner: nobody signed in adds notifications themselves.
create or replace function public.post_idea_news() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_by text := coalesce((select full_name from public.profiles where id = auth.uid()), 'Someone');
begin
  if new.status = 'ready' and (tg_op = 'INSERT' or old.status <> 'ready') then
    insert into public.notifications (profile_id, title, body, link, data)
    select p.id, 'Ready to post: ' || left(new.title, 80),
           v_by || ' added ' || case when jsonb_array_length(new.media) = 1 then 'the ' || case when new.media->0->>'type' = 'video' then 'video' else 'photo' end
                                     else jsonb_array_length(new.media) || ' photos and videos' end || '. Make the post on the Social planner.',
           '/social', jsonb_build_object('post_idea', new.id)
      from public.profiles p
     where p.business_id = new.business_id and p.role = 'admin' and p.active and p.id is distinct from auth.uid();
  end if;
  if new.taken_by is not null and new.taken_by is distinct from auth.uid() and auth.uid() is not null
     and (tg_op = 'INSERT' or new.taken_by is distinct from old.taken_by) then
    insert into public.notifications (profile_id, title, body, link, data)
    values (new.taken_by, 'A post for you to make: ' || left(new.title, 80),
            v_by || ' asked you to make it' || case when new.details is not null then ': ' || left(new.details, 200) else '.' end,
            '/social', jsonb_build_object('post_idea', new.id));
  end if;
  return null;
end $$;
alter function public.post_idea_news() owner to app_definer;
revoke execute on function public.post_idea_news() from public, anon, authenticated;
create trigger post_ideas_news after insert or update on public.post_ideas for each row execute function public.post_idea_news();
create trigger audit_post_ideas after insert or update or delete on public.post_ideas for each row execute function public.audit_row();

alter table public.post_ideas enable row level security;
revoke all on public.post_ideas from anon;
create policy post_ideas_read on public.post_ideas for select to authenticated
  using ((select public.is_staff()));
create policy post_ideas_add on public.post_ideas for insert to authenticated
  with check ((select public.is_staff()));
create policy post_ideas_change on public.post_ideas for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy post_ideas_delete on public.post_ideas for delete to authenticated
  using ((select public.is_staff()));

-- Easy Beans (business 1): the owner's first idea, the coffees in use now.
insert into public.post_ideas (business_id, title, details, wants)
select b.id, 'The coffees we have now', 'Puchero, Cocobrew and Santa Roaster''s decaf Colombia: the bags, a cup of each, and what each one tastes like.', 'either'
  from public.business b where b.id = 1;
