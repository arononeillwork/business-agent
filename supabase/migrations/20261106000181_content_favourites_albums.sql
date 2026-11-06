-- Content (Marketing, admins), as Google Photos does: a photo or video starred as a favourite, and albums
-- of the business's own (a name, and the photos and videos in it, each once). Taking one off the page
-- takes it out of its albums; deleting an album leaves its photos and videos on the page.
-- shared/content.ts has the same rules.

-- 1. Favourites: a star on the item; an admin changes it as they change the title and tags.
alter table public.content_items add column favourite boolean not null default false;
grant update (favourite) on public.content_items to authenticated;

-- 2. Albums.
create table public.content_albums (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  created_by  uuid references auth.users on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
select public.add_business_scope('public.content_albums');
create unique index content_albums_name on public.content_albums (business_id, lower(name));
create index content_albums_created_by_idx on public.content_albums (created_by);

-- The name trimmed, and each once (whatever the capitals).
create or replace function public.content_album_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.name := regexp_replace(btrim(new.name), '\s+', ' ', 'g');
  if exists (select 1 from public.content_albums a
              where a.business_id = new.business_id and lower(a.name) = lower(new.name) and a.id <> new.id) then
    raise exception 'There’s an album called % already', new.name using errcode = '23505';
  end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  return new;
end $$;
revoke execute on function public.content_album_rules() from public, anon, authenticated;
create trigger content_albums_rules before insert or update on public.content_albums
  for each row execute function public.content_album_rules();
create trigger audit_content_albums after insert or update or delete on public.content_albums
  for each row execute function public.audit_row();

create table public.content_album_items (
  album_id    uuid not null references public.content_albums (id) on delete cascade,
  item_id     uuid not null references public.content_items (id) on delete cascade,
  added_at    timestamptz not null default now()
);
select public.add_business_scope('public.content_album_items');
create unique index content_album_items_key on public.content_album_items (business_id, album_id, item_id);
create index content_album_items_album_idx on public.content_album_items (album_id);
create index content_album_items_item_idx on public.content_album_items (item_id);

-- An album and what goes in it are the same business's.
create or replace function public.content_album_item_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from public.content_albums a where a.id = new.album_id and a.business_id = new.business_id)
     or not exists (select 1 from public.content_items i where i.id = new.item_id and i.business_id = new.business_id) then
    raise exception 'That album or photo isn’t here any more' using errcode = '22023';
  end if;
  new.added_at := now();
  return new;
end $$;
revoke execute on function public.content_album_item_rules() from public, anon, authenticated;
create trigger content_album_items_rules before insert on public.content_album_items
  for each row execute function public.content_album_item_rules();

alter table public.content_albums enable row level security;
alter table public.content_album_items enable row level security;
revoke all on public.content_albums, public.content_album_items from anon;
-- Admins only, like the rest of Content. An album is renamed; what's in it is added or taken out.
create policy content_albums_admin on public.content_albums for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy content_album_items_admin on public.content_album_items for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke update on public.content_albums, public.content_album_items from authenticated;
grant update (name) on public.content_albums to authenticated;
