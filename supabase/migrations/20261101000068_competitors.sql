-- Competitors (Marketing): the cafés around the business, followed over time. What each charges for
-- the same basket of drinks and food (every price kept with the day it was seen, so prices can be
-- followed), what it offers (typed in, or read from Google), its hours, its Google rating and review
-- count week by week, and notes from visits with ideas worth borrowing. The business is a row too
-- (is_self) so it's compared on the same terms; its prices come from Menu costing where a basket item
-- is linked to a menu item (competitor_items.recipe_id).
-- Google (Places API, the key the Reviews page uses) is read by the Worker: each followed place once
-- a week, and the area around the business once a week after an admin has first looked
-- (competitor_radar); admins hear in the bell about new places nearby and ones that closed.
-- Who: admins.

create table public.competitors (
  id                 uuid primary key default gen_random_uuid(),
  -- The business itself: one row, kept, with the business's name.
  is_self            boolean not null default false,
  name               text not null check (char_length(name) between 1 and 120),
  kind               text not null default 'cafe'
                     check (kind in ('specialty', 'cafe', 'cafe_bar', 'bakery', 'brunch', 'juice', 'chain', 'other')),
  -- How much it competes for the same customers; none for the business itself.
  threat             text check (threat in ('high', 'medium', 'low')),
  address            text check (char_length(address) <= 200),
  -- From the business, in metres.
  distance_m         int check (distance_m between 0 and 1000000),
  lat                double precision check (lat between -90 and 90),
  lng                double precision check (lng between -180 and 180),
  -- Google's place id: kept up to date from Google every week.
  place_id           text unique check (char_length(place_id) between 1 and 300),
  website            text check (website ~* '^https?://\S+$'),
  -- The handle, without @.
  instagram          text check (instagram ~ '^[A-Za-z0-9._]{1,60}$'),
  maps_url           text check (maps_url ~* '^https?://\S+$'),
  -- 0 (free) to 4 (very expensive), Google's scale.
  price_level        smallint check (price_level between 0 and 4),
  -- {"mon": {"open": "08:00", "close": "18:00"}, "sun": null, …}: typed in; null: Google's (google_hours).
  hours              jsonb check (hours is null or jsonb_typeof(hours) = 'object'),
  google_hours       jsonb check (google_hours is null or jsonb_typeof(google_hours) = 'object'),
  -- {"terrace": true, "matcha": false}: what an admin set, which wins over what Google says.
  features           jsonb not null default '{}'::jsonb check (jsonb_typeof(features) = 'object'),
  google_features    jsonb not null default '{}'::jsonb check (jsonb_typeof(google_features) = 'object'),
  google_rating      numeric(2, 1) check (google_rating between 1 and 5),
  google_count       int check (google_count >= 0),
  google_status      text check (google_status in ('open', 'closed_temporarily', 'closed_permanently')),
  google_checked_at  timestamptz,
  strengths          text check (char_length(strengths) <= 2000),
  weaknesses         text check (char_length(weaknesses) <= 2000),
  notes              text check (char_length(notes) <= 4000),
  -- False: no longer followed (it closed, or isn't a competitor after all); its history stays.
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users on delete set null default auth.uid()
);
create unique index competitors_one_self on public.competitors (is_self) where is_self;

create or replace function public.competitor_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.is_self is distinct from old.is_self then
    raise exception 'The business’s own row stays the business’s';
  end if;
  new.name := btrim(new.name);
  new.address := nullif(btrim(new.address), '');
  new.website := nullif(btrim(new.website), '');
  new.maps_url := nullif(btrim(new.maps_url), '');
  -- @handle, or the profile's address: the handle.
  new.instagram := nullif(regexp_replace(regexp_replace(btrim(coalesce(new.instagram, '')), '^(https?://)?(www\.)?instagram\.com/', '', 'i'), '[@/]|\?.*$', '', 'g'), '');
  new.strengths := nullif(btrim(new.strengths), '');
  new.weaknesses := nullif(btrim(new.weaknesses), '');
  new.notes := nullif(btrim(new.notes), '');
  if new.is_self then new.threat := null; new.active := true; end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger competitors_rules before insert or update on public.competitors for each row execute function public.competitor_rules();

create or replace function public.competitor_keep_self() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.is_self then raise exception 'The business itself can’t be removed from Competitors'; end if;
  return old;
end $$;
create trigger competitors_keep_self before delete on public.competitors for each row execute function public.competitor_keep_self();
create trigger audit_competitors after insert or update or delete on public.competitors for each row execute function public.audit_row();

-- The business's own row carries the business's name.
create or replace function public.competitor_self_name() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.competitors set name = left(new.name, 120) where is_self and name is distinct from left(new.name, 120);
  return new;
end $$;
revoke execute on function public.competitor_self_name() from public, anon, authenticated;
create trigger business_competitor_name after insert or update of name on public.business for each row execute function public.competitor_self_name();
insert into public.competitors (is_self, name) values (true, coalesce(left((select name from public.business where id = 1), 120), 'Your business'));

-- The basket: what's compared everywhere (a flat white, a croissant), each linked to the business's
-- own menu item for its price.
create table public.competitor_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  recipe_id   uuid references public.recipes on delete set null,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create unique index competitor_items_name on public.competitor_items (lower(name));

create or replace function public.competitor_item_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  return new;
end $$;
create trigger competitor_items_rules before insert or update on public.competitor_items for each row execute function public.competitor_item_rules();
create trigger audit_competitor_items after insert or update or delete on public.competitor_items for each row execute function public.audit_row();

-- Prices as seen, each kept: the latest is the price, the ones before show how it moved.
create table public.competitor_prices (
  id             uuid primary key default gen_random_uuid(),
  competitor_id  uuid not null references public.competitors on delete cascade,
  item_id        uuid not null references public.competitor_items on delete cascade,
  price          numeric(8, 2) not null check (price >= 0 and price < 1000),
  observed_on    date not null default current_date check (observed_on >= '2000-01-01'),
  source         text not null default 'visit' check (source in ('visit', 'menu', 'website', 'delivery', 'social', 'other')),
  note           text check (char_length(note) <= 300),
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users on delete set null default auth.uid()
);
create index competitor_prices_idx on public.competitor_prices (competitor_id, item_id, observed_on desc);

create or replace function public.competitor_price_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.observed_on > current_date + 1 then raise exception 'A price can’t be seen in the future'; end if;
  new.note := nullif(btrim(new.note), '');
  if tg_op = 'UPDATE' then new.created_at := old.created_at; new.created_by := old.created_by; end if;
  return new;
end $$;
create trigger competitor_prices_rules before insert or update on public.competitor_prices for each row execute function public.competitor_price_rules();
create trigger audit_competitor_prices after insert or update or delete on public.competitor_prices for each row execute function public.audit_row();

-- Seen or heard (a new menu, a 2x1, queues on Saturday), or an idea worth borrowing and where it got to.
create table public.competitor_notes (
  id             uuid primary key default gen_random_uuid(),
  -- Null: about the area as a whole (a trend).
  competitor_id  uuid references public.competitors on delete cascade,
  kind           text not null default 'visit'
                 check (kind in ('visit', 'menu', 'price', 'promotion', 'event', 'social', 'opening', 'idea', 'other')),
  text           text not null check (char_length(text) between 1 and 2000),
  observed_on    date not null default current_date check (observed_on >= '2000-01-01'),
  -- Ideas only: to try, trying it, adopted, not for us.
  status         text check (status in ('new', 'trying', 'adopted', 'dropped')),
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users on delete set null default auth.uid(),
  constraint competitor_notes_idea check ((kind = 'idea') = (status is not null))
);
create index competitor_notes_idx on public.competitor_notes (observed_on desc);

create or replace function public.competitor_note_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.text := btrim(new.text);
  new.status := case when new.kind = 'idea' then coalesce(new.status, 'new') end;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; new.created_by := old.created_by; end if;
  return new;
end $$;
create trigger competitor_notes_rules before insert or update on public.competitor_notes for each row execute function public.competitor_note_rules();
create trigger audit_competitor_notes after insert or update or delete on public.competitor_notes for each row execute function public.audit_row();

-- Google's rating and review count, one a week per place (the Worker), for the trend.
create table public.competitor_snapshots (
  competitor_id  uuid not null references public.competitors on delete cascade,
  taken_on       date not null default current_date,
  rating         numeric(2, 1) check (rating between 1 and 5),
  review_count   int check (review_count >= 0),
  primary key (competitor_id, taken_on)
);

-- What Google lists around the business (the Worker's weekly look, or an admin's): places not yet
-- followed show on the page to follow or put aside; one first seen after the first look is new.
create table public.competitor_radar (
  place_id      text primary key check (char_length(place_id) between 1 and 300),
  name          text not null check (char_length(name) between 1 and 200),
  address       text,
  distance_m    int,
  rating        numeric(2, 1),
  review_count  int,
  price_level   smallint,
  primary_type  text,
  maps_url      text,
  lat           double precision,
  lng           double precision,
  first_seen    timestamptz not null default now(),
  last_seen     timestamptz not null default now(),
  -- Put aside by an admin: not a competitor (a pharmacy's café corner, a hotel bar).
  dismissed     boolean not null default false
);

create table public.competitor_settings (
  id           int primary key default 1 check (id = 1),
  -- How far around the business Google is asked to look.
  radius_m     int not null default 1000 check (radius_m between 100 and 20000),
  -- Look again every week, and tell admins about new places.
  scan_weekly  boolean not null default true,
  -- The last look (the Worker's); none yet: the weekly look waits for an admin's first.
  scanned_at   timestamptz
);
insert into public.competitor_settings default values;

alter table public.competitors enable row level security;
alter table public.competitor_items enable row level security;
alter table public.competitor_prices enable row level security;
alter table public.competitor_notes enable row level security;
alter table public.competitor_snapshots enable row level security;
alter table public.competitor_radar enable row level security;
alter table public.competitor_settings enable row level security;
revoke all on public.competitors, public.competitor_items, public.competitor_prices, public.competitor_notes,
  public.competitor_snapshots, public.competitor_radar, public.competitor_settings from anon;

create policy competitors_admin on public.competitors for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy competitor_items_admin on public.competitor_items for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy competitor_prices_admin on public.competitor_prices for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy competitor_notes_admin on public.competitor_notes for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- Google's side is the Worker's to write; admins read it, put places aside and set how far to look.
create policy competitor_snapshots_admin on public.competitor_snapshots for select to authenticated using ((select public.is_admin()));
revoke insert, update, delete on public.competitor_snapshots from authenticated;
create policy competitor_radar_read on public.competitor_radar for select to authenticated using ((select public.is_admin()));
create policy competitor_radar_dismiss on public.competitor_radar for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke insert, update, delete on public.competitor_radar from authenticated;
grant update (dismissed) on public.competitor_radar to authenticated;
create policy competitor_settings_read on public.competitor_settings for select to authenticated using ((select public.is_admin()));
create policy competitor_settings_change on public.competitor_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke insert, update, delete on public.competitor_settings from authenticated;
grant update (radius_m, scan_weekly) on public.competitor_settings to authenticated;
