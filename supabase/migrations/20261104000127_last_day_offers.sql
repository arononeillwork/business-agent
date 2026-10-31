-- Last-day offers: stock on its final day to sell (today's croissants, a cake, sandwiches, milk near
-- its date) goes on offer by itself for the rest of the day: an Offers & specials entry linked to the
-- item, its usual price crossed out, on the screens picked, ending at closing. Admins set the rules
-- (which items, the discount, from when); admins hear about each one in the bell, and can stop it like
-- any offer. Nothing is charged or changed in Square: the till takes the offer price as the team rings it.
-- Who: admins set the rules; the team's deliveries say when a batch has to be sold by.

-- 1. Use-by on stock. How long an item sells for once it comes in ("sell within 1 day": today's
--    pastries), and the day what's in now has to be sold by: set by the latest delivery (its own date,
--    or worked out from the days), or by an admin on the item.
alter table public.stock_items
  add column sell_within_days int check (sell_within_days between 1 and 365),
  add column use_by date;
alter table public.stock_movements add column use_by date;

-- A delivery's use-by: the date given, or the day it comes in plus the item's days (1: today). It
-- becomes the item's. Runs as the owner so the team can record a delivery without editing items.
create or replace function public.stock_use_by() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_days int;
begin
  if new.reason <> 'delivery' then
    new.use_by := null;
    return new;
  end if;
  select sell_within_days into v_days from public.stock_items where id = new.item_id;
  new.use_by := coalesce(new.use_by, (now() at time zone public.business_tz())::date + v_days - 1);
  if new.use_by is not null then
    update public.stock_items set use_by = new.use_by where id = new.item_id;
  end if;
  return new;
end $$;
alter function public.stock_use_by() owner to app_definer;
revoke execute on function public.stock_use_by() from public, anon, authenticated;
create trigger stock_movements_use_by before insert on public.stock_movements for each row execute function public.stock_use_by();

-- 2. The rules (admins): which items or categories, the discount (a % off the shop price, or a set
--    price such as "2 for €3"), from how long before closing, on which screens, and whether to suggest
--    its story. No items or categories picked: every item with a use-by.
create table public.last_day_rules (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null check (char_length(name) between 1 and 60),
  active               boolean not null default true,
  categories           text[] not null default '{}' check (cardinality(categories) <= 30),
  item_ids             uuid[] not null default '{}' check (cardinality(item_ids) <= 200),
  discount             text not null default 'percent' check (discount in ('percent', 'price')),
  percent_off          int not null default 30 check (percent_off between 5 and 90),
  -- As shown, for a set price: "2 for €3", "€1.50".
  price                text check (char_length(price) <= 40),
  -- It starts this long before closing and ends at closing.
  minutes_before_close int not null default 120 check (minutes_before_close between 15 and 720),
  -- The screens it shows on; none picked: every screen that's switched on.
  screen_ids           uuid[] not null default '{}' check (cardinality(screen_ids) <= 50),
  screen_mode          text not null default 'turns' check (screen_mode in ('turns', 'only')),
  -- Admins are asked to make its story when it starts (the picture is drawn in the app).
  story                boolean not null default false,
  sort                 int not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  updated_by           uuid references auth.users on delete set null default auth.uid(),
  constraint last_day_rules_price check (discount = 'percent' or price is not null)
);
select public.add_business_scope('public.last_day_rules');
alter table public.last_day_rules add constraint last_day_rules_name_key unique (business_id, name);
create index last_day_rules_updated_by_idx on public.last_day_rules (updated_by);

-- Tidy what's typed; keep only this business's items and screens (each once, in the order picked).
create or replace function public.last_day_rule_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.price := nullif(btrim(new.price), '');
  new.categories := coalesce(array(select distinct btrim(c) from unnest(new.categories) c where nullif(btrim(c), '') is not null order by 1), '{}');
  new.item_ids := coalesce(array(
    select s from unnest(new.item_ids) with ordinality u(s, i)
     where exists (select 1 from public.stock_items x where x.id = s and x.business_id = new.business_id)
     group by s order by min(i)), '{}');
  new.screen_ids := coalesce(array(
    select s from unnest(new.screen_ids) with ordinality u(s, i)
     where exists (select 1 from public.screens c where c.id = s and c.business_id = new.business_id)
     group by s order by min(i)), '{}');
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger last_day_rules_rules before insert or update on public.last_day_rules for each row execute function public.last_day_rule_rules();
create trigger audit_last_day_rules after insert or update or delete on public.last_day_rules for each row execute function public.audit_row();

alter table public.last_day_rules enable row level security;
revoke all on public.last_day_rules from anon;
create policy last_day_rules_admin on public.last_day_rules for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- A café's usual one, switched off until an admin turns it on: today's bakes, 30% off, from two
-- hours before closing. One per business.
insert into public.last_day_rules (business_id, name, active, categories, updated_by)
select id, 'Today''s bakes', false, '{Bakery}', null from public.business;

-- 3. An automatic offer is an ordinary offer that knows its item, its rule and its day.
alter table public.offers
  add column stock_item_id uuid references public.stock_items on delete set null,
  add column last_day_rule_id uuid references public.last_day_rules on delete set null,
  -- The day it was put on by itself (null: added by hand).
  add column auto_for date;
create index offers_stock_item_idx on public.offers (stock_item_id);
create index offers_last_day_rule_idx on public.offers (last_day_rule_id);

-- Each item goes on offer once on its last day: stopped or deleted, it isn't put back on.
create table public.last_day_offers_made (
  id             uuid primary key default gen_random_uuid(),
  stock_item_id  uuid not null references public.stock_items on delete cascade,
  sold_on        date not null,
  offer_id       uuid references public.offers on delete set null,
  -- How many were left when it went on offer.
  left_at_start  numeric(10, 2) not null,
  created_at     timestamptz not null default now()
);
select public.add_business_scope('public.last_day_offers_made');
alter table public.last_day_offers_made add constraint last_day_offers_made_key unique (business_id, stock_item_id, sold_on);
create index last_day_offers_made_offer_idx on public.last_day_offers_made (offer_id);
create index last_day_offers_made_item_idx on public.last_day_offers_made (stock_item_id);
alter table public.last_day_offers_made enable row level security;
revoke all on public.last_day_offers_made from anon;
create policy last_day_offers_made_read on public.last_day_offers_made for select to authenticated using ((select public.is_admin()));

-- 4. Every minute (the Worker, for each business): each item on its last day with some left, from its
--    rule's time until closing, goes on offer, once. Closed today: nothing. Returns how many started.
create or replace function public.start_last_day_offers(p_now timestamptz default now())
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_tz    text := public.business_tz();
  v_today date := (p_now at time zone v_tz)::date;
  v_hours jsonb;
  v_open  time;
  v_close timestamptz;
  v       record;
  v_offer uuid;
  v_price text;
  v_was   text;
  n       int := 0;
  v_fmt   constant text := 'FM999990.00';
begin
  select opening_hours -> lower(to_char(v_today, 'Dy')) into v_hours from public.business where id = public.current_business_id();
  if v_hours is null or jsonb_typeof(v_hours) <> 'object' or nullif(v_hours ->> 'close', '') is null then return 0; end if;
  v_open := coalesce(nullif(v_hours ->> 'open', '')::time, time '00:00');
  v_close := (v_today + (v_hours ->> 'close')::time) at time zone v_tz;
  -- Closing after midnight is the next day's.
  if (v_hours ->> 'close')::time <= v_open then v_close := v_close + interval '1 day'; end if;
  if p_now >= v_close then return 0; end if;

  for v in
    select i.id, i.name, i.on_hand, i.sell_price, r.id as rule_id, r.discount, r.percent_off, r.price, r.screen_ids, r.screen_mode, r.story
      from public.stock_items i
      cross join lateral (
        select * from public.last_day_rules r
         where r.active
           and ((cardinality(r.item_ids) = 0 and cardinality(r.categories) = 0) or i.id = any (r.item_ids) or i.category = any (r.categories))
         order by r.sort, r.created_at, r.id
         limit 1) r
     where i.active and i.on_hand > 0 and i.use_by = v_today
       and p_now >= v_close - make_interval(mins => r.minutes_before_close)
       and not exists (select 1 from public.last_day_offers_made m where m.stock_item_id = i.id and m.sold_on = v_today)
     order by i.name
  loop
    if v.discount = 'price' then
      v_price := v.price;
      v_was := case when v.sell_price is not null then '€' || to_char(v.sell_price, v_fmt) end;
    elsif v.sell_price is not null then
      v_price := '€' || to_char(round(v.sell_price * (100 - v.percent_off) / 100.0, 2), v_fmt);
      v_was := '€' || to_char(v.sell_price, v_fmt);
    else
      v_price := '-' || v.percent_off || '%';
      v_was := null;
    end if;
    insert into public.offers (title, price, was_price, starts_at, ends_at, screen_ids, screen_mode, stock_item_id, last_day_rule_id, auto_for, updated_by)
    values (left(v.name, 80), v_price, v_was, p_now, v_close,
            case when cardinality(v.screen_ids) > 0 then v.screen_ids
                 else coalesce(array(select s.id from public.screens s where s.active order by s.created_at, s.id), '{}') end,
            v.screen_mode, v.id, v.rule_id, v_today, null)
    returning id into v_offer;
    insert into public.last_day_offers_made (stock_item_id, sold_on, offer_id, left_at_start) values (v.id, v_today, v_offer, v.on_hand);
    insert into public.notifications (profile_id, title, body, link, data)
    select p.id,
           'On offer till closing: ' || v.name,
           trim_scale(v.on_hand)::text || ' left on their last day, ' || v_price || ' until ' || to_char(v_close at time zone v_tz, 'HH24:MI')
             || '. Square isn’t changed: take the offer price at the till.',
           case when v.story then '/offers?story=' || v_offer else '/offers' end,
           jsonb_build_object('offer', v_offer, 'item', v.id)
      from public.profiles p where p.role = 'admin' and p.active and p.business_id = public.current_business_id();
    n := n + 1;
  end loop;
  return n;
end $$;
alter function public.start_last_day_offers(timestamptz) owner to app_definer;
revoke execute on function public.start_last_day_offers(timestamptz) from public, anon, authenticated;
grant execute on function public.start_last_day_offers(timestamptz) to service_role;
