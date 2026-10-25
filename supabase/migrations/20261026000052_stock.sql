-- Stock: everything the business buys wholesale (beans, milk, cups, pastries…) and the bags of
-- beans and merch it sells in the shop, who supplies each one (with their links and contact
-- details), how many are in, and every delivery, count, waste and sale that changed that.
-- Who: admins manage suppliers and items (prices included); the team reads them and records
-- deliveries, counts and waste (stocktakes are a team job); a gestoría with finances access reads.

-- 1. Suppliers. These replace business.suppliers (a list on the business row, from the first
--    migration), which is copied in below and no longer used by the app.
create table public.suppliers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 120),
  -- Bakery, Coffee roaster, Dairy, Packaging, Cash & carry…
  kind           text check (char_length(kind) <= 60),
  contact_name   text check (char_length(contact_name) <= 100),
  email          text check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- As on profiles: "+34 600 000 000".
  phone          text check (phone ~ '^\+[0-9][0-9 ]{4,24}$'),
  -- They take orders on WhatsApp at that number.
  whatsapp       boolean not null default false,
  website        text check (website ~* '^https?://[^\s/]+\S*$'),
  -- Their ordering page or trade portal.
  order_url      text check (order_url ~* '^https?://[^\s/]+\S*$'),
  address        text check (char_length(address) <= 300),
  -- The business's customer number with them.
  account_number text check (char_length(account_number) <= 60),
  -- The days they take orders, and by what time (for delivery lead_days later).
  order_days     text[] not null default '{}' check (order_days <@ array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
  cutoff         time,
  lead_days      int not null default 1 check (lead_days between 0 and 60),
  minimum_order  numeric(10, 2) check (minimum_order >= 0),
  payment_terms  text check (char_length(payment_terms) <= 120),
  notes          text check (char_length(notes) <= 2000),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users on delete set null default auth.uid()
);

comment on column public.business.suppliers is 'Superseded by public.suppliers (migration 52); kept until nothing reads it.';

insert into public.suppliers (name, kind, phone, email, notes)
select btrim(s->>'name'),
       nullif(btrim(s->>'type'), ''),
       case when s->>'phone' ~ '^\+[0-9][0-9 ]{4,24}$' then s->>'phone' end,
       case when s->>'email' ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then lower(s->>'email') end,
       nullif(btrim(s->>'notes'), '')
  from public.business b, jsonb_array_elements(b.suppliers) s
 where nullif(btrim(s->>'name'), '') is not null;

-- 2. Items: one row per thing bought or sold, with its own supplier and link.
create table public.stock_items (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 120),
  -- Coffee, Milk & dairy, Bakery, Packaging… (the app offers a list; any is fine).
  category       text check (char_length(category) <= 60),
  supplier_id    uuid references public.suppliers on delete set null,
  supplier_sku   text check (char_length(supplier_sku) <= 60),
  -- The item on the supplier's website.
  product_url    text check (product_url ~* '^https?://[^\s/]+\S*$'),
  unit           text not null default 'unit' check (unit in ('unit', 'kg', 'g', 'l', 'ml', 'pack', 'box', 'case', 'bag', 'bottle', 'carton', 'tub', 'roll')),
  -- How it comes, in words ("6 × 1 l"), and how many units make one order line (order in sixes).
  pack_size      text check (char_length(pack_size) <= 60),
  order_multiple numeric(10, 2) not null default 1 check (order_multiple > 0),
  -- What one unit costs wholesale, without IVA, and the IVA on it.
  cost_per_unit  numeric(10, 2) check (cost_per_unit >= 0),
  vat_rate       numeric(4, 1) not null default 10 check (vat_rate between 0 and 21),
  -- Shop items: the price on the shelf, IVA included.
  sell_price     numeric(10, 2) check (sell_price >= 0),
  -- How many are in (kept by stock_movements; editing an item doesn't change it).
  on_hand        numeric(10, 2) not null default 0,
  -- Order up to par_level when it's down to reorder_at.
  par_level      numeric(10, 2) check (par_level >= 0),
  reorder_at     numeric(10, 2) check (reorder_at >= 0),
  -- Bar, Storeroom, Fridge, Shop shelf…
  location       text check (char_length(location) <= 60),
  -- Sold in the shop (bags of beans, merch), not just used behind the bar.
  retail         boolean not null default false,
  notes          text check (char_length(notes) <= 2000),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users on delete set null default auth.uid(),
  constraint stock_items_levels check (reorder_at is null or par_level is null or reorder_at <= par_level)
);
create index stock_items_supplier_idx on public.stock_items (supplier_id);

-- 3. Every change to what's in: a delivery (+), a count (sets the figure), waste, used or sold (−),
--    a correction (either way). Never edited or deleted: a mistake is put right with another one.
create table public.stock_movements (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references public.stock_items on delete cascade,
  at             timestamptz not null default now(),
  reason         text not null check (reason in ('delivery', 'count', 'waste', 'sold', 'used', 'correction')),
  -- How many in or out (a count works it out from the figure counted).
  change         numeric(10, 2) not null,
  counted        numeric(10, 2) check (counted >= 0),
  on_hand_after  numeric(10, 2) not null,
  note           text check (char_length(note) <= 300),
  by             uuid references auth.users on delete set null default auth.uid()
);
create index stock_movements_item_idx on public.stock_movements (item_id, at desc);

-- Tidy what's typed; on an item, how many are in changes only through a movement.
create or replace function public.stock_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_table_name = 'suppliers' then
    new.name := btrim(new.name);
    new.kind := nullif(btrim(new.kind), '');
    new.contact_name := nullif(btrim(new.contact_name), '');
    new.email := nullif(lower(btrim(new.email)), '');
    new.phone := nullif(regexp_replace(btrim(new.phone), '\s+', ' ', 'g'), '');
    new.website := nullif(btrim(new.website), '');
    new.order_url := nullif(btrim(new.order_url), '');
    new.address := nullif(btrim(new.address), '');
    new.account_number := nullif(btrim(new.account_number), '');
    new.payment_terms := nullif(btrim(new.payment_terms), '');
    new.notes := nullif(btrim(new.notes), '');
    -- Monday to Sunday, each once (anything that isn't a day is kept, for the check to refuse).
    new.order_days := coalesce(array(select distinct on (coalesce(array_position(array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], d), 99), d) d
                                       from unnest(new.order_days) d
                                      order by coalesce(array_position(array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], d), 99), d), '{}');
    if new.phone is null then new.whatsapp := false; end if;
  else
    new.name := btrim(new.name);
    new.category := nullif(btrim(new.category), '');
    new.supplier_sku := nullif(btrim(new.supplier_sku), '');
    new.product_url := nullif(btrim(new.product_url), '');
    new.pack_size := nullif(btrim(new.pack_size), '');
    new.location := nullif(btrim(new.location), '');
    new.notes := nullif(btrim(new.notes), '');
    if tg_op = 'UPDATE' and current_setting('stock.moving', true) is distinct from 'on' then new.on_hand := old.on_hand; end if;
  end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create trigger suppliers_rules before insert or update on public.suppliers for each row execute function public.stock_rules();
create trigger stock_items_rules before insert or update on public.stock_items for each row execute function public.stock_rules();
create trigger audit_suppliers after insert or update or delete on public.suppliers for each row execute function public.audit_row();
create trigger audit_stock_items after insert or update or delete on public.stock_items for each row execute function public.audit_row();

-- A movement: checked, then the item's figure follows it. Runs as the owner so the team can move
-- stock without being able to edit items themselves.
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

create trigger stock_movements_move before insert on public.stock_movements for each row execute function public.stock_move();

-- 4. Who sees and changes what.
alter table public.suppliers enable row level security;
alter table public.stock_items enable row level security;
alter table public.stock_movements enable row level security;
revoke all on public.suppliers, public.stock_items, public.stock_movements from anon;

create policy suppliers_read on public.suppliers for select to authenticated
  using ((select public.is_staff()) or (select public.partner_can('finances')));
create policy suppliers_admin on public.suppliers for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy stock_items_read on public.stock_items for select to authenticated
  using ((select public.is_staff()) or (select public.partner_can('finances')));
create policy stock_items_admin on public.stock_items for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- The team records movements as themselves; nobody edits or deletes one.
create policy stock_movements_read on public.stock_movements for select to authenticated
  using ((select public.is_staff()) or (select public.partner_can('finances')));
create policy stock_movements_add on public.stock_movements for insert to authenticated
  with check ((select public.is_staff()) and by = (select auth.uid()));
