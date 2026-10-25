-- Tax page: the returns the business files (what's due when is worked out in shared/tax.ts),
-- what's been done about each, and the documents kept for them. The documents themselves live in
-- the café's own Google Drive or OneDrive ("Business Agent/Tax/…"); this keeps where each one is,
-- so the list, the quarter's folder and the gestoría's pack can be found again.
-- Who: admins with pay access (as Finances); a gestoría partner with finances access reads.

-- 1. What the business files (the switches on the Tax page) and its gestoría's email.
create table public.tax_settings (
  id            int primary key default 1 check (id = 1),
  withholding   boolean not null default true,   -- staff or freelancers: 111 and 190
  rent          boolean not null default true,   -- rented premises: 115 and 180
  intra_eu      boolean not null default false,  -- EU trade: 349
  instalments   boolean not null default false,  -- corporate tax instalments: 202
  gestor_email  text check (gestor_email is null or (char_length(gestor_email) <= 254 and gestor_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users on delete set null default auth.uid()
);
insert into public.tax_settings (id) values (1) on conflict do nothing;

-- 2. What's been done about each return: one row per model, tax year and period.
create table public.tax_filings (
  id          uuid primary key default gen_random_uuid(),
  model       text not null check (model in ('303', '111', '115', '349', '202', '390', '190', '180', '347', '200', 'CCAA')),
  year        int not null check (year between 2000 and 2100),
  period      text not null check (period in ('1T', '2T', '3T', '4T', '0A', '1P', '2P', '3P')),
  status      text not null default 'to_do' check (status in ('to_do', 'with_gestor', 'filed', 'not_needed')),
  -- To pay (positive) or to get back (negative), as filed.
  amount      numeric(12, 2) check (amount between -10000000 and 10000000),
  filed_on    date check (filed_on between '2000-01-01' and '2101-01-01'),
  -- AEAT's receipt number (número de justificante or CSV).
  reference   text check (char_length(reference) <= 60),
  notes       text check (char_length(notes) <= 2000),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users on delete set null default auth.uid(),
  unique (model, year, period)
);

-- 3. Documents kept for tax, each a file in the café's Drive or OneDrive.
create table public.tax_documents (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 200),
  kind         text not null check (kind in ('sales_invoice', 'purchase_invoice', 'receipt', 'payslip', 'bank_statement', 'tax_return', 'contract', 'other')),
  year         int not null check (year between 2000 and 2100),
  quarter      int check (quarter between 1 and 4),  -- null: for the whole year
  size         bigint not null check (size between 1 and 26214400),  -- 25 MB
  -- The file's fingerprint, so the same file isn't kept twice.
  sha256       text unique check (sha256 ~ '^[0-9a-f]{64}$'),
  storage      text not null check (storage in ('google_drive', 'onedrive')),
  file_id      text not null check (char_length(file_id) <= 200),
  -- Where it is under "Business Agent", e.g. {Tax,2026,Q4,"Purchase invoices"}.
  folder       text[] not null check (cardinality(folder) between 1 and 8 and folder[1] = 'Tax'),
  link         text check (link ~* '^https://'),
  notes        text check (char_length(notes) <= 2000),
  uploaded_by  uuid references auth.users on delete set null default auth.uid(),
  uploaded_at  timestamptz not null default now()
);
create index tax_documents_period_idx on public.tax_documents (year, quarter);

-- Tidy what's typed and stamp who changed what.
create or replace function public.tax_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_table_name = 'tax_settings' then
    new.gestor_email := nullif(lower(btrim(new.gestor_email)), '');
  elsif tg_table_name = 'tax_filings' then
    new.reference := nullif(btrim(new.reference), '');
    new.notes := nullif(btrim(new.notes), '');
    -- Filed: the day it was filed (today unless given); back to to-do: no filing day.
    if new.status = 'filed' then new.filed_on := coalesce(new.filed_on, current_date);
    elsif new.status in ('to_do', 'with_gestor') then new.filed_on := null;
    end if;
  else
    new.notes := nullif(btrim(new.notes), '');
    if tg_op = 'UPDATE' then
      -- Where the file is and who added it don't change; only what it is and when it's for.
      new.storage := old.storage; new.file_id := old.file_id; new.size := old.size; new.sha256 := old.sha256;
      new.uploaded_by := old.uploaded_by; new.uploaded_at := old.uploaded_at;
    end if;
    return new;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create trigger tax_settings_rules before insert or update on public.tax_settings for each row execute function public.tax_rules();
create trigger tax_filings_rules before insert or update on public.tax_filings for each row execute function public.tax_rules();
create trigger tax_documents_rules before insert or update on public.tax_documents for each row execute function public.tax_rules();
create trigger audit_tax_settings after insert or update or delete on public.tax_settings for each row execute function public.audit_row();
create trigger audit_tax_filings after insert or update or delete on public.tax_filings for each row execute function public.audit_row();
create trigger audit_tax_documents after insert or update or delete on public.tax_documents for each row execute function public.audit_row();

-- 4. Admins with pay access do everything; a gestoría with finances access reads. Nobody else.
alter table public.tax_settings enable row level security;
alter table public.tax_filings enable row level security;
alter table public.tax_documents enable row level security;
revoke all on public.tax_settings, public.tax_filings, public.tax_documents from anon;

create policy tax_settings_pay on public.tax_settings for all to authenticated
  using ((select public.can_see_pay())) with check ((select public.can_see_pay()));
create policy tax_filings_pay on public.tax_filings for all to authenticated
  using ((select public.can_see_pay())) with check ((select public.can_see_pay()));
create policy tax_documents_pay on public.tax_documents for all to authenticated
  using ((select public.can_see_pay())) with check ((select public.can_see_pay()));

create policy tax_settings_partner_read on public.tax_settings for select to authenticated using ((select public.partner_can('finances')));
create policy tax_filings_partner_read on public.tax_filings for select to authenticated using ((select public.partner_can('finances')));
create policy tax_documents_partner_read on public.tax_documents for select to authenticated using ((select public.partner_can('finances')));
