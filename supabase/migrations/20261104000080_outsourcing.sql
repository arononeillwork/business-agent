-- Outsourcing (Team section): the jobs done for the business by people and firms outside the team
-- (social media, the books, cleaning, the coffee machine's service…), and the catalogue to choose
-- them from (shared/outsourcing.ts).
-- - contractors: the catalogue. Each person or firm with the jobs they do (the app's names for the
--   usual ones, kept in English, or the business's own words), how to reach them, what they usually
--   charge (without IVA) and how the business rates them. Archived ones (active = false) stay, with
--   the jobs they did; someone who has done a job can't be deleted.
-- - outsourced_jobs: who does which job, on what terms: the price and how it's charged (a month, a
--   year, an hour, a day, a visit or once for a project), how many hours, days or visits in a week,
--   month or year (so what it costs a month can be worked out), and when it started and ends. Ended
--   ones (active = false) are the past.
-- Who: admins; a gestoría with finances access reads.

create table public.contractors (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 120),
  kind           text not null default 'freelancer' check (kind in ('freelancer', 'agency', 'company')),
  -- The jobs they do: "Social media management", "Window cleaning"… each once.
  services       text[] not null default '{}' check (cardinality(services) <= 20),
  contact_name   text check (char_length(contact_name) <= 100),
  email          text check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- As on profiles: "+34 600 000 000".
  phone          text check (phone ~ '^\+[0-9][0-9 ]{4,24}$'),
  -- They answer on WhatsApp at that number.
  whatsapp       boolean not null default false,
  website        text check (website ~* '^https?://[^\s/]+\S*$'),
  -- Their Instagram, Behance or portfolio: work to look at before choosing.
  portfolio_url  text check (portfolio_url ~* '^https?://[^\s/]+\S*$'),
  -- Where they are: "Marbella", "Remote".
  location       text check (char_length(location) <= 120),
  -- What they usually charge, without IVA, and how.
  rate           numeric(10, 2) check (rate >= 0),
  rate_unit      text not null default 'month' check (rate_unit in ('month', 'year', 'hour', 'day', 'visit', 'project')),
  -- The business's own score, 1 to 5, from talking to them or working with them.
  rating         smallint check (rating between 1 and 5),
  notes          text check (char_length(notes) <= 2000),
  starred        boolean not null default false,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users on delete set null default auth.uid()
);
create unique index contractors_name_key on public.contractors (lower(name));

create or replace function public.contractor_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.contact_name := nullif(btrim(new.contact_name), '');
  new.email := lower(nullif(btrim(new.email), ''));
  new.website := nullif(btrim(new.website), '');
  new.portfolio_url := nullif(btrim(new.portfolio_url), '');
  new.location := nullif(btrim(new.location), '');
  new.notes := nullif(btrim(new.notes), '');
  -- Each job once (whatever the capitals), trimmed, in the order given; blank ones left out.
  new.services := coalesce(array(
    select s from (
      select distinct on (lower(btrim(s))) btrim(s) as s, i
        from unnest(new.services) with ordinality u(s, i)
       where btrim(s) <> ''
       order by lower(btrim(s)), i
    ) x order by i), '{}');
  if exists (select 1 from unnest(new.services) s where char_length(s) > 80) then
    raise exception 'Keep each job to 80 characters';
  end if;
  -- WhatsApp needs a number.
  new.whatsapp := new.whatsapp and new.phone is not null;
  if exists (select 1 from public.contractors where lower(name) = lower(new.name) and id <> new.id) then
    raise exception 'There’s already someone called % in the catalogue', new.name;
  end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger contractors_rules before insert or update on public.contractors for each row execute function public.contractor_rules();
create trigger audit_contractors after insert or update or delete on public.contractors for each row execute function public.audit_row();

alter table public.contractors enable row level security;
revoke all on public.contractors from anon;
create policy contractors_admin on public.contractors for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy contractors_partner_read on public.contractors for select to authenticated using ((select public.partner_can('finances')));

create table public.outsourced_jobs (
  id             uuid primary key default gen_random_uuid(),
  -- The job: "Social media management", or the business's own words.
  service        text not null check (char_length(service) between 1 and 80),
  contractor_id  uuid not null references public.contractors on delete restrict,
  -- What's included: "3 posts and 5 stories a week, replies to messages, a monthly report".
  scope          text check (char_length(scope) <= 1000),
  -- The price agreed, without IVA, and how it's charged.
  price          numeric(10, 2) check (price >= 0),
  price_unit     text not null default 'month' check (price_unit in ('month', 'year', 'hour', 'day', 'visit', 'project')),
  -- For a price an hour, a day or a visit: how many, and in what time (6 hours a week, 4 visits a year).
  quantity       numeric(6, 2) check (quantity > 0),
  quantity_per   text check (quantity_per in ('week', 'month', 'year')),
  starts_on      date check (starts_on between '2000-01-01' and '2101-01-01'),
  -- When the contract runs to, or the day it ended; null: until one side ends it.
  ends_on        date check (ends_on between '2000-01-01' and '2101-01-01'),
  notes          text check (char_length(notes) <= 2000),
  -- False: it's over (the Past tab).
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users on delete set null default auth.uid(),
  constraint outsourced_jobs_dates check (starts_on is null or ends_on is null or ends_on >= starts_on),
  constraint outsourced_jobs_quantity check ((quantity is null) = (quantity_per is null))
);
create index outsourced_jobs_contractor_idx on public.outsourced_jobs (contractor_id);

create or replace function public.outsourced_job_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.service := btrim(new.service);
  new.scope := nullif(btrim(new.scope), '');
  new.notes := nullif(btrim(new.notes), '');
  -- How many hours, days or visits only counts for a price charged that way.
  if new.price_unit not in ('hour', 'day', 'visit') then
    new.quantity := null;
    new.quantity_per := null;
  end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger outsourced_jobs_rules before insert or update on public.outsourced_jobs for each row execute function public.outsourced_job_rules();
create trigger audit_outsourced_jobs after insert or update or delete on public.outsourced_jobs for each row execute function public.audit_row();

alter table public.outsourced_jobs enable row level security;
revoke all on public.outsourced_jobs from anon;
create policy outsourced_jobs_admin on public.outsourced_jobs for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy outsourced_jobs_partner_read on public.outsourced_jobs for select to authenticated using ((select public.partner_can('finances')));

-- Someone who has done a job for the business stays in the catalogue (archived), with their jobs.
create or replace function public.contractor_keep_with_jobs() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if exists (select 1 from public.outsourced_jobs where contractor_id = old.id) then
    raise exception '% has done jobs for the business: archive them instead', old.name;
  end if;
  return old;
end $$;
create trigger contractors_keep_with_jobs before delete on public.contractors for each row execute function public.contractor_keep_with_jobs();
