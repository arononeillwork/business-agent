-- Menu and recipe costing, and the waste log.
-- Recipes: each drink or dish on the menu is made of stock items (a flat white: 18 g of beans,
-- 180 ml of milk, a cup and a lid), with variants that add or swap items (oat milk, an extra shot,
-- a large) and an allowance for waste. What a serving costs comes from the items' costs, so it
-- follows the supplier's prices; the app works out the margin against the menu price.
-- Admins only; a gestoría with finances access reads.
-- Waste: a waste movement (migration 52) says why (expired, spilled…), for the Waste page.

-- 1. Recipes and their variants.
create table public.recipes (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 120),
  -- Coffee, Tea & matcha, Cold drinks, Food…
  category       text check (char_length(category) <= 60),
  -- The item's name on the Square till, when it came from there (so it isn't imported twice).
  square_item    text unique check (char_length(square_item) <= 200),
  -- The menu price, IVA included, and the IVA in it.
  sell_price     numeric(10, 2) check (sell_price >= 0),
  vat_rate       numeric(4, 1) not null default 10 check (vat_rate between 0 and 21),
  -- The gross margin aimed for (a share of the price without IVA), and what's allowed for waste.
  target_margin  numeric(4, 1) not null default 70 check (target_margin between 0 and 99),
  wastage_pct    numeric(4, 1) not null default 0 check (wastage_pct between 0 and 50),
  notes          text check (char_length(notes) <= 2000),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users on delete set null default auth.uid()
);

create table public.recipe_variants (
  id            uuid primary key default gen_random_uuid(),
  recipe_id     uuid not null references public.recipes on delete cascade,
  name          text not null check (char_length(name) between 1 and 60),
  -- Added to the menu price (IVA included): +0.40 for oat milk, +1.00 for a large.
  price_change  numeric(10, 2) not null default 0,
  sort          int not null default 0,
  unique (recipe_id, name)
);

-- What goes in: for the recipe itself (variant_id null) or for one variant, which can take the
-- place of an item in the recipe (oat milk instead of whole milk).
create table public.recipe_lines (
  id                uuid primary key default gen_random_uuid(),
  recipe_id         uuid not null references public.recipes on delete cascade,
  variant_id        uuid references public.recipe_variants on delete cascade,
  item_id           uuid not null references public.stock_items on delete cascade,
  quantity          numeric(10, 3) not null check (quantity > 0),
  unit              text not null check (unit in ('unit', 'kg', 'g', 'l', 'ml', 'pack', 'box', 'case', 'bag', 'bottle', 'carton', 'tub', 'roll')),
  replaces_item_id  uuid references public.stock_items on delete set null,
  sort              int not null default 0,
  constraint recipe_lines_replaces_in_variant check (replaces_item_id is null or variant_id is not null)
);
create index recipe_lines_recipe_idx on public.recipe_lines (recipe_id);

create or replace function public.recipe_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.category := nullif(btrim(new.category), '');
  new.square_item := nullif(btrim(new.square_item), '');
  new.notes := nullif(btrim(new.notes), '');
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger recipes_rules before insert or update on public.recipes for each row execute function public.recipe_rules();
create trigger audit_recipes after insert or update or delete on public.recipes for each row execute function public.audit_row();

-- A recipe with its variants and lines, saved in one go: { id?, name, …, variants: [{ id, name,
-- price_change }], lines: [{ item_id, quantity, unit, variant_id?, replaces_item_id? }] }. The
-- variants and lines sent replace the ones there were. Runs as the person (their rules apply).
create or replace function public.save_recipe(p jsonb) returns uuid
language plpgsql set search_path = ''
as $$
declare v_id uuid := nullif(p->>'id', '')::uuid;
begin
  if v_id is null then
    insert into public.recipes (name, category, square_item, sell_price, vat_rate, target_margin, wastage_pct, notes, active)
    values (p->>'name', p->>'category', p->>'square_item', (p->>'sell_price')::numeric, coalesce((p->>'vat_rate')::numeric, 10),
            coalesce((p->>'target_margin')::numeric, 70), coalesce((p->>'wastage_pct')::numeric, 0), p->>'notes', coalesce((p->>'active')::boolean, true))
    returning id into v_id;
  else
    update public.recipes set name = p->>'name', category = p->>'category', square_item = p->>'square_item',
      sell_price = (p->>'sell_price')::numeric, vat_rate = coalesce((p->>'vat_rate')::numeric, 10),
      target_margin = coalesce((p->>'target_margin')::numeric, 70), wastage_pct = coalesce((p->>'wastage_pct')::numeric, 0),
      notes = p->>'notes', active = coalesce((p->>'active')::boolean, true)
     where id = v_id;
    if not found then raise exception 'No such recipe' using errcode = 'P0002'; end if;
    delete from public.recipe_lines where recipe_id = v_id;
    delete from public.recipe_variants where recipe_id = v_id;
  end if;
  insert into public.recipe_variants (id, recipe_id, name, price_change, sort)
  select coalesce(nullif(v->>'id', '')::uuid, gen_random_uuid()), v_id, btrim(v->>'name'), coalesce((v->>'price_change')::numeric, 0), i::int
    from jsonb_array_elements(coalesce(p->'variants', '[]')) with ordinality x(v, i);
  insert into public.recipe_lines (recipe_id, variant_id, item_id, quantity, unit, replaces_item_id, sort)
  select v_id, nullif(l->>'variant_id', '')::uuid, (l->>'item_id')::uuid, (l->>'quantity')::numeric, l->>'unit',
         nullif(l->>'replaces_item_id', '')::uuid, i::int
    from jsonb_array_elements(coalesce(p->'lines', '[]')) with ordinality x(l, i);
  return v_id;
end $$;
revoke execute on function public.save_recipe(jsonb) from public, anon;
grant execute on function public.save_recipe(jsonb) to authenticated;

alter table public.recipes enable row level security;
alter table public.recipe_variants enable row level security;
alter table public.recipe_lines enable row level security;
revoke all on public.recipes, public.recipe_variants, public.recipe_lines from anon;
create policy recipes_admin on public.recipes for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy recipe_variants_admin on public.recipe_variants for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy recipe_lines_admin on public.recipe_lines for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy recipes_partner_read on public.recipes for select to authenticated using ((select public.partner_can('finances')));
create policy recipe_variants_partner_read on public.recipe_variants for select to authenticated using ((select public.partner_can('finances')));
create policy recipe_lines_partner_read on public.recipe_lines for select to authenticated using ((select public.partner_can('finances')));

-- 2. Why something was wasted (only on waste).
alter table public.stock_movements add column waste_reason text
  check (waste_reason in ('expired', 'spilled', 'wrong_order', 'quality', 'staff_drink', 'other'));

create or replace function public.stock_move() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_on_hand numeric;
begin
  select on_hand into v_on_hand from public.stock_items where id = new.item_id for update;
  if not found then raise exception 'No such stock item' using errcode = 'P0002'; end if;
  if new.reason = 'count' then
    if new.counted is null then raise exception 'Enter how many you counted' using errcode = '22023'; end if;
    new.change := new.counted - v_on_hand;
  else
    new.counted := null;
    if coalesce(new.change, 0) = 0 then raise exception 'Enter how many' using errcode = '22023'; end if;
    if new.reason = 'delivery' and new.change < 0 then raise exception 'A delivery adds stock' using errcode = '22023'; end if;
    if new.reason in ('waste', 'sold', 'used') and new.change > 0 then raise exception 'Waste, used and sold take stock away' using errcode = '22023'; end if;
  end if;
  -- Waste says why (anything else has no waste reason).
  if new.reason = 'waste' then new.waste_reason := coalesce(new.waste_reason, 'other'); else new.waste_reason := null; end if;
  new.note := nullif(btrim(new.note), '');
  new.at := now();
  new.by := auth.uid();
  new.on_hand_after := v_on_hand + new.change;
  perform set_config('stock.moving', 'on', true);
  update public.stock_items set on_hand = new.on_hand_after where id = new.item_id;
  perform set_config('stock.moving', '', true);
  return new;
end $$;
revoke execute on function public.stock_move() from public, anon, authenticated;
