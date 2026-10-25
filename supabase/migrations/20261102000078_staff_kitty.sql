-- Staff kitty: a share of each month's profit put aside for the team, saved up for things chosen
-- together (the Christmas party, a pair of Ray-Bans for the café…). The goals fill in order: the
-- first until it's full, then the next. A month that made a loss puts nothing in.
-- Who: the whole team reads; admins set the share, add goals, put money in and mark a goal bought.

-- 1. The share of each month's operating profit (as Profit & loss works it out) that goes in.
create table public.kitty_settings (
  id              int primary key default 1 check (id = 1),
  profit_percent  numeric(5, 2) not null default 5 check (profit_percent between 0 and 100),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users on delete set null default auth.uid()
);
insert into public.kitty_settings (id) values (1) on conflict do nothing;

-- 2. What the team is saving up for.
create table public.kitty_goals (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  -- The picture on its jar.
  icon        text not null default 'gift'
              check (icon in ('party', 'sunglasses', 'dinner', 'trip', 'gift', 'equipment', 'other')),
  target      numeric(10, 2) not null check (target > 0 and target <= 1000000),
  -- When it's wanted by (the party's date), if there's a date.
  due_on      date check (due_on between '2000-01-01' and '2101-01-01'),
  -- The order the jars fill in.
  sort        int not null default 0,
  -- Where to buy it, or the restaurant.
  link        text check (link ~* '^https?://\S+$'),
  notes       text check (char_length(notes) <= 1000),
  -- Bought: what it cost (taken out of the kitty) and when.
  spent       numeric(10, 2) check (spent >= 0),
  bought_on   date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users on delete set null default auth.uid(),
  constraint kitty_goals_bought check ((spent is null) = (bought_on is null))
);

-- 3. What's gone in: a month's share of profit (once a month), or anything else (the tips jar, a
--    bonus); an adjustment can take some out.
create table public.kitty_entries (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('profit', 'top_up', 'adjust')),
  -- A profit share: the month it's from (its first day) and the share it was.
  month       date check (month = date_trunc('month', month)::date),
  percent     numeric(5, 2) check (percent between 0 and 100),
  amount      numeric(10, 2) not null check (amount <> 0),
  note        text check (char_length(note) <= 300),
  created_by  uuid references auth.users on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  constraint kitty_entries_profit check (kind <> 'profit' or (month is not null and percent is not null and amount > 0)),
  constraint kitty_entries_top_up check (kind <> 'top_up' or amount > 0)
);
create unique index kitty_entries_month_idx on public.kitty_entries (month) where kind = 'profit';
create index kitty_entries_created_idx on public.kitty_entries (created_at desc);

-- What's in the kitty now: everything put in, less what's been bought.
create or replace function public.kitty_balance() returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce((select sum(amount) from public.kitty_entries), 0) - coalesce((select sum(spent) from public.kitty_goals), 0);
$$;
revoke execute on function public.kitty_balance() from public, anon;
grant execute on function public.kitty_balance() to authenticated;

create or replace function public.kitty_goal_rules() returns trigger
language plpgsql set search_path = ''
as $$
declare v_left numeric;
begin
  new.name := btrim(new.name);
  new.link := nullif(btrim(new.link), '');
  new.notes := nullif(btrim(new.notes), '');
  -- Bought: the kitty has to have it (what's in it, not counting this goal's own spend before).
  if new.spent is not null and (tg_op = 'INSERT' or new.spent is distinct from old.spent) then
    v_left := public.kitty_balance() + case when tg_op = 'UPDATE' then coalesce(old.spent, 0) else 0 end;
    if new.spent > v_left then
      raise exception 'The kitty has €%: put more in first', to_char(greatest(v_left, 0), 'FM999990.00');
    end if;
  end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger kitty_goals_rules before insert or update on public.kitty_goals for each row execute function public.kitty_goal_rules();
create trigger audit_kitty_goals after insert or update or delete on public.kitty_goals for each row execute function public.audit_row();

create or replace function public.kitty_entry_rules() returns trigger
language plpgsql set search_path = ''
as $$
declare v_was numeric := case when tg_op = 'INSERT' then 0 else old.amount end;
begin
  -- Nothing takes the kitty below what's been bought with it already.
  if tg_op = 'DELETE' then
    if old.amount > 0 and public.kitty_balance() - old.amount < 0 then
      raise exception 'That money has been spent: the kitty has €%', to_char(greatest(public.kitty_balance(), 0), 'FM999990.00');
    end if;
    return old;
  end if;
  new.note := nullif(btrim(new.note), '');
  if new.kind <> 'profit' then new.month := null; new.percent := null; end if;
  if new.kind = 'profit' and new.month >= date_trunc('month', now() at time zone public.business_tz())::date then
    raise exception 'A month''s profit goes in once the month is over';
  end if;
  if new.amount < v_was and public.kitty_balance() - v_was + new.amount < 0 then
    raise exception 'The kitty has €%', to_char(greatest(public.kitty_balance() - v_was, 0), 'FM999990.00');
  end if;
  if tg_op = 'UPDATE' then new.created_by := old.created_by; new.created_at := old.created_at; end if;
  return new;
end $$;
create trigger kitty_entries_rules before insert or update or delete on public.kitty_entries for each row execute function public.kitty_entry_rules();
create trigger audit_kitty_entries after insert or update or delete on public.kitty_entries for each row execute function public.audit_row();

alter table public.kitty_settings enable row level security;
alter table public.kitty_goals enable row level security;
alter table public.kitty_entries enable row level security;
revoke all on public.kitty_settings, public.kitty_goals, public.kitty_entries from anon;
create policy kitty_settings_read on public.kitty_settings for select to authenticated using ((select public.is_staff()));
create policy kitty_settings_admin on public.kitty_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy kitty_goals_read on public.kitty_goals for select to authenticated using ((select public.is_staff()));
create policy kitty_goals_admin on public.kitty_goals for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy kitty_entries_read on public.kitty_entries for select to authenticated using ((select public.is_staff()));
create policy kitty_entries_admin on public.kitty_entries for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- 4. The first two goals, as the owners asked: the Christmas party, then a pair of Ray-Bans for the café.
insert into public.kitty_goals (name, icon, target, sort, notes) values
  ('Christmas party', 'party', 500, 1, 'Dinner and drinks for the whole team'),
  ('Ray-Ban sunglasses for the café', 'sunglasses', 160, 2, 'A pair of Wayfarers for the terrace');
