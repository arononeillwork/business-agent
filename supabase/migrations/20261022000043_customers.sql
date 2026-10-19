-- Customers and leads, for marketing: people who buy (customers) and people who might (leads,
-- including businesses such as a hotel concierge or a coworking space). Admins only.
-- Spain/GDPR: marketing goes only to people who said yes. marketing_consent records that yes and
-- consent_at when it was given (set here, whoever writes); taking it back clears both.

create table public.customers (
  id                 uuid primary key default gen_random_uuid(),
  kind               text not null default 'lead' check (kind in ('customer', 'lead')),
  first_name         text check (char_length(first_name) <= 100),
  last_name          text check (char_length(last_name) <= 100),
  email              text check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- As on profiles: "+34 600 000 000".
  phone              text check (phone ~ '^\+[0-9][0-9 ]{4,24}$'),
  -- For business leads (a hotel, a coworking space).
  company            text check (char_length(company) <= 120),
  source             text not null default 'walk_in'
                     check (source in ('walk_in', 'instagram', 'facebook', 'tiktok', 'website', 'google', 'referral', 'event', 'other')),
  -- Without the @.
  instagram          text check (instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  -- For birthday offers.
  birthday           date check (birthday between '1900-01-01' and '2100-01-01'),
  tags               text[] not null default '{}' check (cardinality(tags) <= 20),
  notes              text check (char_length(notes) <= 2000),
  marketing_consent  boolean not null default false,
  consent_at         timestamptz,
  last_contacted_at  timestamptz,
  created_by         uuid references auth.users on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Someone to reach: a name, an email or a phone.
  constraint customers_someone check (coalesce(first_name, last_name, email, phone) is not null),
  constraint customers_consent_at check (marketing_consent = (consent_at is not null))
);
create index customers_email_idx on public.customers (lower(email));

-- Tidy what's typed (spaces, blank fields, the @ on a handle, repeated tags) and stamp consent.
create or replace function public.customer_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.first_name := nullif(btrim(new.first_name), '');
  new.last_name := nullif(btrim(new.last_name), '');
  new.email := nullif(lower(btrim(new.email)), '');
  new.phone := nullif(regexp_replace(btrim(new.phone), '\s+', ' ', 'g'), '');
  new.company := nullif(btrim(new.company), '');
  new.instagram := nullif(regexp_replace(btrim(new.instagram), '^@', ''), '');
  new.notes := nullif(btrim(new.notes), '');
  new.tags := coalesce(array(select distinct btrim(x) from unnest(new.tags) x where btrim(x) <> '' order by 1), '{}');
  -- When they said yes is ours to record, not the writer's.
  if not new.marketing_consent then new.consent_at := null;
  elsif tg_op = 'INSERT' or not old.marketing_consent then new.consent_at := now();
  else new.consent_at := old.consent_at;
  end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; new.created_by := old.created_by; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger customers_rules before insert or update on public.customers
  for each row execute function public.customer_rules();
create trigger audit_customers after insert or update or delete on public.customers
  for each row execute function public.audit_row();

alter table public.customers enable row level security;
revoke all on public.customers from anon;
create policy customers_admin on public.customers for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
