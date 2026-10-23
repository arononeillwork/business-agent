-- Screens: TVs and tablets in the café that play a slideshow: pictures, videos, YouTube, Vimeo or
-- Instagram, web pages, and the digital menus from the Menu page, with how long each shows, how one
-- changes to the next, and music. Each screen has a secret link opened once in its browser (no
-- sign-in); the Worker answers it with display_feed(), which the screen asks for every minute, so
-- changes made here show without touching the screen.
-- Who: admins. The link itself only shows what's on that screen.

create table public.screens (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 80),
  -- The secret in the screen's link (/display/<token>): 122 random bits.
  token          text not null unique default replace(gen_random_uuid()::text, '-', '') check (token ~ '^[0-9a-f]{32}$'),
  orientation    text not null default 'landscape' check (orientation in ('landscape', 'portrait')),
  -- How long each slide shows unless it says otherwise, and how the change to the next one looks.
  seconds        int not null default 10 check (seconds between 3 and 3600),
  transition     text not null default 'fade' check (transition in ('fade', 'slide', 'zoom', 'none')),
  transition_ms  int not null default 800 check (transition_ms between 0 and 5000),
  shuffle        boolean not null default false,
  fit            text not null default 'cover' check (fit in ('cover', 'contain')),
  -- Music: an MP3 or radio stream, or YouTube; videos can play their own sound instead.
  music_url      text check (music_url ~* '^https://\S+$' and char_length(music_url) <= 2000),
  music_volume   int not null default 40 check (music_volume between 0 and 100),
  video_sound    boolean not null default false,
  show_clock     boolean not null default false,
  -- A line running along the bottom.
  ticker         text check (char_length(ticker) <= 280),
  -- [{ id, kind, url, design_id, title, seconds, live, active }], in order (checked below).
  slides         jsonb not null default '[]'::jsonb check (jsonb_typeof(slides) = 'array' and jsonb_array_length(slides) <= 100),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users on delete set null default auth.uid()
);

-- When each screen last asked for its slides: on its own (not audited, not the screen's change).
create table public.screen_status (
  screen_id     uuid primary key references public.screens on delete cascade,
  last_seen_at  timestamptz not null default now()
);

create or replace function public.screen_rules() returns trigger
language plpgsql set search_path = ''
as $$
declare s jsonb; v_kind text;
begin
  new.name := btrim(new.name);
  new.ticker := nullif(btrim(new.ticker), '');
  new.music_url := nullif(btrim(new.music_url), '');
  for s in select * from jsonb_array_elements(new.slides) loop
    v_kind := s->>'kind';
    if jsonb_typeof(s) <> 'object' or v_kind is null
       or v_kind not in ('image', 'video', 'youtube', 'vimeo', 'instagram', 'web', 'menu') then
      raise exception 'A slide isn’t one the screen can show' using errcode = '22023';
    end if;
    if v_kind = 'menu' then
      if not exists (select 1 from public.menu_designs d where d.id::text = s->>'design_id' and d.format = 'digital') then
        raise exception 'Pick one of the digital menus for a menu slide' using errcode = '22023';
      end if;
    elsif coalesce(s->>'url', '') !~* '^https://[^\s/]+\.\S+$' or char_length(s->>'url') > 2000 then
      raise exception 'Each slide’s address should start with https://' using errcode = '22023';
    end if;
    if s ? 'seconds' and jsonb_typeof(s->'seconds') = 'number' and not ((s->>'seconds')::numeric between 3 and 3600) then
      raise exception 'Show each slide for between 3 seconds and an hour' using errcode = '22023';
    end if;
    if char_length(coalesce(s->>'title', '')) > 120 then raise exception 'Keep slide names short' using errcode = '22023'; end if;
  end loop;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger screens_rules before insert or update on public.screens for each row execute function public.screen_rules();
create trigger audit_screens after insert or update or delete on public.screens for each row execute function public.audit_row();

-- A digital menu that's on a screen can't be deleted without taking it off first.
create or replace function public.menu_design_on_screen() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_screen text;
begin
  select name into v_screen from public.screens
   where exists (select 1 from jsonb_array_elements(slides) s where s->>'design_id' = old.id::text) limit 1;
  if v_screen is not null then
    raise exception '% is on the screen “%”. Take it off that screen first.', old.name, v_screen using errcode = '23503';
  end if;
  return old;
end $$;
create trigger menu_designs_on_screen before delete on public.menu_designs for each row execute function public.menu_design_on_screen();
revoke execute on function public.menu_design_on_screen() from public, anon, authenticated;

alter table public.screens enable row level security;
alter table public.screen_status enable row level security;
revoke all on public.screens, public.screen_status from anon;
create policy screens_admin on public.screens for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy screen_status_admin_read on public.screen_status for select to authenticated using ((select public.is_admin()));
revoke insert, update, delete on public.screen_status from authenticated;

-- A new link for a screen (the old one stops working): when a link was shared by mistake.
create or replace function public.new_screen_link(p_id uuid) returns text
language plpgsql set search_path = ''
as $$
declare v_token text;
begin
  update public.screens set token = replace(gen_random_uuid()::text, '-', '') where id = p_id returning token into v_token;
  if v_token is null then raise exception 'No such screen' using errcode = 'P0002'; end if;
  return v_token;
end $$;
revoke execute on function public.new_screen_link(uuid) from public, anon;
grant execute on function public.new_screen_link(uuid) to authenticated;

-- What a screen's link loads (the Worker, for anyone with the link): the screen's settings and
-- slides (not its link), the business's name, logo, fonts and colours, and each digital menu on it with the menu's
-- items. Notes when the screen was last seen (at most once a minute). Null: no such link.
create or replace function public.display_feed(p_token text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v public.screens;
begin
  select * into v from public.screens where token = p_token;
  if not found then return null; end if;
  insert into public.screen_status (screen_id, last_seen_at) values (v.id, now())
    on conflict (screen_id) do update set last_seen_at = now() where public.screen_status.last_seen_at < now() - interval '50 seconds';
  return jsonb_build_object(
    'screen', to_jsonb(v) - 'token' - 'created_at' - 'updated_by',
    'business', jsonb_build_object('name', (select name from public.business where id = 1))
                || coalesce((select jsonb_build_object('logo', coalesce(b.logo_mark, b.logo), 'heading_font', b.heading_font, 'body_font', b.body_font, 'colours', b.colours)
                               from public.brand b where b.id = 1), '{"logo": null}'::jsonb),
    'sections', (select to_jsonb(menu_sections) from public.settings where id = 1),
    'menus', coalesce((
      select jsonb_object_agg(d.id, jsonb_build_object(
               'design', to_jsonb(d) - 'updated_by' - 'created_at'
                         || jsonb_build_object('image_url', (select i.url from public.menu_images i where i.id = d.image_id and i.status = 'ready')),
               'items', public.menu_list()))
        from public.menu_designs d
       where d.format = 'digital' and v.active
         and exists (select 1 from jsonb_array_elements(v.slides) s where s->>'design_id' = d.id::text)), '{}'::jsonb));
end $$;
revoke execute on function public.display_feed(text) from public, anon, authenticated;
grant execute on function public.display_feed(text) to service_role;
