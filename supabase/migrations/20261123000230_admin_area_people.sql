-- The admin area (/admin, the admin_area and admin_area_sections migrations), more of it:
--
-- 1. Each contact on the sales board is a kind of business: a café, a restaurant, a barber, a garage, a
--    financial firm or something else, so the board can be shown by kind. Every card so far is a café's (the board was cafés only); a
--    business that signs up with a salesperson's code gets the kind it signed up as.
-- 2. People: everyone involved in The Business Agent, who reports to whom, its substitutes bench and its
--    investors; each with labels of their own ("C TWO").
-- 3. HQ's to start: the people, Ryan, Mark, Mum and Aron on the sales team (a lane and a code each), the
--    contacts they're talking to, and a job on HQ's to-do list. (The admin area's to-do list is dragged
--    into order with todos.position, the To-do page's own order: nothing new for it here.)
--
-- All of it is Business Agent HQ's own rows, reached only through the Worker (worker/adminArea.ts).
-- The code live before this never names the new column or table.

-- ---------------------------------------------------------------------------
-- 1. The kind of business a contact is
-- ---------------------------------------------------------------------------
alter table public.sales_prospects
  add column business_type text not null default 'cafe' check (business_type in ('cafe', 'restaurant', 'barber', 'garage', 'financial', 'other'));

-- As the admin_area_sections migration has it, and a new card is the kind of business that signed up
-- (a pub is with the restaurants; a salon or an estate agent is something else).
create or replace function public.sales_board_from_introduction() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_member  uuid;
  v_card    uuid;
begin
  begin
    select id into v_member from public.sales_team where business_id = new.business_id and rep_id = new.rep_id and new.rep_id is not null;
    select id into v_card from public.sales_prospects where business_id = new.business_id and introduction_id = new.id;
    if v_card is null then
      select id into v_card from public.sales_prospects
       where business_id = new.business_id and introduction_id is null and public.sales_name_key(name) = public.sales_name_key(new.name)
       order by (member_id is not distinct from v_member) desc, created_at limit 1;
      if v_card is null then
        insert into public.sales_prospects (business_id, member_id, name, stage, introduction_id, business_type)
        values (new.business_id, v_member, left(new.name, 120), 'trial', new.id,
                case new.kind when 'cafe' then 'cafe' when 'restaurant' then 'restaurant' when 'pub' then 'restaurant' else 'other' end)
        returning id into v_card;
      else
        update public.sales_prospects
           set introduction_id = new.id, member_id = coalesce(member_id, v_member),
               stage = case when stage = 'won' then stage else 'trial' end
         where id = v_card;
      end if;
      insert into public.sales_activity (business_id, prospect_id, kind, note)
      values (new.business_id, v_card, 'signed_up', 'Signed up with the code ' || new.code);
    end if;
    if new.first_paid_at is not null and (tg_op = 'INSERT' or old.first_paid_at is null) then
      update public.sales_prospects set stage = 'won' where id = v_card and stage <> 'won';
      insert into public.sales_activity (business_id, prospect_id, kind, note) values (new.business_id, v_card, 'paid', 'First payment');
    end if;
  exception when others then
    raise warning 'The sales board couldn''t follow % (%): %', new.name, new.id, sqlerrm;
  end;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. People: who reports to whom, the substitutes bench and the investors
-- ---------------------------------------------------------------------------
create table public.admin_people (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  -- What they do: "CEO", "Café Salesperson".
  role       text check (char_length(role) <= 80),
  -- On the team, on the substitutes bench (ready to step in), or an investor. The bench and the
  -- investors are beside the team, not in it: they report to nobody, and nobody to them.
  kind       text not null default 'team' check (kind in ('team', 'bench', 'investor')),
  -- Whom they report to (none: the top, as the CEO). Checked when the change is saved, so someone who
  -- leaves can first pass whoever reported to them up (below).
  reports_to uuid references public.admin_people deferrable initially deferred,
  -- Their order among the others reporting to the same person.
  position   int not null default 0,
  -- Labels of their own, as typed ("C TWO"): tidied, each once.
  labels     text[] not null default '{}' check (cardinality(labels) <= 10),
  created_at timestamptz not null default now(),
  check (reports_to is distinct from id)
);
select public.add_business_scope('public.admin_people');
create index admin_people_reports_to_idx on public.admin_people (reports_to);
alter table public.admin_people enable row level security;
revoke all on public.admin_people from anon, authenticated;

-- Tidied; someone reports to someone on the team in the same business, never to the bench, an investor or to
-- someone who (in the end) reports to them. Whatever writes the row (the Worker, the SQL editor).
create or replace function public.admin_people_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  new.role := nullif(btrim(regexp_replace(new.role, '\s+', ' ', 'g')), '');
  new.labels := coalesce((select array_agg(l order by n) from (
      select distinct on (lower(l)) l, n from unnest(new.labels) with ordinality u(raw, n)
        cross join lateral (select left(btrim(regexp_replace(raw, '\s+', ' ', 'g')), 40) as l) x
       where l <> '' order by lower(l), n) d), '{}');
  if new.kind <> 'team' then new.reports_to := null; end if;
  if new.reports_to is not null then
    if not exists (select 1 from public.admin_people where id = new.reports_to and business_id = new.business_id and kind = 'team') then
      raise exception 'Choose someone on the team to report to' using errcode = 'check_violation';
    end if;
    if tg_op = 'UPDATE' and exists (
      with recursive up as (
        select id, reports_to, 1 as depth from public.admin_people where id = new.reports_to
        union all
        select p.id, p.reports_to, up.depth + 1 from public.admin_people p join up on p.id = up.reports_to where up.depth < 100
      ) select 1 from up where id = new.id) then
      raise exception 'They can''t report to someone who reports to them' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger admin_people_rules before insert or update on public.admin_people
  for each row execute function public.admin_people_rules();

-- Someone who leaves: whoever reported to them reports to whom they reported to (or higher, when that
-- one leaves too). After the whole delete, so taking many off at once (a business deleted) works.
create or replace function public.admin_people_move_up() returns trigger
language plpgsql set search_path = ''
as $$
declare
  r      record;
  v_boss uuid;
  v_n    int;
begin
  for r in select p.id, p.reports_to from public.admin_people p where p.reports_to in (select g.id from gone g) loop
    v_boss := r.reports_to;
    v_n := 0;
    while v_boss is not null and v_n < 100 and exists (select 1 from gone g where g.id = v_boss) loop
      v_boss := (select g.reports_to from gone g where g.id = v_boss);
      v_n := v_n + 1;
    end loop;
    update public.admin_people set reports_to = v_boss where id = r.id;
  end loop;
  return null;
end $$;
create trigger admin_people_leaves after delete on public.admin_people
  referencing old table as gone for each statement execute function public.admin_people_move_up();

-- Someone on the team who goes to the bench or becomes an investor: whoever reported to them reports to whom
-- they reported to.
create or replace function public.admin_people_invest() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.kind <> 'team' and old.kind = 'team' then
    update public.admin_people set reports_to = old.reports_to where reports_to = new.id and business_id = new.business_id;
  end if;
  return null;
end $$;
create trigger admin_people_invests after update of kind on public.admin_people
  for each row execute function public.admin_people_invest();

-- ---------------------------------------------------------------------------
-- 3. HQ's to start
-- ---------------------------------------------------------------------------
-- Once, for HQ (a brand-new database runs it after start_admin_area_sections()). Nothing already there
-- is changed: the people only when there are none; a salesperson only when nobody on the sales team has
-- that first name; a contact only when its Instagram, or its name, isn't on the board; the job only when
-- it isn't on the list.
create or replace function public.start_admin_area_people() returns void
language plpgsql set search_path = ''
as $$
declare
  v_hq int := (select id from public.business where is_hq);
  v_id uuid;
  v_name text;
  r record;
begin
  if v_hq is null then return; end if;
  perform set_config('app.business_id', v_hq::text, true);

  if not exists (select 1 from public.admin_people where business_id = v_hq) then
    for r in select * from (values
        (1, 'Aron', 'CEO', 'team', null, '{}'::text[]),
        (2, 'Alejandro', 'Head of Product / Sales Manager', 'team', 'Aron', '{C TWO}'),
        (3, 'Ryan', 'Salesperson', 'team', 'Alejandro', '{}'),
        (4, 'Mark', 'Salesperson', 'team', 'Alejandro', '{}'),
        (5, 'Julio', 'Café Salesperson', 'team', 'Alejandro', '{}'),
        (6, 'Maria', 'Café Salesperson', 'team', 'Alejandro', '{}'),
        (7, 'Kim', 'Head of Marketing', 'team', 'Aron', '{C TWO}'),
        (8, 'Zoe', 'Engineer', 'team', 'Aron', '{}'),
        (9, 'Giorgos', 'Investor', 'investor', null, '{}'),
        (10, 'Ollie', 'Investor', 'investor', null, '{}'),
        (11, 'Adrian Goulding', 'Sales Manager', 'bench', null, '{C TWO}'),
        (12, 'Jesus Maria Herruzo Luque', 'Engineer', 'bench', null, '{C TWO}'),
        (13, 'Antonio Trupac', 'Engineer / AI Guru', 'bench', null, '{C TWO}'),
        (14, 'Cathrine Naess', 'Head of People, organises everything', 'bench', null, '{C TWO}')) p(n, name, role, kind, boss, labels)
      order by p.n
    loop
      insert into public.admin_people (business_id, name, role, kind, position, labels, reports_to)
      values (v_hq, r.name, r.role, r.kind, r.n, r.labels,
              (select id from public.admin_people where business_id = v_hq and name = r.boss));
    end loop;
  end if;

  foreach v_name in array array['Ryan', 'Mark', 'Mum', 'Aron'] loop
    if not exists (select 1 from public.sales_team where business_id = v_hq and lower(split_part(btrim(name), ' ', 1)) = lower(v_name)) then
      insert into public.sales_team (business_id, name, position)
      values (v_hq, v_name, (select coalesce(max(position), 0) + 1 from public.sales_team where business_id = v_hq))
      returning id into v_id;
      perform public.admin_area_give_code(v_id);
    end if;
  end loop;

  for r in select * from (values
      ('Julio', 'Al Andalus Roasters', 'alandalusroasters', null, 'partner', 'cafe', null),
      ('Julio', 'Sovaz Spain', 'sovaz.spain', null, 'customer', 'cafe', null),
      ('Mark', 'The DPF Centre', 'thedpfcentre', null, 'customer', 'garage', null),
      ('Mark', 'Piccolina Grand Cafe', 'piccolinagrandcafe', null, 'customer', 'cafe', null),
      ('Mark', 'Moca Marbella', 'mocamarbella', null, 'customer', 'cafe', null),
      ('Mark', 'Cocobrew', 'cocobrew_', null, 'customer', 'cafe', null),
      ('Mark', 'Aora Beauty Marbella', 'aorabeautymarbella', null, 'customer', 'other', null),
      ('Ryan', 'Pan Bendito Bakehouse', 'panbendito_bakehouse', null, 'customer', 'cafe', null),
      ('Ryan', 'Charliebyb', 'charliebyb', null, 'customer', 'barber', null),
      ('Mum', 'The Juice Jar', null, 'https://www.juicejar.com', 'customer', 'cafe', '10 franchise locations'),
      ('Aron', 'Empowered Money', null, 'https://www.linkedin.com/company/empowered-money/home/', 'customer', 'financial', null)) c(who, name, instagram, website, kind, business_type, notes)
  loop
    if not exists (select 1 from public.sales_prospects
                    where business_id = v_hq and (instagram = r.instagram or public.sales_name_key(name) = public.sales_name_key(r.name))) then
      insert into public.sales_prospects (business_id, member_id, name, instagram, website, kind, business_type, notes)
      values (v_hq, (select id from public.sales_team where business_id = v_hq and lower(split_part(btrim(name), ' ', 1)) = lower(r.who)
                      order by position limit 1),
              r.name, r.instagram, r.website, r.kind, r.business_type, r.notes);
    end if;
  end loop;

  -- On HQ's to-do list (the admin area's To-do, and the app's To-do page signed in as HQ), at the top.
  if not exists (select 1 from public.todos where business_id = v_hq and lower(title) = 'register a tax-free residency') then
    insert into public.todos (business_id, title, category_id, position)
    values (v_hq, 'Register a tax-free residency',
            (select id from public.todo_categories where business_id = v_hq and lower(btrim(name)) = 'legal & money' order by sort limit 1),
            (select least(0, coalesce(min(position), 0)) - 1 from public.todos where business_id = v_hq));
  end if;
  perform set_config('app.business_id', '', true);
end $$;
revoke execute on function public.start_admin_area_people() from public, anon, authenticated, service_role;

select public.start_admin_area_people();
