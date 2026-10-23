-- Menu page: the menu as customers see it, and the menus made from it, printed (physical) and on
-- screens (digital), with images made by AI through Higgsfield, uploaded or linked.
-- Menu items are the recipes of Menu costing: one list of what the café sells, seen two ways. The
-- menu adds what customers read (a description, a photo, the 14 allergens, vegan or gluten free),
-- whether it's on the menus for now, and its place in its section. Costs stay in Menu costing.
-- Who: everyone on the team reads the menu (menu_items(): no costs or margins); admins change it and
-- make the designs. The Worker (service role) makes the AI images and keeps them in the café's storage.

-- 1. What customers read about each menu item.
alter table public.recipes
  add column description text check (char_length(description) <= 300),
  add column photo_url text check (photo_url ~* '^https?://\S+$' and char_length(photo_url) <= 2000),
  -- EU Regulation 1169/2011, Annex II.
  add column allergens text[] not null default '{}' check (allergens <@ array['gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk', 'nuts',
    'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs']::text[]),
  add column dietary text[] not null default '{}' check (dietary <@ array['vegetarian', 'vegan', 'gluten_free', 'dairy_free']::text[]),
  -- Picked out on the menus (a house favourite).
  add column featured boolean not null default false,
  -- On the printed and digital menus (off: kept, but not offered for now).
  add column on_menu boolean not null default true,
  -- Its place in its section (then A–Z).
  add column menu_sort int not null default 0;

create or replace function public.recipe_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.category := nullif(btrim(new.category), '');
  new.square_item := nullif(btrim(new.square_item), '');
  new.notes := nullif(btrim(new.notes), '');
  new.description := nullif(btrim(new.description), '');
  new.photo_url := nullif(btrim(new.photo_url), '');
  -- Each allergen and mark once.
  new.allergens := array(select distinct a from unnest(new.allergens) a order by a);
  new.dietary := array(select distinct d from unnest(new.dietary) d order by d);
  -- A new item goes last in its section.
  if tg_op = 'INSERT' and new.menu_sort = 0 then
    new.menu_sort := coalesce((select max(r.menu_sort) from public.recipes r where r.category is not distinct from new.category), 0) + 1;
  end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- The menu as customers see it (no costs): every active item with its variants' names and price
-- changes. menu_list() is for the functions here (a screen's feed); menu_items() is what the team calls.
create or replace function public.menu_list() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'name', r.name, 'category', r.category, 'sell_price', r.sell_price, 'vat_rate', r.vat_rate, 'description', r.description,
    'photo_url', r.photo_url, 'allergens', to_jsonb(r.allergens), 'dietary', to_jsonb(r.dietary), 'featured', r.featured, 'on_menu', r.on_menu,
    'menu_sort', r.menu_sort,
    'variants', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'price_change', v.price_change) order by v.sort)
                            from public.recipe_variants v where v.recipe_id = r.id), '[]'::jsonb)
  ) order by r.menu_sort, r.name), '[]'::jsonb)
  from public.recipes r where r.active;
$$;
revoke execute on function public.menu_list() from public, anon, authenticated;

create or replace function public.menu_items() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when public.is_staff() or public.partner_can('finances') then public.menu_list() else '[]'::jsonb end;
$$;
revoke execute on function public.menu_items() from public, anon;
grant execute on function public.menu_items() to authenticated, service_role;

-- A section's new order (the ids in order). Runs as the person: admins only, by the recipes' rules.
create or replace function public.reorder_menu(p_ids uuid[]) returns void
language sql set search_path = ''
as $$
  update public.recipes r set menu_sort = x.i::int from unnest(p_ids) with ordinality x(id, i) where r.id = x.id and r.menu_sort is distinct from x.i::int;
$$;
revoke execute on function public.reorder_menu(uuid[]) from public, anon;
grant execute on function public.reorder_menu(uuid[]) to authenticated;

-- 2. Designs: a printed menu (A4, A3, A5) or a screen's (16:9, 9:16). Over an image (the app writes
--    the menu itself) or an image that is the whole menu.
create table public.menu_designs (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (char_length(name) between 1 and 120),
  format             text not null check (format in ('physical', 'digital')),
  size               text not null check (size in ('a4_portrait', 'a4_landscape', 'a3_portrait', 'a5_portrait', 'screen_landscape', 'screen_portrait')),
  mode               text not null default 'background' check (mode in ('background', 'full')),
  -- Sections on it; empty: every section.
  categories         text[] not null default '{}' check (cardinality(categories) <= 30),
  title              text check (char_length(title) <= 80),
  subtitle           text check (char_length(subtitle) <= 120),
  footer             text check (char_length(footer) <= 300),
  text_tone          text not null default 'dark' check (text_tone in ('dark', 'light')),
  panel              boolean not null default true,
  show_descriptions  boolean not null default true,
  show_allergens     boolean not null default true,
  -- The image in use (one of its own, once ready).
  image_id           uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users on delete set null default auth.uid(),
  constraint menu_designs_size_fits check ((format = 'digital') = (size like 'screen_%'))
);

-- 3. Images: for a design, or an item's photo made with AI. An AI image starts queued with
--    Higgsfield's request and gets its address once made and kept in the café's storage.
create table public.menu_images (
  id           uuid primary key default gen_random_uuid(),
  design_id    uuid references public.menu_designs on delete cascade,
  item_id      uuid references public.recipes on delete cascade,
  url          text check (url ~* '^https://\S+$' and char_length(url) <= 2000),
  source       text not null check (source in ('ai', 'upload', 'link')),
  model        text check (model in ('ideogram', 'recraft', 'qwen')),
  -- What was asked for (the person's words; for an edit, the change).
  prompt       text check (char_length(prompt) <= 4000),
  edit_of      uuid references public.menu_images on delete set null,
  status       text not null default 'ready' check (status in ('queued', 'working', 'ready', 'failed')),
  error        text check (char_length(error) <= 500),
  -- In the café's own storage (Drive, OneDrive or R2); false: only at Higgsfield, which keeps it 7 days.
  stored       boolean not null default false,
  -- Higgsfield's request, and where to ask how it's going.
  request_id   text check (char_length(request_id) <= 100),
  status_url   text check (status_url ~* '^https://\S+$'),
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users on delete set null default auth.uid(),
  finished_at  timestamptz,
  constraint menu_images_for_one check ((design_id is null) <> (item_id is null)),
  constraint menu_images_ready_has_url check (status <> 'ready' or url is not null),
  constraint menu_images_ai_has_model check ((source = 'ai') = (model is not null))
);
create index menu_images_design_idx on public.menu_images (design_id, created_at desc);
create index menu_images_waiting_idx on public.menu_images (status) where status in ('queued', 'working');
alter table public.menu_designs add constraint menu_designs_image_fk foreign key (image_id) references public.menu_images on delete set null;

create or replace function public.menu_design_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.title := nullif(btrim(new.title), '');
  new.subtitle := nullif(btrim(new.subtitle), '');
  new.footer := nullif(btrim(new.footer), '');
  new.categories := array(select distinct btrim(c) from unnest(new.categories) c where btrim(c) <> '');
  -- A finished AI image switched in by itself (menu_image_rules) isn't someone changing the design:
  -- its time stays, so an image asked for after the last real change still takes over when it's done.
  if tg_op = 'UPDATE' and current_setting('menu.auto', true) = 'on' then
    new.updated_at := old.updated_at;
    new.updated_by := old.updated_by;
    return new;
  end if;
  if new.image_id is not null and (tg_op = 'INSERT' or new.image_id is distinct from old.image_id)
     and not exists (select 1 from public.menu_images i where i.id = new.image_id and i.design_id = new.id and i.status = 'ready') then
    raise exception 'That image isn’t one of this design’s, or isn’t ready yet' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger menu_designs_rules before insert or update on public.menu_designs for each row execute function public.menu_design_rules();
create trigger audit_menu_designs after insert or update or delete on public.menu_designs for each row execute function public.audit_row();

-- An AI image once it's ready (after the row is in, so the design can point at it): the design shows
-- it, unless the design was changed since it was asked for (someone picked another meanwhile); an
-- item's photo goes on the item.
create or replace function public.menu_image_rules() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status <> 'ready' or old.status = 'ready' then return null; end if;
  if new.design_id is not null then
    perform set_config('menu.auto', 'on', true);
    update public.menu_designs d set image_id = new.id
     where d.id = new.design_id and (d.image_id is null or d.image_id = new.edit_of or d.updated_at <= new.created_at);
    perform set_config('menu.auto', '', true);
  else
    update public.recipes set photo_url = new.url where id = new.item_id;
  end if;
  return null;
end $$;
revoke execute on function public.menu_image_rules() from public, anon, authenticated;

create or replace function public.menu_image_rules_before() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.prompt := nullif(btrim(new.prompt), '');
  new.error := left(new.error, 500);
  if new.status in ('ready', 'failed') and new.finished_at is null then new.finished_at := now(); end if;
  return new;
end $$;
create trigger menu_images_rules_before before insert or update on public.menu_images for each row execute function public.menu_image_rules_before();
create trigger menu_images_rules after update on public.menu_images for each row execute function public.menu_image_rules();
create trigger audit_menu_images after insert or delete on public.menu_images for each row execute function public.audit_row();

alter table public.menu_designs enable row level security;
alter table public.menu_images enable row level security;
revoke all on public.menu_designs, public.menu_images from anon;
create policy menu_designs_admin on public.menu_designs for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- Admins see, add (an upload or a link; AI images come from the Worker) and delete images; nobody changes one.
create policy menu_images_admin_read on public.menu_images for select to authenticated using ((select public.is_admin()));
create policy menu_images_admin_add on public.menu_images for insert to authenticated
  with check ((select public.is_admin()) and source in ('upload', 'link') and status = 'ready' and request_id is null);
create policy menu_images_admin_delete on public.menu_images for delete to authenticated using ((select public.is_admin()));
revoke update on public.menu_images from authenticated;

-- 4. Higgsfield (AI images) as a connection: the business's own API key, kept encrypted by the
--    Worker in integration_secrets, checked every night like the others. On every plan.
alter table public.integrations drop constraint integrations_provider_check;
alter table public.integrations add constraint integrations_provider_check check (provider in (
  'google_business', 'whatsapp', 'instagram', 'spotify', 'gmail', 'outlook', 'google_drive', 'onedrive',
  'google_calendar', 'outlook_calendar', 'youtube_music', 'facebook', 'tiktok', 'square', 'stripe',
  'sumup', 'linkedin', 'search_console', 'meta_ads', 'google_ads', 'higgsfield'));
insert into public.integrations (provider) values ('higgsfield') on conflict do nothing;
