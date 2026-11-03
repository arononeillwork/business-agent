-- Screens in English and Spanish: a slide can have a Spanish version beside its English one, the
-- same kind of slide at another address (the poster in Spanish, the page in Spanish) or another
-- digital menu, and says which versions show; the screen plays the English version, then the
-- Spanish one. Kept in the slide itself, like its other settings: url_es, design_id_es, show_en,
-- show_es (missing: shown). The screen's rules check the Spanish address or menu like the English
-- one (a slide needs at least one of the two); a digital menu on a screen in either language can't
-- be deleted; and the screen's link carries the digital menus of both versions.

create or replace function public.screen_rules() returns trigger
language plpgsql set search_path = ''
as $$
declare s jsonb; v_kind text; v_ref text;
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
      if s->>'design_id' is null and s->>'design_id_es' is null then
        raise exception 'Pick one of the digital menus for a menu slide' using errcode = '22023';
      end if;
      for v_ref in select x from unnest(array[s->>'design_id', s->>'design_id_es']) x where x is not null loop
        if not exists (select 1 from public.menu_designs d where d.id::text = v_ref and d.format = 'digital') then
          raise exception 'Pick one of the digital menus for a menu slide' using errcode = '22023';
        end if;
      end loop;
    else
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

-- A digital menu on a screen, in English or Spanish, can't be deleted without taking it off first.
create or replace function public.menu_design_on_screen() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_screen text;
begin
  select name into v_screen from public.screens
   where exists (select 1 from jsonb_array_elements(slides) s
                  where s->>'design_id' = old.id::text or s->>'design_id_es' = old.id::text) limit 1;
  if v_screen is not null then
    raise exception '% is on the screen “%”. Take it off that screen first.', old.name, v_screen using errcode = '23503';
  end if;
  return old;
end $$;
revoke execute on function public.menu_design_on_screen() from public, anon, authenticated;

-- What a screen's link loads, as the offers migration made it, now with the digital menus of each
-- slide's Spanish version too.
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
         and o.ends_at > now() and o.starts_at < now() + interval '2 days'), '[]'::jsonb));
end $$;
alter function public.display_feed(text) owner to app_definer;
