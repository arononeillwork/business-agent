-- Credit & debit: money the business still has to pay (a loan from someone, a machine bought on
-- finance) and money still to come in or that could be raised (something to sell, a deposit to get
-- back, money owed to the business), each with what's been paid or received so far. Grants show on
-- the same page straight from grant_applications; they aren't copied here.
-- Who: admins with pay access; a gestoría with finances access reads.

create table public.credit_debit_items (
  id            uuid primary key default gen_random_uuid(),
  -- debit: the business pays it out; credit: it comes in to the business.
  direction     text not null check (direction in ('debit', 'credit')),
  kind          text not null default 'other' check (kind in ('loan', 'finance', 'sale', 'deposit', 'other')),
  name          text not null check (char_length(name) between 1 and 120),
  -- Who it's owed to or by: Jeremy, the finance company, whoever buys the old machine.
  party         text check (char_length(party) <= 120),
  -- The whole amount: the loan, the machine's price, the asking price.
  amount        numeric(12, 2) not null check (amount > 0),
  -- What's paid or comes in each time, and how often in months (1: every month); null: in one go, or whenever.
  instalment    numeric(12, 2) check (instalment > 0),
  every_months  int check (every_months between 1 and 24),
  -- When the next payment is due (or the money is expected).
  next_due      date check (next_due between '2000-01-01' and '2100-01-01'),
  -- Money that could come in but isn't agreed yet (something that could be sold). Credits only.
  possible      boolean not null default false,
  -- Paid off, received, or settled some other way (sold for less, let off the rest).
  done          boolean not null default false,
  notes         text check (char_length(notes) <= 2000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users on delete set null default auth.uid()
);
create index credit_debit_items_open_idx on public.credit_debit_items (next_due) where not done;

-- Each payment made or received, towards one item.
create table public.credit_debit_payments (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.credit_debit_items on delete cascade,
  paid_on     date not null default current_date check (paid_on between '2000-01-01' and '2100-01-01'),
  amount      numeric(12, 2) not null check (amount > 0),
  note        text check (char_length(note) <= 500),
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users on delete set null default auth.uid()
);
create index credit_debit_payments_item_idx on public.credit_debit_payments (item_id, paid_on);

-- Tidy what's typed and keep who changed it; only money coming in can be "possible".
create or replace function public.credit_debit_item_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.party := nullif(btrim(new.party), '');
  new.notes := nullif(btrim(new.notes), '');
  if new.direction = 'debit' then new.possible := false; end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger credit_debit_items_rules before insert or update on public.credit_debit_items
  for each row execute function public.credit_debit_item_rules();

-- A payment towards it: money that has come in is agreed, so it's no longer only "possible"; once
-- everything is paid (or received) it's done and nothing more is due; otherwise a repeating one moves
-- on to its next due date, when the payment is for this period (made no more than one period before
-- the date, or late). Older payments typed in afterwards leave the date where it is.
-- Keep in step with afterPayment() in shared/creditDebit.ts.
create or replace function public.credit_debit_payment_made() returns trigger
language plpgsql set search_path = ''
as $$
declare v_paid numeric;
begin
  select coalesce(sum(amount), 0) into v_paid from public.credit_debit_payments where item_id = new.item_id;
  update public.credit_debit_items i
     set done = v_paid >= i.amount,
         possible = false,
         next_due = case
           when v_paid >= i.amount then null
           when i.every_months is not null and i.next_due is not null
                and new.paid_on >= (i.next_due - make_interval(months => i.every_months))::date
             then (i.next_due + make_interval(months => i.every_months))::date
           else i.next_due end
   where i.id = new.item_id and not i.done;
  return null;
end $$;
create trigger credit_debit_payments_made after insert on public.credit_debit_payments
  for each row execute function public.credit_debit_payment_made();

create trigger audit_credit_debit_items after insert or update or delete on public.credit_debit_items
  for each row execute function public.audit_row();
create trigger audit_credit_debit_payments after insert or update or delete on public.credit_debit_payments
  for each row execute function public.audit_row();

alter table public.credit_debit_items enable row level security;
alter table public.credit_debit_payments enable row level security;
revoke all on public.credit_debit_items, public.credit_debit_payments from anon;
create policy credit_debit_items_pay on public.credit_debit_items for all to authenticated
  using ((select public.can_see_pay())) with check ((select public.can_see_pay()));
create policy credit_debit_items_partner_read on public.credit_debit_items for select to authenticated
  using ((select public.partner_can('finances')));
create policy credit_debit_payments_pay on public.credit_debit_payments for all to authenticated
  using ((select public.can_see_pay())) with check ((select public.can_see_pay()));
create policy credit_debit_payments_partner_read on public.credit_debit_payments for select to authenticated
  using ((select public.partner_can('finances')));
