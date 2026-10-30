-- Offers & specials (Marketing): a special or an offer for a set time (an afternoon's happy hour, a
-- week's cake of the week), with its price, picture and the screens it shows on while it's on: in
-- turn with each screen's other slides, or on its own, the screen showing nothing else until it
-- ends. Its story (or post) is made on the Social planner and remembered here. Screens get their
-- offers with display_feed() and put each one on and take it off at its own times, by their clock,
-- so it shows from the minute it starts to the minute it ends.
-- Who: admins.

create table public.offers (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 80),
  details      text check (char_length(details) <= 300),
  -- As shown: "€3.50", "2 for 1", "20% off"; and what it usually costs, shown crossed out.
  price        text check (char_length(price) <= 40),
  was_price    text check (char_length(was_price) <= 40),
  image_url    text check (image_url ~* '^https://\S+$' and char_length(image_url) <= 2000),
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  -- The screens it shows on while it's on (others' screens and deleted ones are left out).
  screen_ids   uuid[] not null default '{}' check (cardinality(screen_ids) <= 50),
  -- turns: one of the screen's slides, for `seconds` each time round. only: the screen shows just
  -- the offer (and any other offer on its own then) until it ends.
  screen_mode  text not null default 'turns' check (screen_mode in ('turns', 'only')),
  seconds      int not null default 15 check (seconds between 3 and 3600),
  -- Its story or post on the Social planner.
  post_id      uuid references public.social_posts on delete set null,
  -- Off: kept, but on no screen.
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users on delete set null default auth.uid(),
  constraint offers_times check (ends_at > starts_at and ends_at <= starts_at + interval '92 days')
);
select public.add_business_scope('public.offers');
create index offers_ends_idx on public.offers (business_id, ends_at) where active;
create index offers_post_idx on public.offers (post_id);
create index offers_updated_by_idx on public.offers (updated_by);

-- Tidy what's typed; keep only this business's screens (each once, in the order picked) and posts.
-- With the caller's rights, so an admin's own screens; filtered by the row's business for the Worker.
create or replace function public.offer_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  new.details := nullif(btrim(new.details), '');
  new.price := nullif(btrim(new.price), '');
  new.was_price := nullif(btrim(new.was_price), '');
  new.image_url := nullif(btrim(new.image_url), '');
  new.screen_ids := coalesce(array(
    select s from unnest(new.screen_ids) with ordinality u(s, i)
     where exists (select 1 from public.screens c where c.id = s and c.business_id = new.business_id)
     group by s order by min(i)), '{}');
  if new.post_id is not null
     and not exists (select 1 from public.social_posts p where p.id = new.post_id and p.business_id = new.business_id) then
    raise exception 'That post isn’t on your Social planner' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger offers_rules before insert or update on public.offers for each row execute function public.offer_rules();
create trigger audit_offers after insert or update or delete on public.offers for each row execute function public.audit_row();

alter table public.offers enable row level security;
revoke all on public.offers from anon;
create policy offers_admin on public.offers for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- What a screen's link loads, as before (the several_businesses migration), and now its offers:
-- those switched on for this screen that haven't ended and start within two days, so the screen
-- puts each on and takes it off at its own minute even between its checks, or with the internet down.
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
         and exists (select 1 from jsonb_array_elements(v.slides) s where s->>'design_id' = d.id::text)), '{}'::jsonb),
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
