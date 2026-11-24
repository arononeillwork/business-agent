-- The coffee club (Sales → Coffee club): a monthly membership a customer buys on Square's own checkout page,
-- worth so many free coffees a week (Monday to Sunday, the business's days). Square takes the money: a
-- subscription plan at one flat monthly price, its card kept by Square and charged each month. The app counts
-- the coffees: on the Square till the team adds the member to the sale and applies the club's discount to the
-- drink; the Worker reads the sale (Square's order webhook, and every 15 minutes in case one was missed),
-- counts it against the member's week and writes what's left on their Square customer's note, which the till
-- shows when they're added to a sale (worker/coffeeClub.ts).
--
-- Who: admins read it here; every change goes through the Worker, which works with Square too (the service
-- role, for one business). Nothing in it is a customer's details: names come from Customers.

-- 1. The club ------------------------------------------------------------------------------------------------
-- No row: not set up yet. Square's ids are those of what the Worker made there: the subscription plan and
-- its variation at the current price (a price changed makes a new variation; members who joined at the old
-- one keep it, so those still count), the discount the team applies, and the sign-up page.
create table public.coffee_club (
  id                   int not null default 1 check (id = 1),
  name                 text not null default 'Coffee club' check (char_length(name) between 1 and 40),
  -- A month, tax included, in the business's currency.
  price                numeric(8,2) not null check (price between 1 and 200),
  currency             text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  coffees_per_week     int not null default 1 check (coffees_per_week between 1 and 14),
  -- The most the discount takes off one drink, so it can't make a lunch free.
  max_value            numeric(8,2) not null check (max_value between 0.5 and 50),
  -- What the note on the till is written in.
  till_language        text not null default 'en' check (till_language in ('en', 'es')),
  -- Off: the sign-up page is taken down; members stay members.
  selling              boolean not null default true,
  square_location_id   text check (char_length(square_location_id) <= 191),
  square_plan_id       text check (char_length(square_plan_id) <= 191),
  square_variation_id  text check (char_length(square_variation_id) <= 191),
  square_old_variation_ids text[] not null default '{}' check (cardinality(square_old_variation_ids) <= 50),
  square_discount_id   text check (char_length(square_discount_id) <= 191),
  square_link_id       text check (char_length(square_link_id) <= 191),
  signup_url           text check (char_length(signup_url) <= 500 and signup_url ~ '^https://'),
  -- Square's sales have been looked through up to here (the Worker's catch-up).
  orders_checked_at    timestamptz,
  set_up_at            timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  updated_by           uuid references auth.users on delete set null default auth.uid(),
  constraint coffee_club_link check ((square_link_id is null) = (signup_url is null))
);
select public.add_business_scope('public.coffee_club');
alter table public.coffee_club add primary key (business_id);
create index coffee_club_updated_by_idx on public.coffee_club (updated_by);

create or replace function public.coffee_club_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  if new.name = '' then
    raise exception 'Give the club a name' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' then new.set_up_at := old.set_up_at; end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
create trigger coffee_club_rules before insert or update on public.coffee_club for each row execute function public.coffee_club_rules();
create trigger audit_coffee_club after insert or update or delete on public.coffee_club for each row execute function public.audit_row();

-- 2. Members: one Square subscription each -----------------------------------------------------------------------
-- As Square has it: pending (starts later), active, paused, canceled (ended) or deactivated (Square stopped it).
-- ends_on: the last day a cancelled one runs (it stays active until then). paid: the latest monthly charge
-- went through (or none is due yet); false while one has failed. note_line: what the Worker last wrote on
-- their Square customer's note, so it's only written again when it changes.
create table public.coffee_club_members (
  id                      uuid primary key default gen_random_uuid(),
  square_subscription_id  text not null check (char_length(square_subscription_id) <= 191),
  square_customer_id      text not null check (char_length(square_customer_id) <= 191),
  square_variation_id     text check (char_length(square_variation_id) <= 191),
  customer_id             uuid references public.customers on delete set null,
  status                  text not null check (status in ('pending', 'active', 'paused', 'canceled', 'deactivated')),
  started_on              date,
  ends_on                 date,
  paid                    boolean not null default true,
  paid_through            date,
  note_line               text check (char_length(note_line) <= 200),
  note_written_at         timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
select public.add_business_scope('public.coffee_club_members');
create unique index coffee_club_members_subscription_key on public.coffee_club_members (business_id, square_subscription_id);
create index coffee_club_members_square_customer_idx on public.coffee_club_members (business_id, square_customer_id);
create index coffee_club_members_customer_idx on public.coffee_club_members (customer_id);

-- 3. Coffees: each drink the club's discount was applied to on the till ---------------------------------------
-- One row a sale's line (its quantity: two flat whites on one line are two). week: the Monday of the sale's
-- week, the business's day. problem: why it didn't count as a member's coffee (nobody added to the sale,
-- someone who isn't a member, a member whose payment failed or isn't active, or the week's coffees already
-- had); an admin marks one sorted once dealt with.
create table public.coffee_club_coffees (
  id                  uuid primary key default gen_random_uuid(),
  square_order_id     text not null check (char_length(square_order_id) <= 191),
  square_line_uid     text not null check (char_length(square_line_uid) <= 191),
  member_id           uuid references public.coffee_club_members on delete set null,
  square_customer_id  text check (char_length(square_customer_id) <= 191),
  item                text check (char_length(item) <= 200),
  quantity            int not null default 1 check (quantity between 1 and 50),
  value               numeric(8,2) not null default 0 check (value >= 0),
  at                  timestamptz not null,
  week                date not null check (extract(isodow from week) = 1),
  problem             text check (problem in ('no_customer', 'not_member', 'not_paid', 'over_limit')),
  sorted_at           timestamptz,
  created_at          timestamptz not null default now()
);
select public.add_business_scope('public.coffee_club_coffees');
create unique index coffee_club_coffees_line_key on public.coffee_club_coffees (business_id, square_order_id, square_line_uid);
create index coffee_club_coffees_member_week_idx on public.coffee_club_coffees (business_id, member_id, week);
create index coffee_club_coffees_member_idx on public.coffee_club_coffees (member_id);
create index coffee_club_coffees_at_idx on public.coffee_club_coffees (business_id, at desc);

-- 4. Who sees it -------------------------------------------------------------------------------------------------
-- Admins read all three; nobody changes them but the Worker (the service role skips row security).
alter table public.coffee_club enable row level security;
alter table public.coffee_club_members enable row level security;
alter table public.coffee_club_coffees enable row level security;
revoke all on public.coffee_club, public.coffee_club_members, public.coffee_club_coffees from anon, authenticated;
grant select on public.coffee_club, public.coffee_club_members, public.coffee_club_coffees to authenticated;
create policy coffee_club_admin on public.coffee_club for select to authenticated using ((select public.is_admin()));
create policy coffee_club_members_admin on public.coffee_club_members for select to authenticated using ((select public.is_admin()));
create policy coffee_club_coffees_admin on public.coffee_club_coffees for select to authenticated using ((select public.is_admin()));
