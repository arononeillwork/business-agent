-- The weekly routine: what's done on set days (the stock take and buying list, the cleaner's run, the
-- supplier price check, the accounts talk with the gestoría, the business meeting…), each in a category,
-- on one or more weekdays, every week or every few weeks, or one week of the month (the first Monday),
-- with its time slot, who does it (someone on the team or a role from Roles & responsibilities), a short
-- checklist and notes. The Calendar shows each day's under its theme, filtered by category; an admin
-- switches one off for everyone, and anyone can tick one done for the day.
-- Who: the team reads it and ticks things done; admins change it. Partners and the café tablet see none.

create table public.routine_items (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 80),
  category     text not null check (category in ('stock', 'cleaning', 'suppliers', 'accounts', 'meetings', 'maintenance', 'marketing', 'team')),
  -- The days of the week it's on: 1 Monday … 7 Sunday.
  weekdays     smallint[] not null check (cardinality(weekdays) between 1 and 7 and weekdays <@ '{1,2,3,4,5,6,7}'::smallint[]),
  -- Every week (1), or every few weeks counted from the week it starts; or only one week of the month:
  -- the first (1) to fourth (4) of those weekdays, or the last (5).
  every_weeks  smallint not null default 1 check (every_weeks between 1 and 8),
  month_week   smallint check (month_week between 1 and 5),
  starts_on    date not null default current_date,
  starts_at    time,
  ends_at      time,
  profile_id   uuid references public.profiles on delete set null,
  job_role_id  uuid references public.job_roles on delete set null,
  checklist    text[] not null default '{}' check (cardinality(checklist) <= 30),
  notes        text check (char_length(notes) <= 1000),
  active       boolean not null default true,
  sort         int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users on delete set null default auth.uid(),
  constraint routine_items_month_week check (month_week is null or every_weeks = 1),
  constraint routine_items_slot check (ends_at is null or (starts_at is not null and ends_at > starts_at)),
  constraint routine_items_one_owner check (profile_id is null or job_role_id is null)
);
select public.add_business_scope('public.routine_items');

-- Tidy what's typed; whoever does it is on this business's team, the role one of its roles. With the
-- caller's rights, filtered by the row's business for the Worker.
create or replace function public.routine_item_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.notes := nullif(btrim(new.notes), '');
  new.checklist := coalesce((select array_agg(btrim(l) order by n) from unnest(new.checklist) with ordinality u(l, n) where btrim(l) <> ''), '{}');
  if exists (select 1 from unnest(new.checklist) l where char_length(l) > 200) then
    raise exception 'Keep each thing on the checklist to 200 characters' using errcode = '22023';
  end if;
  new.weekdays := (select array_agg(distinct w order by w) from unnest(new.weekdays) w);
  if new.profile_id is not null and not exists (select 1 from public.profiles p
       where p.id = new.profile_id and p.business_id = new.business_id and p.role in ('admin', 'employee')) then
    raise exception 'Pick someone on the team' using errcode = '22023';
  end if;
  if new.job_role_id is not null and not exists (select 1 from public.job_roles r where r.id = new.job_role_id and r.business_id = new.business_id) then
    raise exception 'Pick one of your roles' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
create trigger routine_items_rules before insert or update on public.routine_items for each row execute function public.routine_item_rules();
create trigger audit_routine_items after insert or update or delete on public.routine_items for each row execute function public.audit_row();

alter table public.routine_items enable row level security;
revoke all on public.routine_items from anon;
create policy routine_items_read on public.routine_items for select to authenticated using ((select public.is_staff()));
create policy routine_items_admin on public.routine_items for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Done for the day: anyone on the team ticks an activity done for a date; whoever ticked it, or an
-- admin, unticks it.
create table public.routine_done (
  item_id  uuid not null references public.routine_items on delete cascade,
  day      date not null,
  done_by  uuid references public.profiles on delete set null default auth.uid(),
  done_at  timestamptz not null default now()
);
select public.add_business_scope('public.routine_done');
alter table public.routine_done add primary key (business_id, item_id, day);

create or replace function public.routine_done_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from public.routine_items r where r.id = new.item_id and r.business_id = new.business_id) then
    raise exception 'That activity isn''t on the routine' using errcode = '22023';
  end if;
  -- Ticked by whoever is signed in, now (the Worker and the SQL editor keep what they give).
  if auth.uid() is not null then new.done_by := auth.uid(); end if;
  new.done_at := now();
  return new;
end $$;
create trigger routine_done_rules before insert or update on public.routine_done for each row execute function public.routine_done_rules();

alter table public.routine_done enable row level security;
revoke all on public.routine_done from anon;
create policy routine_done_read on public.routine_done for select to authenticated using ((select public.is_staff()));
create policy routine_done_tick on public.routine_done for insert to authenticated with check ((select public.is_staff()));
create policy routine_done_untick on public.routine_done for delete to authenticated
  using ((select public.is_staff()) and (done_by = (select auth.uid()) or (select public.is_admin())));

-- ---------------------------------------------------------------------------
-- Easy Beans (business 1): a café's usual week, for the owner to change or switch off
-- ---------------------------------------------------------------------------
-- Closed Sunday: nothing then. Whoever does each is a role of that name when Easy Beans has one (the
-- Shop Manager, the Cleaner, the Head Barista, the Business Manager). Nothing is added twice, and without
-- business 1 nothing at all.
do $$
begin
  if not exists (select 1 from public.business where id = 1) then return; end if;
  insert into public.routine_items (business_id, name, category, weekdays, month_week, starts_on, starts_at, ends_at, job_role_id, checklist, notes, sort)
  select 1, r.name, r.category, r.weekdays::smallint[], r.month_week, date '2026-11-02', r.starts_at::time, r.ends_at::time,
         (select j.id from public.job_roles j where j.business_id = 1 and j.name ~* r.role order by j.sort, j.name limit 1),
         r.checklist::text[], r.notes, r.sort
    from (values
      ('Stock take and buying list', 'stock', '{1}', null::smallint, '09:00', '09:45', '^shop manager',
        '{"Count the coffee, milk, cups and lids","Check the fridges and the pastry order","Add what''s low to the order list on Stock"}', null, 1),
      ('Wholesale order and cash and carry run', 'suppliers', '{1}', null, '10:00', '11:30', '^shop manager',
        '{"Check the order list against what''s in","Order from the wholesaler or do the GM Cash & Carry / Transgourmet run","Put the delivery away and record it on Stock"}', null, 2),
      ('Weekly business meeting', 'meetings', '{1}', null, '15:30', '16:30', null,
        '{"Last week''s takings and costs","What''s on this week","Anything from the team"}', null, 3),
      ('Licence and insurance check', 'accounts', '{1}', 1, '11:30', '12:00', '^business manager',
        '{"Anything running out on Legal & licences","Insurance, extinguishers and the electrical check"}', 'First Monday of the month.', 4),
      ('Supplier and wholesale price check', 'suppliers', '{2}', null, '10:00', '10:30', '^shop manager',
        '{"Look at what went up on Wholesale","Compare the main items with another supplier"}', null, 5),
      ('Deep clean (cleaner)', 'cleaning', '{3}', null, '18:00', '20:00', '^cleaner',
        '{"Floors, toilets and the terrace","Behind the counter and under the machines","Bins out"}', 'After close.', 6),
      ('Social content planning', 'marketing', '{3}', null, '11:00', '12:00', null,
        '{"Plan next week''s posts and stories on the Social planner","Photos of the theme days and specials"}', null, 7),
      ('Coffee order for the weekend', 'stock', '{4}', null, '10:00', '10:30', '^head barista',
        '{"Beans for both roasts and the guest coffee","Order from the roaster in time for Saturday"}', null, 8),
      ('Accounts talk with the gestoría', 'accounts', '{5}', null, '10:00', '11:00', '^business manager',
        '{"Invoices in and paid","Till reconciliation for the week","Anything the gestoría needs"}', null, 9),
      ('Weekend prep and next week''s rota', 'team', '{5}', null, '15:00', '15:30', '^shop manager',
        '{"Next week''s rota checked and published","Weekend stock and the pastry order"}', null, 10),
      ('Coffee machine deep clean', 'maintenance', '{6}', null, '18:00', '18:45', '^head barista',
        '{"Backflush the group heads","Clean the grinder burrs and hopper","Soak the portafilters and baskets"}', 'After close.', 11),
      ('Fridge temperature log review', 'maintenance', '{6}', null, '17:30', '17:45', '^shop manager',
        '{"Every fridge and the freezer recorded this week on Food safety","Anything out of range dealt with"}', null, 12)
    ) r(name, category, weekdays, month_week, starts_at, ends_at, role, checklist, notes, sort)
   where not exists (select 1 from public.routine_items x where x.business_id = 1 and lower(x.name) = lower(r.name));
end $$;
