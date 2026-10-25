-- Hiring: the jobs the business is filling (job_openings), where each is advertised, and the people
-- who applied (applicants), stage by stage until one is hired and added to the team (profile_id).
-- An interview goes on the team calendar for admins. Spain/GDPR: an applicant who isn't hired is
-- kept a year from applying (keep_until), then should be removed. Who: admins.

create table public.job_openings (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (char_length(title) between 1 and 120),
  -- The rota position it's for.
  position_id     int references public.positions on delete set null,
  contract        text not null default 'part_time' check (contract in ('permanent', 'part_time', 'seasonal', 'temporary', 'internship')),
  hours_per_week  numeric(4, 1) check (hours_per_week between 1 and 60),
  -- In words: "€1.350 gross a month".
  pay             text check (char_length(pay) <= 120),
  description     text check (char_length(description) <= 4000),
  status          text not null default 'open' check (status in ('open', 'paused', 'filled', 'closed')),
  -- Where it's advertised.
  posted_on       text[] not null default '{}'
                  check (posted_on <@ array['infojobs', 'indeed', 'linkedin', 'instagram', 'window', 'referral', 'other']),
  opened_on       date not null default current_date check (opened_on between '2000-01-01' and '2101-01-01'),
  closes_on       date check (closes_on between '2000-01-01' and '2101-01-01'),
  created_by      uuid references auth.users on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.applicants (
  id            uuid primary key default gen_random_uuid(),
  opening_id    uuid not null references public.job_openings on delete cascade,
  full_name     text not null check (char_length(full_name) between 1 and 120),
  email         text check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- As on profiles: "+34 600 000 000".
  phone         text check (phone ~ '^\+[0-9][0-9 ]{4,24}$'),
  source        text not null default 'other' check (source in ('infojobs', 'indeed', 'linkedin', 'instagram', 'window', 'referral', 'other')),
  stage         text not null default 'applied' check (stage in ('applied', 'screening', 'interview', 'trial', 'offer', 'hired', 'rejected')),
  interview_at  timestamptz,
  rating        int check (rating between 1 and 5),
  -- Their CV where it's kept (the job board, Drive).
  cv_link       text check (cv_link ~* '^https?://\S+$'),
  notes         text check (char_length(notes) <= 2000),
  applied_on    date not null default current_date check (applied_on between '2000-01-01' and '2101-01-01'),
  -- A year from applying (set here).
  keep_until    date not null default current_date,
  -- Their account, once added to the team.
  profile_id    uuid references public.profiles on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index applicants_opening_idx on public.applicants (opening_id);

create or replace function public.hiring_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_table_name = 'job_openings' then
    new.title := btrim(new.title);
    new.pay := nullif(btrim(new.pay), '');
    new.description := nullif(btrim(new.description), '');
    new.posted_on := coalesce(array(select distinct x from unnest(new.posted_on) x order by 1), '{}');
    if tg_op = 'UPDATE' then new.created_by := old.created_by; end if;
  else
    new.full_name := btrim(new.full_name);
    new.email := nullif(lower(btrim(new.email)), '');
    new.phone := nullif(regexp_replace(btrim(new.phone), '\s+', ' ', 'g'), '');
    new.cv_link := nullif(btrim(new.cv_link), '');
    new.notes := nullif(btrim(new.notes), '');
    new.keep_until := (new.applied_on + interval '12 months')::date;
  end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger job_openings_rules before insert or update on public.job_openings for each row execute function public.hiring_rules();
create trigger applicants_rules before insert or update on public.applicants for each row execute function public.hiring_rules();
create trigger audit_job_openings after insert or update or delete on public.job_openings for each row execute function public.audit_row();
create trigger audit_applicants after insert or update or delete on public.applicants for each row execute function public.audit_row();

-- An interview on the team calendar (admins only) while the applicant is still in the running.
create or replace function public.applicant_interview_event() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_key text := 'interview:' || coalesce(new.id, old.id)::text;
begin
  if tg_op = 'DELETE' or new.interview_at is null or new.stage in ('hired', 'rejected') then
    delete from public.calendar_events where source = 'app' and external_id = v_key;
    return null;
  end if;
  insert into public.calendar_events (starts_on, starts_at, title, category, source, external_id, visibility, details)
  values ((new.interview_at at time zone public.business_tz())::date, new.interview_at,
          left('Interview: ' || new.full_name || coalesce(' (' || (select title from public.job_openings where id = new.opening_id) || ')', ''), 200),
          'business', 'app', v_key, 'admins', jsonb_build_object('applicant', new.id))
  on conflict (source, external_id) where external_id is not null
  do update set starts_on = excluded.starts_on, starts_at = excluded.starts_at, title = excluded.title;
  return null;
end $$;
revoke execute on function public.applicant_interview_event() from public, anon, authenticated;
create trigger applicants_calendar after insert or update or delete on public.applicants
  for each row execute function public.applicant_interview_event();

alter table public.job_openings enable row level security;
alter table public.applicants enable row level security;
revoke all on public.job_openings, public.applicants from anon;
create policy job_openings_admin on public.job_openings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy applicants_admin on public.applicants for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
