-- Food safety (the APPCC's records): what's checked (food_safety_points: a fridge's temperature, a
-- cleaning job) and every check done (food_safety_checks), by whom and at what time (the server's),
-- with what was done when a reading was out of range. Checks are never changed or deleted: a
-- mistake is put right with another check. Admins hear in the bell when a reading is out of range.
-- Who: the team records checks and reads them; admins set what's checked.

create table public.food_safety_points (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 120),
  kind          text not null default 'temperature' check (kind in ('temperature', 'task')),
  -- Temperatures only (°C); either end can be open (a freezer has only a highest).
  min_temp      numeric(5, 1) check (min_temp between -60 and 150),
  max_temp      numeric(5, 1) check (max_temp between -60 and 150),
  frequency     text not null default 'daily' check (frequency in ('twice_daily', 'daily', 'weekly', 'monthly')),
  area          text check (char_length(area) <= 60),
  instructions  text check (char_length(instructions) <= 1000),
  active        boolean not null default true,
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint food_safety_points_limits check (kind = 'temperature' or (min_temp is null and max_temp is null)),
  constraint food_safety_points_order check (min_temp is null or max_temp is null or min_temp <= max_temp)
);

create table public.food_safety_checks (
  id          uuid primary key default gen_random_uuid(),
  point_id    uuid not null references public.food_safety_points on delete restrict,
  checked_at  timestamptz not null default now(),
  reading     numeric(5, 1) check (reading between -60 and 150),
  -- In range, or the job done (set here).
  ok          boolean not null default true,
  -- What was done when it wasn't.
  action      text check (char_length(action) <= 500),
  note        text check (char_length(note) <= 500),
  by          uuid references auth.users on delete set null default auth.uid()
);
create index food_safety_checks_point_idx on public.food_safety_checks (point_id, checked_at desc);
create index food_safety_checks_at_idx on public.food_safety_checks (checked_at desc);

create or replace function public.food_safety_point_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.food_safety_checks where point_id = old.id) then
      raise exception 'It has checks recorded, which are kept: switch it off instead';
    end if;
    return old;
  end if;
  new.name := btrim(new.name);
  new.area := nullif(btrim(new.area), '');
  new.instructions := nullif(btrim(new.instructions), '');
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger food_safety_points_rules before insert or update or delete on public.food_safety_points
  for each row execute function public.food_safety_point_rules();
create trigger audit_food_safety_points after insert or update or delete on public.food_safety_points for each row execute function public.audit_row();

create or replace function public.food_safety_check_rules() returns trigger
language plpgsql set search_path = ''
as $$
declare p public.food_safety_points;
begin
  select * into p from public.food_safety_points where id = new.point_id;
  if not found or not p.active then raise exception 'That check is switched off'; end if;
  new.action := nullif(btrim(new.action), '');
  new.note := nullif(btrim(new.note), '');
  -- Server time only, and whoever is signed in.
  new.checked_at := now();
  if auth.uid() is not null then new.by := auth.uid(); end if;
  if p.kind = 'temperature' then
    if new.reading is null then raise exception 'Enter what it read'; end if;
    new.ok := (p.min_temp is null or new.reading >= p.min_temp) and (p.max_temp is null or new.reading <= p.max_temp);
    if not new.ok and new.action is null then raise exception 'Out of range: say what was done about it'; end if;
  else
    new.reading := null;
    new.ok := true;
  end if;
  return new;
end $$;
create trigger food_safety_checks_rules before insert on public.food_safety_checks
  for each row execute function public.food_safety_check_rules();

-- Out of range: every active admin hears, with what was done.
create or replace function public.food_safety_alert() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.notifications (profile_id, title, body, link)
  select p.id, 'Out of range: ' || (select name from public.food_safety_points where id = new.point_id) || ' ' || to_char(new.reading, 'FM990.0') || ' °C',
         new.action, '/food-safety'
    from public.profiles p where p.role = 'admin' and p.active;
  return null;
end $$;
revoke execute on function public.food_safety_alert() from public, anon, authenticated;
create trigger food_safety_checks_alert after insert on public.food_safety_checks
  for each row when (not new.ok) execute function public.food_safety_alert();

alter table public.food_safety_points enable row level security;
alter table public.food_safety_checks enable row level security;
revoke all on public.food_safety_points, public.food_safety_checks from anon;
create policy food_safety_points_read on public.food_safety_points for select to authenticated using ((select public.is_staff()));
create policy food_safety_points_admin on public.food_safety_points for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy food_safety_checks_read on public.food_safety_checks for select to authenticated using ((select public.is_staff()));
create policy food_safety_checks_add on public.food_safety_checks for insert to authenticated
  with check ((select public.is_staff()) and by = (select auth.uid()));
