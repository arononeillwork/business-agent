-- Employment contracts (Team → Contracts): each person's contract with the business under Spanish law
-- (shared/contracts.ts): its type, the day it starts and its last day (none for a permanent one), the
-- end of the trial period (periodo de prueba), the hours a week, the collective agreement (convenio),
-- the job and its category (grupo profesional), a link to the signed contract and notes.
-- The gross salary is a table of its own, as pay_rates is: a shop manager (an admin without pay
-- access) adds, changes and ends contracts but never reads what anyone earns.
-- Who:
-- - employment_contracts: admins read and write; each person reads their own; a payroll gestoría reads.
-- - employment_contract_pay: admins with pay access read and write; each person reads their own; a
--   payroll gestoría reads. No row audit for it: the audit log is every admin's to read.

create table public.employment_contracts (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles on delete cascade,
  kind            text not null check (kind in ('indefinido', 'indefinido_parcial', 'fijo_discontinuo', 'temporal_produccion',
                                                'temporal_sustitucion', 'formativo', 'autonomo')),
  starts_on       date not null,
  -- The last day; null while it runs with no end date.
  ends_on         date,
  trial_ends_on   date,
  hours_per_week  numeric(5, 2) check (hours_per_week > 0 and hours_per_week <= 80),
  convenio        text check (char_length(convenio) <= 200),
  job_title       text check (char_length(job_title) <= 120),
  document_url    text check (document_url ~* '^https?://\S+$' and char_length(document_url) <= 2000),
  notes           text check (char_length(notes) <= 2000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users on delete set null default auth.uid(),
  constraint employment_contracts_dates check (ends_on is null or ends_on >= starts_on),
  constraint employment_contracts_trial check (trial_ends_on is null or trial_ends_on >= starts_on)
);
select public.add_business_scope('public.employment_contracts');
create index employment_contracts_profile_idx on public.employment_contracts (profile_id, starts_on desc);
create index employment_contracts_updated_by_idx on public.employment_contracts (updated_by);

-- Tidy what's typed; a contract is for someone on this business's team (not the tablet or a partner)
-- and stays theirs. With the caller's rights, filtered by the row's business for the Worker.
create or replace function public.employment_contract_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.convenio := nullif(btrim(new.convenio), '');
  new.job_title := nullif(btrim(new.job_title), '');
  new.document_url := nullif(btrim(new.document_url), '');
  new.notes := nullif(btrim(new.notes), '');
  if tg_op = 'UPDATE' then
    new.profile_id := old.profile_id;
    new.created_at := old.created_at;
  elsif not exists (select 1 from public.profiles p
                     where p.id = new.profile_id and p.business_id = new.business_id and p.role in ('admin', 'employee')) then
    raise exception 'A contract is for someone on the team' using errcode = '22023';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger employment_contracts_rules before insert or update on public.employment_contracts
  for each row execute function public.employment_contract_rules();
create trigger audit_employment_contracts after insert or update or delete on public.employment_contracts
  for each row execute function public.audit_row();

alter table public.employment_contracts enable row level security;
revoke all on public.employment_contracts from anon;
create policy employment_contracts_read on public.employment_contracts for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_admin()) or (select public.partner_can('payroll')));
create policy employment_contracts_admin on public.employment_contracts for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- The gross salary of a contract: an amount an hour, a month or a year.
create table public.employment_contract_pay (
  contract_id  uuid primary key references public.employment_contracts on delete cascade,
  salary       numeric(10, 2) not null check (salary >= 0),
  salary_per   text not null default 'month' check (salary_per in ('hour', 'month', 'year')),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users on delete set null default auth.uid()
);
select public.add_business_scope('public.employment_contract_pay');
create index employment_contract_pay_updated_by_idx on public.employment_contract_pay (updated_by);

-- A contract's pay is in its contract's business.
create or replace function public.employment_contract_pay_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.contract_id := old.contract_id;
  end if;
  if not exists (select 1 from public.employment_contracts c where c.id = new.contract_id and c.business_id = new.business_id) then
    raise exception 'Contract not found' using errcode = '22023';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger employment_contract_pay_rules before insert or update on public.employment_contract_pay
  for each row execute function public.employment_contract_pay_rules();

alter table public.employment_contract_pay enable row level security;
revoke all on public.employment_contract_pay from anon;
create policy employment_contract_pay_read on public.employment_contract_pay for select to authenticated
  using ((select public.can_see_pay()) or (select public.partner_can('payroll'))
         or exists (select 1 from public.employment_contracts c where c.id = contract_id and c.profile_id = (select auth.uid())));
create policy employment_contract_pay_write on public.employment_contract_pay for all to authenticated
  using ((select public.can_see_pay())) with check ((select public.can_see_pay()));
