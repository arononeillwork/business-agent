-- Scheduled reports (Dashboards → Reports): a report that goes by itself, every day, on the days of the
-- week picked or on a day of the month, at the business's time picked, from its connected Gmail or
-- Outlook, one email to each person (the team, the business's contacts, any address). The Worker sends
-- what's due each minute (worker/reportSchedules.ts, shared/reports.ts dueNow) and stamps when it went.
-- Its figures are what the person who last changed it can see (no takings without pay access), so
-- nobody sends more than they could see themselves.
-- Who: admins see and change the business's schedules.

create table public.report_schedules (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 60),
  kinds         text[] not null check (cardinality(kinds) between 1 and 7
                  and kinds <@ array['takings', 'best_sellers', 'team', 'stock', 'waste', 'fresh', 'jobs']),
  period        text not null default 'last_week'
                  check (period in ('today', 'yesterday', 'week', 'last_week', 'month', 'last_month', '30')),
  -- Who gets it: people on the team and the business's contacts by id (so a changed address is used), and any address.
  team          uuid[] not null default '{}',
  contacts      uuid[] not null default '{}',
  emails        text[] not null default '{}',
  frequency     text not null default 'weekly' check (frequency in ('daily', 'weekly', 'monthly')),
  -- 1 Monday … 7 Sunday.
  weekdays      int[] not null default '{}' check (weekdays <@ array[1, 2, 3, 4, 5, 6, 7]),
  month_day     int check (month_day between 1 and 28),
  -- The business's time it goes at.
  send_at       time not null default '08:00',
  -- The language it's written in: whoever set it up's.
  language      text not null default 'en' check (language in ('en', 'es')),
  active        boolean not null default true,
  -- The time it last went for (the Worker's), and why it last didn't.
  last_sent_at  timestamptz,
  last_error    text check (char_length(last_error) <= 500),
  created_at    timestamptz not null default now(),
  -- When someone last changed it (it never goes for a time before that), and who: its figures are theirs to see.
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users on delete set null default auth.uid(),
  constraint report_schedules_people check (cardinality(team) + cardinality(contacts) + cardinality(emails) between 1 and 20),
  constraint report_schedules_days check (frequency <> 'weekly' or cardinality(weekdays) > 0),
  constraint report_schedules_month_day check (frequency <> 'monthly' or month_day is not null)
);
select public.add_business_scope('public.report_schedules');
create index report_schedules_updated_by_idx on public.report_schedules (updated_by);

-- Tidy what's typed (addresses once each, in lower case; days once each, in order); a person's change
-- stamps who and when and clears the last error; the Worker's stamp (no person) changes only that.
create or replace function public.report_schedule_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is null then
    new.updated_at := old.updated_at;
    new.updated_by := old.updated_by;
    new.created_at := old.created_at;
    return new;
  end if;
  new.name := btrim(new.name);
  if new.name = '' then
    raise exception 'Give the schedule a name' using errcode = '22023';
  end if;
  new.emails := coalesce(array(select distinct lower(btrim(e)) from unnest(new.emails) e where nullif(btrim(e), '') is not null order by 1), '{}');
  if exists (select 1 from unnest(new.emails) e where e !~ '^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$') then
    raise exception 'One of the addresses isn’t an email address' using errcode = '22023';
  end if;
  new.weekdays := coalesce(array(select distinct d from unnest(new.weekdays) d order by 1), '{}');
  new.team := coalesce(array(select distinct p from unnest(new.team) p
    where exists (select 1 from public.profiles x where x.id = p and x.business_id = new.business_id)), '{}');
  new.contacts := coalesce(array(select distinct c from unnest(new.contacts) c
    where exists (select 1 from public.business_contacts x where x.id = c and x.business_id = new.business_id)), '{}');
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.last_sent_at := old.last_sent_at;
  end if;
  new.last_error := null;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
create trigger report_schedules_rules before insert or update on public.report_schedules for each row execute function public.report_schedule_rules();
create trigger audit_report_schedules after insert or update or delete on public.report_schedules for each row execute function public.audit_row();

alter table public.report_schedules enable row level security;
revoke all on public.report_schedules from anon;
create policy report_schedules_admin on public.report_schedules for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
