-- Grants page: the answers that decide which grants fit (one row for the business), and the
-- grants it's applying for, stage by stage. The catalogue and its rules live in the app
-- (shared/grantCatalogue.ts, shared/grants.ts), so only what the business says and does is kept.
-- Who: admins with pay access, like Finances; finance partners (the gestoría) read only.

-- 1. The answers: one row, a jsonb of the questions' keys (shared/grants.ts GrantProfile).
create table public.grant_profile (
  id          boolean primary key default true check (id),
  answers     jsonb not null default '{}'::jsonb
              check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 8000),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users on delete set null default auth.uid()
);
insert into public.grant_profile default values;

create or replace function public.touch_grant_profile() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger grant_profile_touch before insert or update on public.grant_profile
  for each row execute function public.touch_grant_profile();
create trigger audit_grant_profile after insert or update or delete on public.grant_profile
  for each row execute function public.audit_row();

-- 2. Applications. One open application per grant: a rejected or closed one can be tracked again.
create table public.grant_applications (
  id                uuid primary key default gen_random_uuid(),
  grant_id          text not null check (grant_id ~ '^[a-z0-9-]{2,60}$'),
  grant_name        text not null check (char_length(grant_name) between 1 and 200),
  stage             text not null default 'interested' check (stage in
                      ('interested', 'gathering', 'submitted', 'info_requested', 'awarded', 'rejected', 'paid', 'obligations', 'closed')),
  submitted_on      date,
  -- The file number the administration gives it.
  expediente        text check (char_length(expediente) <= 80),
  amount_requested  numeric(12, 2) check (amount_requested >= 0),
  amount_awarded    numeric(12, 2) check (amount_awarded >= 0),
  amount_received   numeric(12, 2) check (amount_received >= 0),
  -- The next date that matters, and what it's for.
  deadline          date check (deadline between '2000-01-01' and '2100-01-01'),
  deadline_label    text check (char_length(deadline_label) <= 120),
  notes             text check (char_length(notes) <= 4000),
  docs_done         text[] not null default '{}' check (cardinality(docs_done) <= 60),
  obligations_done  text[] not null default '{}' check (cardinality(obligations_done) <= 60),
  created_by        uuid references auth.users on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index grant_applications_open_idx on public.grant_applications (grant_id)
  where stage not in ('rejected', 'closed');

-- Tidy what's typed, keep who added it and when, and date the submission when it's marked submitted.
create or replace function public.grant_application_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.grant_name := btrim(new.grant_name);
  new.expediente := nullif(btrim(new.expediente), '');
  new.deadline_label := nullif(btrim(new.deadline_label), '');
  new.notes := nullif(btrim(new.notes), '');
  new.docs_done := coalesce(array(select distinct x from unnest(new.docs_done) x where btrim(x) <> '' order by 1), '{}');
  new.obligations_done := coalesce(array(select distinct x from unnest(new.obligations_done) x where btrim(x) <> '' order by 1), '{}');
  if new.stage = 'submitted' and new.submitted_on is null then new.submitted_on := current_date; end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.grant_id := old.grant_id;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger grant_applications_rules before insert or update on public.grant_applications
  for each row execute function public.grant_application_rules();
create trigger audit_grant_applications after insert or update or delete on public.grant_applications
  for each row execute function public.audit_row();

-- 3. The deadline on the team calendar (admins only), kept in step with the application: one
--    event per application, gone when the deadline is cleared, the application is finished
--    (rejected or closed) or removed.
create or replace function public.grant_deadline_event() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_key text := 'grant:' || coalesce(new.id, old.id)::text;
begin
  if tg_op = 'DELETE' or new.deadline is null or new.stage in ('rejected', 'closed') then
    delete from public.calendar_events where source = 'app' and external_id = v_key;
    return null;
  end if;
  insert into public.calendar_events (starts_on, title, category, source, external_id, visibility, details)
  values (new.deadline, left('Grant deadline: ' || new.grant_name || coalesce(' (' || new.deadline_label || ')', ''), 200),
          'business', 'app', v_key, 'admins', jsonb_build_object('grant_application', new.id))
  on conflict (source, external_id) where external_id is not null
  do update set starts_on = excluded.starts_on, title = excluded.title;
  return null;
end $$;
revoke execute on function public.grant_deadline_event() from public, anon, authenticated;
create trigger grant_applications_calendar after insert or update or delete on public.grant_applications
  for each row execute function public.grant_deadline_event();

-- 4. Who sees and changes them.
alter table public.grant_profile enable row level security;
alter table public.grant_applications enable row level security;
revoke all on public.grant_profile, public.grant_applications from anon;

create policy grant_profile_pay on public.grant_profile for all to authenticated
  using ((select public.can_see_pay())) with check ((select public.can_see_pay()));
create policy grant_profile_partner_read on public.grant_profile for select to authenticated
  using ((select public.partner_can('finances')));

create policy grant_applications_pay on public.grant_applications for all to authenticated
  using ((select public.can_see_pay())) with check ((select public.can_see_pay()));
create policy grant_applications_partner_read on public.grant_applications for select to authenticated
  using ((select public.partner_can('finances')));
