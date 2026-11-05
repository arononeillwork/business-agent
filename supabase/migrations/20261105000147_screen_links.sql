-- Short links for screens, picture slideshows, and the live offers' pictures as a slide.
--
-- Short links: each screen gets a link name (slug), unique within its business, so the TV opens an
-- address a person can read and type: …/display-menu/cafe-tv (the address Easy Beans' TV had before
-- there were screens was easybeanscoffee.com/display-menu). Easy Beans, business 1, needs no number
-- in it, and its first screen also opens at the bare …/display-menu; another business's links carry
-- its number (…/display-menu/2/bar-tv). Made from the screen's name when it has none; a person can
-- change it. The secret link (/display/<token>) keeps working as before.
--
-- Picture slideshows: a screen of kind 'slideshow' is the same thing kept simple on the Screens page
-- (pictures, and the live offers' pictures) with its own link, …/slideshow/<name>.
--
-- The live offers' pictures: a slide of kind 'offers' has no address of its own; on the screen it
-- becomes the picture of each offer that's on now (Offers & specials), each for the slide's time,
-- coming and going with the offers. Offers already put on the screen show as before, not twice.

alter table public.screens
  add column slug text check (slug ~ '^[a-z]([a-z0-9-]{0,38}[a-z0-9])?$'),
  add column kind text not null default 'screen' check (kind in ('screen', 'slideshow'));

-- A free link name in the business, from a screen's name: "Café TV" → cafe-tv, then cafe-tv-2 when
-- that's taken. Starts with a letter (a number in the link is a business's).
create or replace function public.screen_link_name(p_name text, p_business int, p_id uuid) returns text
language plpgsql stable set search_path = ''
as $$
declare v_base text; v_name text; n int := 1;
begin
  v_base := lower(translate(coalesce(p_name, ''), 'ÁÀÂÄÃÅáàâäãåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÖÕóòôöõÚÙÛÜúùûüÑñÇç',
                                                  'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCc'));
  v_base := btrim(regexp_replace(v_base, '[^a-z0-9]+', '-', 'g'), '-');
  if v_base !~ '^[a-z]' then v_base := btrim('screen-' || v_base, '-'); end if;
  v_base := btrim(left(v_base, 34), '-');
  v_name := v_base;
  while exists (select 1 from public.screens s where s.business_id = p_business and s.slug = v_name and s.id is distinct from p_id) loop
    n := n + 1;
    v_name := v_base || '-' || n;
  end loop;
  return v_name;
end $$;
revoke execute on function public.screen_link_name(text, int, uuid) from public, anon;
grant execute on function public.screen_link_name(text, int, uuid) to authenticated, service_role;

-- The screens there are, oldest first in each business, so the first keeps the plain name.
do $$
declare r record;
begin
  for r in select id, business_id, name from public.screens order by business_id, created_at, id loop
    perform set_config('app.business_id', r.business_id::text, true);
    update public.screens set slug = public.screen_link_name(r.name, r.business_id, r.id) where id = r.id;
  end loop;
  perform set_config('app.business_id', '', true);
end $$;

-- The screen's rules, as the screen_languages migration made them, with the link name (made when
-- there's none, tidied and checked when typed) and the live offers' pictures as a kind of slide.
create or replace function public.screen_rules() returns trigger
language plpgsql set search_path = ''
as $$
declare s jsonb; v_kind text; v_ref text;
begin
  new.name := btrim(new.name);
  new.ticker := nullif(btrim(new.ticker), '');
  new.music_url := nullif(btrim(new.music_url), '');
  new.slug := nullif(lower(btrim(new.slug)), '');
  if new.slug is null then
    new.slug := public.screen_link_name(new.name, new.business_id, new.id);
  elsif new.slug !~ '^[a-z]([a-z0-9-]{0,38}[a-z0-9])?$' then
    raise exception 'A link name is up to 40 small letters, numbers and dashes, starting with a letter' using errcode = '22023';
  elsif exists (select 1 from public.screens x where x.business_id = new.business_id and x.slug = new.slug and x.id <> new.id) then
    raise exception 'Another screen already has the link name “%”', new.slug using errcode = '23505';
  end if;
  for s in select * from jsonb_array_elements(new.slides) loop
    v_kind := s->>'kind';
    if jsonb_typeof(s) <> 'object' or v_kind is null
       or v_kind not in ('image', 'video', 'youtube', 'vimeo', 'instagram', 'web', 'menu', 'offers') then
      raise exception 'A slide isn’t one the screen can show' using errcode = '22023';
    end if;
    if v_kind = 'menu' then
      if s->>'design_id' is null and s->>'design_id_es' is null then
        raise exception 'Pick one of the digital menus for a menu slide' using errcode = '22023';
      end if;
      for v_ref in select x from unnest(array[s->>'design_id', s->>'design_id_es']) x where x is not null loop
        if not exists (select 1 from public.menu_designs d where d.id::text = v_ref and d.format = 'digital') then
          raise exception 'Pick one of the digital menus for a menu slide' using errcode = '22023';
        end if;
      end loop;
    elsif v_kind <> 'offers' then
      if s->>'url' is null and s->>'url_es' is null then
        raise exception 'Each slide’s address should start with https://' using errcode = '22023';
      end if;
      for v_ref in select x from unnest(array[s->>'url', s->>'url_es']) x where x is not null loop
        if v_ref !~* '^https://[^\s/]+\.\S+$' or char_length(v_ref) > 2000 then
          raise exception 'Each slide’s address should start with https://' using errcode = '22023';
        end if;
      end loop;
    end if;
    if (s ? 'show_en' and jsonb_typeof(s->'show_en') <> 'boolean') or (s ? 'show_es' and jsonb_typeof(s->'show_es') <> 'boolean') then
      raise exception 'Say whether each version of a slide shows (true or false)' using errcode = '22023';
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

alter table public.screens alter column slug set not null;
create unique index screens_business_slug_key on public.screens (business_id, slug);

-- What a screen's link loads, as the screen_languages migration made it, with the live offers'
-- pictures when it has that slide: every offer with a picture that hasn't ended and starts within two
-- days (the screen puts each on and takes it off at its times), but not those already on the screen.
create or replace function public.display_feed(p_token text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare v public.screens;
begin
  select * into v from public.screens where token = p_token;
  if not found then return null; end if;
  insert into public.screen_status (screen_id, last_seen_at) values (v.id, now())
    on conflict (screen_id) do update set last_seen_at = now() where public.screen_status.last_seen_at < now() - interval '50 seconds';
  return jsonb_build_object(
    'screen', to_jsonb(v) - 'token' - 'created_at' - 'updated_by' - 'business_id',
    'business', jsonb_build_object('name', (select name from public.business where id = public.current_business_id()))
                || coalesce((select jsonb_build_object('logo', coalesce(b.logo_mark, b.logo), 'heading_font', b.heading_font, 'body_font', b.body_font, 'colours', b.colours)
                               from public.brand b where b.id = 1), '{"logo": null}'::jsonb),
    'sections', (select to_jsonb(menu_sections) from public.settings where id = 1),
    'menus', coalesce((
      select jsonb_object_agg(d.id, jsonb_build_object(
               'design', to_jsonb(d) - 'updated_by' - 'created_at' - 'business_id'
                         || jsonb_build_object('image_url', (select i.url from public.menu_images i where i.id = d.image_id and i.status = 'ready')),
               'items', public.menu_list()))
        from public.menu_designs d
       where d.format = 'digital' and v.active
         and exists (select 1 from jsonb_array_elements(v.slides) s
                      where s->>'design_id' = d.id::text or s->>'design_id_es' = d.id::text)), '{}'::jsonb),
    'allergens', case when v.active then public.display_menu_allergens() end,
    'offers', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'details', o.details, 'price', o.price, 'was_price', o.was_price,
                                          'image_url', o.image_url, 'starts_at', o.starts_at, 'ends_at', o.ends_at,
                                          'screen_mode', o.screen_mode, 'seconds', o.seconds) order by o.starts_at, o.id)
        from public.offers o
       where v.active and o.active and v.id = any(o.screen_ids)
         and o.ends_at > now() and o.starts_at < now() + interval '2 days'), '[]'::jsonb),
    'offer_pictures', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'image_url', o.image_url, 'starts_at', o.starts_at, 'ends_at', o.ends_at)
                       order by o.starts_at, o.id)
        from public.offers o
       where v.active and o.active and o.image_url is not null and not (v.id = any(o.screen_ids))
         and o.ends_at > now() and o.starts_at < now() + interval '2 days'
         and exists (select 1 from jsonb_array_elements(v.slides) s where s->>'kind' = 'offers' and coalesce((s->>'active')::boolean, true))), '[]'::jsonb));
end $$;
alter function public.display_feed(text) owner to app_definer;
