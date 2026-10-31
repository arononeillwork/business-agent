-- Theme days: the coffees the business serves (each bag: where it's from, its region or farm, roaster,
-- roast, process, tasting notes, what it's brewed as, its price and a photo), named themes for the day
-- (Colombian day 🇨🇴, Irish day 🇮🇪, Brazilian roast day 🇧🇷) that each serve one of the coffees and play a
-- playlist, and when each runs: a weekly rotation (each weekday a theme or none) and one-off dates that
-- override it (17 March: Irish day). The Calendar shows each day's theme, Today shows today's, and the
-- Coffees page (Menu section) lists the coffees.
-- The bag's photo is made small in the browser and kept here as a data: URL, as pets' photos are.
-- Who: the whole team reads it all; admins change it. Partners and the café tablet see none.

-- ---------------------------------------------------------------------------
-- Coffees
-- ---------------------------------------------------------------------------
create table public.coffees (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 80),
  -- Where it's from (ISO 3166 code: CO, BR, IE…); null for a blend from several.
  country        text check (country ~ '^[A-Z]{2}$'),
  region         text check (char_length(region) <= 120),
  roaster        text check (char_length(roaster) <= 80),
  roast          text check (roast in ('light', 'medium', 'dark')),
  process        text check (process in ('washed', 'natural', 'honey', 'anaerobic', 'other')),
  tasting_notes  text check (char_length(tasting_notes) <= 300),
  brew           text not null default 'both' check (brew in ('espresso', 'filter', 'both')),
  -- The bag it comes in: its size and what it costs (both optional; a kilo's price follows from them).
  bag_grams      int check (bag_grams between 1 and 100000),
  bag_price      numeric(10, 2) check (bag_price >= 0),
  active         boolean not null default true,
  photo          text check (photo is null or (photo ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' and length(photo) <= 1000000)),
  sort           int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users on delete set null default auth.uid()
);
select public.add_business_scope('public.coffees');
create unique index coffees_name_key on public.coffees (business_id, lower(name));

create or replace function public.coffee_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.region := nullif(btrim(new.region), '');
  new.roaster := nullif(btrim(new.roaster), '');
  new.tasting_notes := nullif(btrim(new.tasting_notes), '');
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
create trigger coffees_rules before insert or update on public.coffees for each row execute function public.coffee_rules();
-- No row audit: each photo would be copied into the audit log with it.

alter table public.coffees enable row level security;
revoke all on public.coffees from anon;
create policy coffees_read on public.coffees for select to authenticated using ((select public.is_staff()));
create policy coffees_admin on public.coffees for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Themes
-- ---------------------------------------------------------------------------
create table public.day_themes (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 60),
  -- A flag or emoji: 🇨🇴.
  emoji        text check (char_length(emoji) <= 16),
  -- Its colour on the calendar.
  colour       text not null default '#F79BA4' check (colour ~ '^#[0-9A-Fa-f]{6}$'),
  description  text check (char_length(description) <= 300),
  coffee_id    uuid references public.coffees on delete set null,
  -- The playlist it plays, as the café music player keeps one: {id, name, url, image?, tracks?, provider?}.
  playlist     jsonb check (playlist is null or (jsonb_typeof(playlist) = 'object'
                 and jsonb_typeof(playlist -> 'id') = 'string' and jsonb_typeof(playlist -> 'name') = 'string'
                 and (playlist ->> 'url') ~ '^https://' and coalesce(playlist ->> 'image', 'https://') ~ '^https://'
                 and char_length(playlist::text) <= 2000)),
  -- Anything else for the day: a food special, the decorations.
  notes        text check (char_length(notes) <= 500),
  sort         int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users on delete set null default auth.uid()
);
select public.add_business_scope('public.day_themes');
create unique index day_themes_name_key on public.day_themes (business_id, lower(name));

-- Tidy what's typed; the coffee is one of the business's own. With the caller's rights, filtered by the
-- row's business for the Worker.
create or replace function public.day_theme_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.emoji := nullif(btrim(new.emoji), '');
  new.description := nullif(btrim(new.description), '');
  new.notes := nullif(btrim(new.notes), '');
  if new.coffee_id is not null and not exists (select 1 from public.coffees c where c.id = new.coffee_id and c.business_id = new.business_id) then
    raise exception 'That coffee isn''t on the Coffees page' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
create trigger day_themes_rules before insert or update on public.day_themes for each row execute function public.day_theme_rules();
create trigger audit_day_themes after insert or update or delete on public.day_themes for each row execute function public.audit_row();

alter table public.day_themes enable row level security;
revoke all on public.day_themes from anon;
create policy day_themes_read on public.day_themes for select to authenticated using ((select public.is_staff()));
create policy day_themes_admin on public.day_themes for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- When each runs: the weekly rotation, and dates set apart from it
-- ---------------------------------------------------------------------------
-- One row per weekday that has a theme (1 Monday … 7 Sunday); a weekday without one has none.
-- The opening hours still count: a weekday the business is closed shows no theme (shared/themeDays.ts).
create table public.day_theme_schedule (
  weekday     smallint not null check (weekday between 1 and 7),
  theme_id    uuid not null references public.day_themes on delete cascade,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users on delete set null default auth.uid()
);
select public.add_business_scope('public.day_theme_schedule');
alter table public.day_theme_schedule add primary key (business_id, weekday);
create index day_theme_schedule_theme_idx on public.day_theme_schedule (theme_id);

-- One row per date set apart: another theme that day, or none (theme_id null). Removing the row puts
-- the date back on the rotation; removing the theme does too.
create table public.day_theme_dates (
  day         date not null,
  theme_id    uuid references public.day_themes on delete cascade,
  note        text check (char_length(note) <= 200),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users on delete set null default auth.uid()
);
select public.add_business_scope('public.day_theme_dates');
alter table public.day_theme_dates add primary key (business_id, day);
create index day_theme_dates_theme_idx on public.day_theme_dates (theme_id);

-- The theme is one of the business's own.
create or replace function public.day_theme_when_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.theme_id is not null and not exists (select 1 from public.day_themes t where t.id = new.theme_id and t.business_id = new.business_id) then
    raise exception 'That theme isn''t one of yours' using errcode = '22023';
  end if;
  if tg_table_name = 'day_theme_dates' then new.note := nullif(btrim(new.note), ''); end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
create trigger day_theme_schedule_rules before insert or update on public.day_theme_schedule
  for each row execute function public.day_theme_when_rules();
create trigger day_theme_dates_rules before insert or update on public.day_theme_dates
  for each row execute function public.day_theme_when_rules();

alter table public.day_theme_schedule enable row level security;
alter table public.day_theme_dates enable row level security;
revoke all on public.day_theme_schedule, public.day_theme_dates from anon;
create policy day_theme_schedule_read on public.day_theme_schedule for select to authenticated using ((select public.is_staff()));
create policy day_theme_schedule_admin on public.day_theme_schedule for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy day_theme_dates_read on public.day_theme_dates for select to authenticated using ((select public.is_staff()));
create policy day_theme_dates_admin on public.day_theme_dates for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Easy Beans (business 1): starters the owner changes on the Coffees page and the Calendar's Themes tab
-- ---------------------------------------------------------------------------
-- The house coffee is one Brazilian bean in two roasts; the guest coffees are a Colombian and an Irish
-- blend, without photos yet. Three themes in the owner's order, Irish, then Colombian, then Brazilian
-- roast, from Monday: Mon Irish, Tue Colombian, Wed Brazilian roast, Thu Irish, Fri Colombian, Sat
-- Brazilian roast, and nothing on Sunday. St Patrick's Day is an Irish day whatever weekday it is. The
-- Colombian day plays the café's Colombian playlist when one is known (the one playing now, or the
-- approved one). Nothing is added twice, and without business 1 nothing at all.
do $$
declare
  v_playlist jsonb;
  v_colombian uuid; v_irish uuid; v_brazilian uuid;
begin
  if not exists (select 1 from public.business where id = 1) then return; end if;

  insert into public.coffees (business_id, name, country, roast, brew, sort)
  select 1, c.name, c.country, c.roast, c.brew, c.sort
    from (values ('Brazilian dark roast', 'BR', 'dark', 'espresso', 1),
                 ('Brazilian light roast', 'BR', 'light', 'both', 2),
                 ('Colombian (guest)', 'CO', 'medium', 'both', 3),
                 ('Irish blend (guest)', 'IE', 'medium', 'both', 4)) c(name, country, roast, brew, sort)
   where not exists (select 1 from public.coffees x where x.business_id = 1 and lower(x.name) = lower(c.name));

  select p into v_playlist
    from (select m.playlist as p, 1 as o from public.music_player m where m.business_id = 1
          union all
          select i.external -> 'playlist', 2 from public.integrations i where i.business_id = 1 and i.status = 'connected') x
   where jsonb_typeof(p) = 'object' and jsonb_typeof(p -> 'id') = 'string' and (p ->> 'name') ~* 'colomb'
     and (p ->> 'url') ~ '^https://'
   order by o limit 1;

  insert into public.day_themes (business_id, name, emoji, colour, description, coffee_id, playlist, sort)
  select 1, t.name, t.emoji, t.colour, t.description,
         (select c.id from public.coffees c where c.business_id = 1 and c.name = t.coffee),
         case when t.name = 'Colombian day' then v_playlist end, t.sort
    from (values ('Irish day', '🇮🇪', '#169B62', 'The Irish guest blend, with Irish music to match.', 'Irish blend (guest)', 1),
                 ('Colombian day', '🇨🇴', '#FCD116', 'The Colombian guest coffee, with a Colombian playlist.', 'Colombian (guest)', 2),
                 ('Brazilian roast day', '🇧🇷', '#6B4226', 'Our own Brazilian bean: the dark roast for milk drinks, the light one black.', 'Brazilian dark roast', 3))
         t(name, emoji, colour, description, coffee, sort)
   where not exists (select 1 from public.day_themes x where x.business_id = 1 and lower(x.name) = lower(t.name));

  select id into v_irish from public.day_themes where business_id = 1 and name = 'Irish day';
  select id into v_colombian from public.day_themes where business_id = 1 and name = 'Colombian day';
  select id into v_brazilian from public.day_themes where business_id = 1 and name = 'Brazilian roast day';

  insert into public.day_theme_schedule (business_id, weekday, theme_id)
  select 1, w.weekday, w.theme_id
    from (values (1, v_irish), (2, v_colombian), (3, v_brazilian), (4, v_irish), (5, v_colombian), (6, v_brazilian)) w(weekday, theme_id)
   where w.theme_id is not null
  on conflict (business_id, weekday) do nothing;

  if v_irish is not null then
    insert into public.day_theme_dates (business_id, day, theme_id, note)
    values (1, '2027-03-17', v_irish, 'St Patrick''s Day')
    on conflict (business_id, day) do nothing;
  end if;
end $$;
