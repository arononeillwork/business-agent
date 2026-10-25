-- Invoices page: the invoices the business receives from suppliers (and the sales invoices it sends),
-- each with what it's for, when it's due and whether it's paid, tied to its supplier (Stock →
-- Suppliers) and to its file (a tax document in the café's Drive or OneDrive). Invoices come in from
-- the connected mailbox, are uploaded, or are typed in. The app records invoices; it doesn't issue
-- them (issuing needs invoicing software that meets Verifactu).
-- Who: admins with pay access; a gestoría with finances access reads.

-- A supplier's tax number (CIF/NIF), to recognise their e-invoices.
alter table public.suppliers add column tax_id text check (char_length(tax_id) <= 20);

create table public.invoices (
  id             uuid primary key default gen_random_uuid(),
  direction      text not null default 'in' check (direction in ('in', 'out')),
  supplier_id    uuid references public.suppliers on delete set null,
  -- Who it's from (or to) as on the invoice, for one not matched to a supplier.
  party_name     text check (char_length(party_name) <= 120),
  party_email    text check (char_length(party_email) <= 254),
  party_tax_id   text check (char_length(party_tax_id) <= 20),
  number         text check (char_length(number) <= 60),
  issued_on      date check (issued_on between '2000-01-01' and '2101-01-01'),
  due_on         date check (due_on between '2000-01-01' and '2101-01-01'),
  net            numeric(12, 2) check (net between -10000000 and 10000000),
  vat            numeric(12, 2) check (vat between -10000000 and 10000000),
  total          numeric(12, 2) check (total between -10000000 and 10000000),
  currency       text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  -- Stock, Supplies, Utilities… (the supplier's kind when not given).
  category       text check (char_length(category) <= 60),
  status         text not null default 'to_check' check (status in ('to_check', 'to_pay', 'paid', 'disputed', 'sent', 'cancelled')),
  paid_on        date check (paid_on between '2000-01-01' and '2101-01-01'),
  document_id    uuid references public.tax_documents on delete set null,
  source         text not null default 'manual' check (source in ('manual', 'upload', 'email')),
  -- From the mailbox: which message and attachment (so it's brought in once), who sent it and when.
  email_id       text unique check (char_length(email_id) <= 500),
  email_from     text check (char_length(email_from) <= 320),
  email_subject  text check (char_length(email_subject) <= 500),
  email_at       timestamptz,
  notes          text check (char_length(notes) <= 4000),
  created_by     uuid references auth.users on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users on delete set null default auth.uid()
);
create index invoices_supplier_idx on public.invoices (supplier_id);
create index invoices_issued_idx on public.invoices (issued_on);

-- Tidy what's typed; paid gets a day (today unless given); the category follows the supplier's kind.
create or replace function public.invoice_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.party_name := nullif(btrim(new.party_name), '');
  new.party_email := nullif(lower(btrim(new.party_email)), '');
  new.party_tax_id := nullif(upper(regexp_replace(new.party_tax_id, '[\s.-]', '', 'g')), '');
  new.number := nullif(btrim(new.number), '');
  new.category := nullif(btrim(new.category), '');
  new.notes := nullif(btrim(new.notes), '');
  if new.category is null and new.supplier_id is not null then
    new.category := (select kind from public.suppliers where id = new.supplier_id);
  end if;
  if new.status = 'paid' then new.paid_on := coalesce(new.paid_on, current_date);
  else new.paid_on := null;
  end if;
  if tg_op = 'UPDATE' then
    -- Where it came from doesn't change.
    new.source := old.source; new.email_id := old.email_id; new.email_from := old.email_from;
    new.email_subject := old.email_subject; new.email_at := old.email_at;
    new.created_by := old.created_by; new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger invoices_rules before insert or update on public.invoices for each row execute function public.invoice_rules();
create trigger audit_invoices after insert or update or delete on public.invoices for each row execute function public.audit_row();

alter table public.invoices enable row level security;
revoke all on public.invoices from anon;
create policy invoices_pay on public.invoices for all to authenticated
  using ((select public.can_see_pay())) with check ((select public.can_see_pay()));
create policy invoices_partner_read on public.invoices for select to authenticated using ((select public.partner_can('finances')));
