-- The menu's prices go back to Square. While the menu comes from Square (settings.menu_source), a price
-- changed here (the Menu page, Menu costing, the AI connector) is changed in Square too, so the till,
-- online orders, the website, the screens and Google Maps all charge the same. A change made in Square
-- still comes the other way (sync_square_menu(), now also straight away by Square's catalog webhook).
--
-- How: a change to an item's price, or to one of its variants', waits here for the Worker
-- (worker/menu.ts, pushSquarePrices()), which sends it to Square straight after it's saved and every
-- minute in case that didn't happen. Sent: the row goes. Square refused it (no permission to change
-- items yet, the item gone from Square): the row stays with why, for the Menu page to show, and
-- Square's price comes back with the next read. Prices read from Square aren't sent back
-- (sync_square_menu() says so with app.from_square), and while a change waits, a read from Square
-- leaves that item's prices alone so it isn't undone before it's sent.
-- Who: admins see them (the Menu page) and clear a refusal they've read; the triggers add them.

create table public.square_price_pushes (
  recipe_id  uuid primary key references public.recipes on delete cascade,
  -- The price wanted, for the Menu page's note when Square refuses it.
  price      numeric(10, 2),
  queued_at  timestamptz not null default now(),
  -- Square didn't answer (a timeout, its own error): tried again each minute, a few times.
  tries      int not null default 0 check (tries >= 0),
  -- Square refused it, and why; null while it waits to be sent.
  error      text check (char_length(error) <= 500),
  failed_at  timestamptz
);
select public.add_business_scope('public.square_price_pushes');
create index square_price_pushes_waiting on public.square_price_pushes (business_id) where error is null;

alter table public.square_price_pushes enable row level security;
revoke all on public.square_price_pushes from anon;
-- Added and changed only by the triggers below and the Worker.
revoke insert, update on public.square_price_pushes from authenticated;
create policy square_price_pushes_admin_read on public.square_price_pushes for select to authenticated using ((select public.is_admin()));
create policy square_price_pushes_admin_clear on public.square_price_pushes for delete to authenticated using ((select public.is_admin()));

-- An item of Square's whose price changed here, while the menu comes from Square: it waits to be sent.
create or replace function public.queue_square_price(p_recipe uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(current_setting('app.from_square', true), '') = 'on' then return; end if;
  insert into public.square_price_pushes (business_id, recipe_id, price)
  select r.business_id, r.id, r.sell_price from public.recipes r
    join public.settings s on s.business_id = r.business_id and s.id = 1 and s.menu_source = 'square'
   where r.id = p_recipe and r.square_id is not null
  on conflict (recipe_id) do update set price = excluded.price, queued_at = now(), tries = 0, error = null, failed_at = null;
end $$;
alter function public.queue_square_price(uuid) owner to app_definer;
revoke execute on function public.queue_square_price(uuid) from public, anon, authenticated;

create or replace function public.recipes_square_price() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.queue_square_price(new.id);
  return null;
end $$;
alter function public.recipes_square_price() owner to app_definer;
create trigger recipes_square_price after update of sell_price on public.recipes for each row
  when (old.sell_price is distinct from new.sell_price and new.square_id is not null)
  execute function public.recipes_square_price();

-- A variant's price is Square's variation's (the item's price and the difference): a change to one, a
-- new one or one taken away is sent too.
create or replace function public.recipe_variants_square_price() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.price_change is not distinct from new.price_change then return null; end if;
  perform public.queue_square_price(case when tg_op = 'DELETE' then old.recipe_id else new.recipe_id end);
  return null;
end $$;
alter function public.recipe_variants_square_price() owner to app_definer;
create trigger recipe_variants_square_price after insert or delete or update of price_change on public.recipe_variants for each row
  execute function public.recipe_variants_square_price();

-- The menu from Square, as before (the `menu` migration), with two differences: what it changes isn't
-- sent back to Square (app.from_square, while it runs), and an item whose price changed
-- here and is still waiting to go to Square keeps its prices until it has gone.
create or replace function public.sync_square_menu(p jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  it jsonb; v_id uuid; v_new boolean; v_waiting boolean; n_added int := 0; n_changed int := 0; n_off int := 0;
  v_ids text[] := array(select x->>'square_id' from jsonb_array_elements(coalesce(p->'items', '[]')) x);
  v_sections text[] := array(select jsonb_array_elements_text(coalesce(p->'sections', '[]')));
  v_order text[];
begin
  perform set_config('app.from_square', 'on', true);
  for it in select * from jsonb_array_elements(coalesce(p->'items', '[]')) loop
    select id into v_id from public.recipes where square_id = it->>'square_id';
    if v_id is null then
      select id into v_id from public.recipes where square_id is null and lower(name) = lower(it->>'name') order by active desc, created_at limit 1;
    end if;
    v_new := v_id is null;
    if v_new then
      insert into public.recipes (name, square_id, category, on_menu, menu_sort)
      values (it->>'name', it->>'square_id', it->>'category', true, coalesce((it->>'menu_sort')::int, 0))
      returning id into v_id;
      n_added := n_added + 1;
    else
      n_changed := n_changed + 1;
    end if;
    v_waiting := exists (select 1 from public.square_price_pushes q where q.recipe_id = v_id and q.error is null);
    update public.recipes r set name = it->>'name', square_id = it->>'square_id', category = it->>'category',
      sell_price = case when v_waiting then r.sell_price else (it->>'sell_price')::numeric end,
      price_label = it->>'price_label', description = it->>'description',
      photo_url = coalesce(it->>'photo_url', r.photo_url), active = true
     where r.id = v_id;
    if not v_waiting then
      -- Variants by name: changed in place (what goes in each stays), new ones added, gone ones removed.
      delete from public.recipe_variants v where v.recipe_id = v_id
         and not exists (select 1 from jsonb_array_elements(coalesce(it->'variants', '[]')) x where x->>'name' = v.name);
      insert into public.recipe_variants (recipe_id, name, price_change, sort)
      select v_id, x->>'name', coalesce((x->>'price_change')::numeric, 0), i::int
        from jsonb_array_elements(coalesce(it->'variants', '[]')) with ordinality y(x, i)
      on conflict (recipe_id, name) do update set price_change = excluded.price_change, sort = excluded.sort;
    end if;
  end loop;
  update public.recipes set on_menu = false where square_id is not null and not (square_id = any(v_ids)) and on_menu;
  get diagnostics n_off = row_count;
  select menu_sections into v_order from public.settings where id = 1;
  v_order := array(select x from unnest(v_order) with ordinality u(x, i) where x = any(v_sections) order by i)
          || array(select x from unnest(v_sections) with ordinality u(x, i) where not (x = any(v_order)) order by i);
  update public.settings set menu_synced_at = now(), menu_sync_error = null, menu_sections = v_order where id = 1;
  -- Changes after this call (in the same transaction) are the app's again.
  perform set_config('app.from_square', '', true);
  return jsonb_build_object('added', n_added, 'changed', n_changed, 'off', n_off);
end $$;
alter function public.sync_square_menu(jsonb) owner to app_definer;
revoke execute on function public.sync_square_menu(jsonb) from public, anon, authenticated;
grant execute on function public.sync_square_menu(jsonb) to service_role;
