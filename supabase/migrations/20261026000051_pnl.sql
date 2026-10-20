-- Profit & loss page: an estimate month by month from what the app already knows (takings, the
-- running costs on Finances, timecards and the rota; worked out in shared/pnl.ts). Kept here: the
-- IVA rate taken off the takings, and one-off income and costs the till and Finances don't know
-- about (a grant paid, a repair). The employer's Social Security is settings.employer_cost_multiplier,
-- the same the rota and timecards use.
-- Who: admins with pay access (as Finances); a gestoría partner with finances access reads.

create table public.pnl_settings (
  id          int primary key default 1 check (id = 1),
  -- Food and drink served in a café or restaurant: 10%.
  vat_rate    numeric(4, 2) not null default 10 check (vat_rate between 0 and 30),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users on delete set null default auth.uid()
);
insert into public.pnl_settings (id) values (1) on conflict do nothing;

create table public.pnl_lines (
  id          uuid primary key default gen_random_uuid(),
  -- The first of the month it belongs to.
  month       date not null check (extract(day from month) = 1 and month between '2000-01-01' and '2100-01-01'),
  kind        text not null check (kind in ('income', 'cost')),
  -- For costs, a Finances category (Stock and Supplies count as cost of sales; People as the team).
  category    text check (char_length(category) <= 60),
  label       text not null check (char_length(btrim(label)) between 1 and 120),
  amount      numeric(12, 2) not null check (amount >= 0 and amount <= 10000000),
  notes       text check (char_length(notes) <= 2000),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users on delete set null default auth.uid()
);
create index pnl_lines_month_idx on public.pnl_lines (month);

-- Tidy what's typed and stamp who changed what.
create or replace function public.pnl_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_table_name = 'pnl_lines' then
    new.label := btrim(new.label);
    new.category := nullif(btrim(new.category), '');
    new.notes := nullif(btrim(new.notes), '');
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create trigger pnl_settings_rules before insert or update on public.pnl_settings for each row execute function public.pnl_rules();
create trigger pnl_lines_rules before insert or update on public.pnl_lines for each row execute function public.pnl_rules();
create trigger audit_pnl_settings after insert or update or delete on public.pnl_settings for each row execute function public.audit_row();
create trigger audit_pnl_lines after insert or update or delete on public.pnl_lines for each row execute function public.audit_row();

-- Admins with pay access do everything; a gestoría with finances access reads. Nobody else.
alter table public.pnl_settings enable row level security;
alter table public.pnl_lines enable row level security;
revoke all on public.pnl_settings, public.pnl_lines from anon;

create policy pnl_settings_pay on public.pnl_settings for all to authenticated
  using ((select public.can_see_pay())) with check ((select public.can_see_pay()));
create policy pnl_lines_pay on public.pnl_lines for all to authenticated
  using ((select public.can_see_pay())) with check ((select public.can_see_pay()));
create policy pnl_settings_partner_read on public.pnl_settings for select to authenticated using ((select public.partner_can('finances')));
create policy pnl_lines_partner_read on public.pnl_lines for select to authenticated using ((select public.partner_can('finances')));
