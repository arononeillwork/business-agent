-- The CV pool (Hiring): people kept for a job to come when there's no job for them yet: a CV handed in
-- at the counter, sent by email or passed on by someone. They're applicants with no job (opening_id
-- null) until an admin adds them to one, when they go on its board at Applied, with their CV.
-- For someone in the pool: the roles they'd suit ("Barista", "Kitchen"), the day they can start from
-- and when they can work, in words ("Weekends", "Mornings until June").
-- Their CV can be a file uploaded on the page (a PDF, a Word document or a picture), kept in a table
-- of its own (applicant_cvs) so the applicants' row audit doesn't copy the file into the log. Anyone
-- who applied can have one, in the pool or on a job.
-- Spain/GDPR: as everyone who applied, they're kept a year from when they were added (keep_until, as
-- the `hiring` migration sets it), then their details should go; their CV goes with them.
-- Who: admins, as the rest of Hiring. The code live before this keeps working: it always names a job.

alter table public.applicants
  alter column opening_id drop not null,
  add column roles text[] not null default '{}' check (cardinality(roles) <= 10 and char_length(array_to_string(roles, ',')) <= 600),
  add column available_from date check (available_from between '2000-01-01' and '2101-01-01'),
  add column availability text check (char_length(availability) <= 200);

-- The roles tidied (trimmed, each once whatever its capitals, in the order typed) and the availability.
create or replace function public.applicant_pool_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.roles := coalesce(array(
    select r from (select distinct on (lower(btrim(x))) btrim(x) as r, n
                     from unnest(new.roles) with ordinality as u(x, n)
                    where btrim(x) <> ''
                    order by lower(btrim(x)), n) s
     order by n), '{}');
  if exists (select 1 from unnest(new.roles) r where char_length(r) > 60) then
    raise exception 'Keep each role to 60 characters' using errcode = '22023';
  end if;
  new.availability := nullif(btrim(new.availability), '');
  return new;
end $$;
create trigger applicants_pool_rules before insert or update on public.applicants
  for each row execute function public.applicant_pool_rules();

-- An applicant's CV, uploaded: one each (a new one replaces it), gone with them.
create table public.applicant_cvs (
  applicant_id  uuid primary key references public.applicants on delete cascade,
  file_name     text not null check (char_length(file_name) between 1 and 255),
  mime_type     text check (char_length(mime_type) <= 255),
  size          bigint not null check (size between 1 and 10485760),
  -- The file as a data: URL: up to 10 MB, so up to 14 million characters of base64.
  content       text not null check (content like 'data:%' and length(content) <= 14000000),
  added_by      uuid references auth.users on delete set null default auth.uid(),
  added_at      timestamptz not null default now()
);
select public.add_business_scope('public.applicant_cvs');
create index applicant_cvs_added_by_idx on public.applicant_cvs (added_by);

-- A CV is for an applicant of its own business and stays theirs; a new file says who added it and when.
-- With the caller's rights, filtered by the row's business for the Worker.
create or replace function public.applicant_cv_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.applicant_id := old.applicant_id;
    new.added_by := auth.uid();
    new.added_at := now();
  end if;
  if not exists (select 1 from public.applicants a where a.id = new.applicant_id and a.business_id = new.business_id) then
    raise exception 'Applicant not found' using errcode = '22023';
  end if;
  new.file_name := btrim(new.file_name);
  new.mime_type := nullif(btrim(new.mime_type), '');
  return new;
end $$;
create trigger applicant_cvs_rules before insert or update on public.applicant_cvs
  for each row execute function public.applicant_cv_rules();
-- No row audit: the whole file would be copied into the audit log with it.

alter table public.applicant_cvs enable row level security;
revoke all on public.applicant_cvs from anon;
create policy applicant_cvs_admin on public.applicant_cvs for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
