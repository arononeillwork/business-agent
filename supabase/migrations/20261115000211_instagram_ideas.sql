-- Ideas (To Do List → Ideas): posts and reels the team wants to remember, from one Instagram chat. Instagram
-- doesn't let apps read an account's saved posts, nor group chats, so the Ideas chat is the business's
-- Instagram chat with one other account the admins name (settings.idea_chat: the owner's own, say).
-- Every post, reel, photo or video sent in it, from either side, is an idea; what's written with it is its
-- note. The Worker reads the chat with the mentions (every 15 minutes) and keeps each one once, its picture
-- copied into the business's own storage: Instagram's links to a chat's pictures stop working after a few
-- days. shared/instagramIdeas.ts has the rules, worker/instagramIdeas.ts the reading.

-- 1. Who the Ideas chat is with: their Instagram username, as kept (lower case, no @). None: no Ideas chat yet.
alter table public.settings
  add column idea_chat text check (idea_chat ~ '^[a-z0-9._]{1,30}$');

-- 2. Each idea, once.
create table public.instagram_ideas (
  id          uuid primary key default gen_random_uuid(),
  -- Instagram's id for the message it came in.
  message_id  text not null check (char_length(message_id) between 1 and 500),
  kind        text not null check (kind in ('post', 'reel', 'photo', 'video')),
  -- Who sent it: the other account in the chat, or the business's own.
  username    text not null check (char_length(username) between 1 and 100),
  media_url   text check (char_length(media_url) <= 4000),
  media_type  text check (media_type in ('image', 'video')),
  -- media_url is a copy in the business's own storage (not Instagram's link, which runs out).
  media_kept  boolean not null default false,
  -- Tries at copying it that failed: after a few, Instagram's link is left as it is.
  media_tries smallint not null default 0 check (media_tries between 0 and 10),
  -- Where to open it on Instagram, when Instagram says.
  permalink   text check (char_length(permalink) <= 2000),
  -- What was written with it (or the post's caption).
  note        text check (char_length(note) <= 2200),
  shared_at   timestamptz not null,
  -- Taken off the page by an admin; kept, so the next read of the chat doesn't bring it back.
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);
select public.add_business_scope('public.instagram_ideas');
create unique index instagram_ideas_message on public.instagram_ideas (business_id, message_id);
create index instagram_ideas_shown_idx on public.instagram_ideas (business_id, shared_at desc) where not hidden;
-- Pictures still to copy (worker/instagramIdeas.ts copyPictures).
create index instagram_ideas_to_copy_idx on public.instagram_ideas (business_id, shared_at desc) where not media_kept and not hidden;

alter table public.instagram_ideas enable row level security;
revoke all on public.instagram_ideas from anon;
-- The team reads them (the To Do List's people); admins take one off the page. Only the Worker adds them.
create policy instagram_ideas_read on public.instagram_ideas for select to authenticated using ((select public.is_staff()));
create policy instagram_ideas_hide on public.instagram_ideas for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke insert, update, delete on public.instagram_ideas from authenticated;
grant update (hidden) on public.instagram_ideas to authenticated;
