-- Content (Marketing, admins): the business's own photos and videos in one place, for posts, offers,
-- the menu and the screens, and Google Photos as a connection to bring them in from.
-- Google Photos is read through Google's Photos Picker API: the admin picks in Google Photos' own
-- picker and the Worker copies what was picked into the café's storage (Business Agent/Content in
-- Google Drive or OneDrive, or R2), since Google's links to it last an hour (worker/content.ts).

-- 1. Google Photos as a connection, next to the other Google ones (one sign-in, kept encrypted by the
--    Worker in integration_secrets, checked every night). It joins no group: it can be connected
--    alongside anything. Like Google Drive, it needs the apps feature of the plan.
alter table public.integrations drop constraint integrations_provider_check;
alter table public.integrations add constraint integrations_provider_check check (provider in (
  'google_business', 'whatsapp', 'instagram', 'spotify', 'gmail', 'outlook', 'google_drive', 'onedrive',
  'google_calendar', 'outlook_calendar', 'youtube_music', 'facebook', 'tiktok', 'square', 'stripe',
  'sumup', 'linkedin', 'search_console', 'meta_ads', 'google_ads', 'higgsfield', 'google_photos'));
-- One row per business (a business made later gets every app the others have: create_business()).
insert into public.integrations (business_id, provider) select id, 'google_photos' from public.business on conflict do nothing;

create or replace function public.plan_feature_of(p_provider text) returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_provider = 'google_business' then 'google_maps'
    when p_provider = 'whatsapp' then 'whatsapp'
    when p_provider in ('square', 'stripe', 'sumup') then 'takings'
    when p_provider in ('spotify', 'youtube_music') then 'music'
    when p_provider in ('gmail', 'outlook', 'google_drive', 'onedrive', 'meta_ads', 'google_ads', 'google_photos') then 'apps'
  end;
$$;

-- 2. The library. Each item is a file in the café's storage at its own /media address.
create table public.content_items (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('photo', 'video')),
  url         text not null check (char_length(url) <= 1000 and url ~* '^https?://\S+$'),
  title       text check (char_length(title) between 1 and 200),
  -- Where it came from: picked in Google Photos (by the Worker), or uploaded from the device.
  source      text not null default 'upload' check (source in ('google_photos', 'upload')),
  -- Google Photos' own id for the item, so picking it again doesn't add it twice.
  source_id   text check (char_length(source_id) <= 500),
  width       int check (width > 0),
  height      int check (height > 0),
  -- When it was taken (Google Photos says), if known.
  taken_at    timestamptz,
  -- Lower case, each once, up to 12 of up to 30 characters (shared/content.ts cleanTags).
  tags        text[] not null default '{}' check (cardinality(tags) <= 12),
  added_by    uuid references auth.users on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check ((source = 'google_photos') = (source_id is not null))
);
select public.add_business_scope('public.content_items');
create unique index content_items_google_photos on public.content_items (business_id, source_id) where source = 'google_photos';
create index content_items_added_by_idx on public.content_items (added_by);

-- Tidy the title and tags (a blank title is none; tags trimmed, lower case and each once).
create or replace function public.content_item_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.title := nullif(btrim(new.title), '');
  new.tags := coalesce((select array_agg(t order by first) from (
    select lower(regexp_replace(btrim(x), '\s+', ' ', 'g')) as t, min(n) as first
      from unnest(new.tags) with ordinality as u(x, n)
     where btrim(x) <> ''
     group by 1) d), '{}');
  if exists (select 1 from unnest(new.tags) t where char_length(t) > 30) then
    raise exception 'Keep each tag to 30 characters' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.added_by := old.added_by;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger content_items_rules before insert or update on public.content_items for each row execute function public.content_item_rules();
create trigger audit_content_items after insert or delete on public.content_items for each row execute function public.audit_row();

alter table public.content_items enable row level security;
revoke all on public.content_items from anon;
-- Admins see them, add what they upload (Google Photos' come from the Worker), change the title and
-- tags, and take them off the page (the file stays in the café's storage).
create policy content_items_admin_read on public.content_items for select to authenticated using ((select public.is_admin()));
create policy content_items_admin_add on public.content_items for insert to authenticated
  with check ((select public.is_admin()) and source = 'upload' and source_id is null);
create policy content_items_admin_change on public.content_items for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy content_items_admin_delete on public.content_items for delete to authenticated using ((select public.is_admin()));
revoke update on public.content_items from authenticated;
grant update (title, tags) on public.content_items to authenticated;
