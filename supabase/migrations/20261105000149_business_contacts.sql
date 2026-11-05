-- Contacts (Business section): the people the business calls on (the lawyer, the bank, the plumber…),
-- with their phone, WhatsApp, email and website.
-- Who: only the owners (admins with pay access) read and change them. Shop managers, employees,
-- partners and the café tablet see none.

create table public.business_contacts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  -- What they do for the business: a usual job by its English name ("Lawyer", "Bank advisor"), shown in
  -- each person's language, or the business's own words (shared/contacts.ts).
  job         text check (char_length(job) between 1 and 80),
  -- Their firm or bank: "BBVA".
  company     text check (char_length(company) between 1 and 120),
  -- As on profiles: "+34 600 000 000".
  phone       text check (phone ~ '^\+[0-9][0-9 ]{4,24}$'),
  -- They answer on WhatsApp at that number.
  whatsapp    boolean not null default false,
  email       text check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  website     text check (char_length(website) <= 300 and website ~* '^https?://[^\s/]+\S*$'),
  notes       text check (char_length(notes) between 1 and 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users on delete set null default auth.uid()
);
select public.add_business_scope('public.business_contacts');
create index business_contacts_updated_by_idx on public.business_contacts (updated_by);

-- Tidy what's typed (a blank is none; WhatsApp needs a phone) and stamp who changed it.
create or replace function public.business_contact_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.job := nullif(btrim(new.job), '');
  new.company := nullif(btrim(new.company), '');
  new.phone := nullif(btrim(new.phone), '');
  new.email := nullif(btrim(new.email), '');
  new.website := nullif(btrim(new.website), '');
  new.notes := nullif(btrim(new.notes), '');
  if new.name = '' then
    raise exception 'Give them a name' using errcode = '22023';
  end if;
  new.whatsapp := new.whatsapp and new.phone is not null;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
create trigger business_contacts_rules before insert or update on public.business_contacts for each row execute function public.business_contact_rules();
create trigger audit_business_contacts after insert or update or delete on public.business_contacts for each row execute function public.audit_row();

alter table public.business_contacts enable row level security;
revoke all on public.business_contacts from anon;
create policy business_contacts_owners on public.business_contacts for all to authenticated
  using ((select public.can_see_pay())) with check ((select public.can_see_pay()));

-- ---------------------------------------------------------------------------
-- Easy Beans (business 1): the lawyer, the bank advisor and the plumber & electrician
-- ---------------------------------------------------------------------------
-- shared/contacts.ts has the same; its test checks the two agree. Only when Easy Beans has none yet,
-- and without business 1 nothing at all.
do $$
declare
  v_contacts constant jsonb := $json$
[
  {"name": "Eduardo Torquino", "job": "Lawyer", "company": null, "phone": "+34 747 758 327", "whatsapp": false, "email": null, "website": null, "notes": null},
  {"name": "Daniel Cruz Luna", "job": "Bank advisor", "company": "BBVA", "phone": "+34 955 677 963", "whatsapp": false, "email": "daniel.cruz.luna@bbva.com", "website": "https://www.bbva.es", "notes": null},
  {"name": "Miguel", "job": "Plumber & electrician", "company": null, "phone": "+34 632 042 132", "whatsapp": true, "email": null, "website": null, "notes": null}
]
$json$;
begin
  if not exists (select 1 from public.business where id = 1) then return; end if;
  if exists (select 1 from public.business_contacts where business_id = 1) then return; end if;
  insert into public.business_contacts (business_id, name, job, company, phone, whatsapp, email, website, notes)
  select 1, c.name, c.job, c.company, c.phone, c.whatsapp, c.email, c.website, c.notes
    from jsonb_to_recordset(v_contacts) as c(name text, job text, company text, phone text, whatsapp boolean, email text, website text, notes text);
end $$;
