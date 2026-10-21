-- Licences & renewals: what the business needs to keep open (licencia de apertura, the SGAE and
-- AGEDI/AIE music licences, the terrace permit, insurance, extinguisher checks, staff certificates…),
-- with each one's reference, when it runs out and how often it renews, its cost and its document
-- (a file in the café's Drive or OneDrive, kept with the tax documents under Tax/Licences).
-- Admins are reminded in the bell before one runs out (licence_reminders(), every night).
-- Who: admins; a gestoría with finances access reads.

create table public.licences (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (char_length(name) between 1 and 120),
  category            text not null default 'permit'
                      check (category in ('permit', 'music', 'insurance', 'health', 'safety', 'certificate', 'contract', 'other')),
  -- Who gives it: Ayuntamiento de Marbella, SGAE, the insurer…
  issuer              text check (char_length(issuer) <= 120),
  -- Its number: expediente, policy or contract number.
  reference           text check (char_length(reference) <= 80),
  -- Whose it is when it's a person's (a food handler's certificate).
  holder              text check (char_length(holder) <= 120),
  starts_on           date check (starts_on between '1990-01-01' and '2101-01-01'),
  -- Null: it doesn't run out (a licencia de apertura).
  expires_on          date check (expires_on between '1990-01-01' and '2101-01-01'),
  -- How often it renews, in months (12: every year); null: it doesn't.
  renew_every_months  int check (renew_every_months between 1 and 240),
  -- Renewed by itself (a direct debit): the reminder says so.
  auto_renews         boolean not null default false,
  -- What it costs each time it renews.
  cost                numeric(10, 2) check (cost >= 0),
  -- Days before it runs out that admins are reminded.
  reminder_days       int not null default 30 check (reminder_days between 0 and 365),
  document_id         uuid references public.tax_documents on delete set null,
  -- Where it's renewed or looked up (the e-office, the SGAE portal).
  link                text check (link ~* '^https?://\S+$'),
  notes               text check (char_length(notes) <= 2000),
  active              boolean not null default true,
  -- The day it ran out when admins were last reminded (once per renewal).
  reminded_for        date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users on delete set null default auth.uid(),
  constraint licences_dates check (starts_on is null or expires_on is null or expires_on >= starts_on)
);
create index licences_expires_idx on public.licences (expires_on) where active;

create or replace function public.licence_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.issuer := nullif(btrim(new.issuer), '');
  new.reference := nullif(btrim(new.reference), '');
  new.holder := nullif(btrim(new.holder), '');
  new.link := nullif(btrim(new.link), '');
  new.notes := nullif(btrim(new.notes), '');
  -- A new last day is a new renewal: remind again before it.
  if tg_op = 'UPDATE' and new.expires_on is distinct from old.expires_on then new.reminded_for := null; end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger licences_rules before insert or update on public.licences for each row execute function public.licence_rules();
create trigger audit_licences after insert or update or delete on public.licences for each row execute function public.audit_row();

alter table public.licences enable row level security;
revoke all on public.licences from anon;
create policy licences_admin on public.licences for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy licences_partner_read on public.licences for select to authenticated using ((select public.partner_can('finances')));

-- Every night (the Worker): admins hear about each licence that runs out within its reminder days
-- (or already has), once per renewal. Returns how many licences were reminded about.
create or replace function public.licence_reminders() returns int
language plpgsql security definer set search_path = ''
as $$
declare v record; n int := 0;
begin
  for v in
    select * from public.licences
     where active and expires_on is not null and expires_on - reminder_days <= current_date
       and reminded_for is distinct from expires_on
  loop
    insert into public.notifications (profile_id, title, body, link)
    select p.id,
           case when v.expires_on < current_date then v.name || ' ran out on ' || to_char(v.expires_on, 'DD/MM/YYYY')
                else v.name || ' runs out on ' || to_char(v.expires_on, 'DD/MM/YYYY') end,
           case when v.auto_renews then 'It renews by itself: check it went through.'
                else concat_ws(' · ', v.issuer, v.reference) end,
           '/licences'
      from public.profiles p where p.role = 'admin' and p.active;
    update public.licences set reminded_for = v.expires_on where id = v.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.licence_reminders() from public, anon, authenticated;
