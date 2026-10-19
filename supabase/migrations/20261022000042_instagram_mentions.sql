-- Instagram mentions: when someone tags the business in a post or mentions it in their story,
-- every admin gets a notification they can repost from (to the business's own story) in one
-- press, or ignore. The Worker looks for new ones every 15 minutes and notices each one once.

-- 1. Notifications can carry an action: kind says which, data what it's about.
alter table public.notifications
  add column kind text check (kind is null or kind in ('instagram_mention')),
  add column data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object');

-- 2. The switch on the Notifications page (on unless an admin turns it off).
alter table public.settings add column alert_instagram_mentions boolean not null default true;

-- 3. Each mention, and what was done about it (so it's never noticed twice, and every admin's
--    notification shows the same outcome).
create table public.instagram_mentions (
  id            text primary key, -- 'story:<message id>' or 'post:<media id>'
  kind          text not null check (kind in ('story', 'post')),
  username      text,
  media_url     text,
  permalink     text,
  caption       text,
  mentioned_at  timestamptz not null,
  status        text not null default 'new' check (status in ('new', 'reposted', 'ignored')),
  reposted_url  text,
  decided_by    uuid references public.profiles (id) on delete set null,
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index instagram_mentions_new_idx on public.instagram_mentions (mentioned_at desc) where status = 'new';
alter table public.instagram_mentions enable row level security;
revoke all on public.instagram_mentions from anon;
-- Admins read them (the Notifications page); only the Worker writes, after reposting or ignoring.
create policy instagram_mentions_admin on public.instagram_mentions for select to authenticated using ((select public.is_admin()));
revoke insert, update, delete on public.instagram_mentions from authenticated;
