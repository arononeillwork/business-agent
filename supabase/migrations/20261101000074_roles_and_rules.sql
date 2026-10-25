-- Roles & responsibilities and Staff rules (Team section).
-- - job_roles: who does what (shared/roles.ts). Each role says what it's for, the role it answers to,
--   who's in it, the rota position it's worked as, and its duties in groups: core responsibilities,
--   also part of the role, or done at a set time ([{"when": "core", "text": "Machine care"}, …]).
--   The team reads; admins write.
-- - staff_rules: the house rules, in sections, each a list of rules (shared/staffRules.ts). The team
--   reads; admins write. A section's updated_at moves only when what it says changes (not its place
--   in the list), so moving one doesn't ask everyone to read them again.
-- - staff_rules_read: when each person last confirmed they'd read the rules, through
--   read_staff_rules(). They read their own; admins everyone's, to see who hasn't since a change.

create table public.job_roles (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 80),
  summary      text check (char_length(summary) <= 1000),
  position_id  int references public.positions on delete set null,
  reports_to   uuid references public.job_roles on delete set null,
  people       uuid[] not null default '{}',
  duties       jsonb not null default '[]' check (jsonb_typeof(duties) = 'array' and jsonb_array_length(duties) <= 60),
  sort         int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users on delete set null default auth.uid(),
  constraint job_roles_not_own_lead check (reports_to is distinct from id)
);
create unique index job_roles_name_key on public.job_roles (lower(name));

create or replace function public.job_role_rules() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.summary := nullif(btrim(new.summary), '');
  if jsonb_typeof(new.duties) is distinct from 'array' then raise exception 'Duties must be a list'; end if;
  if exists (select 1 from jsonb_array_elements(new.duties) e
             where jsonb_typeof(e) <> 'object' or jsonb_typeof(e->'text') is distinct from 'string'
                or (e->>'when') is null or (e->>'when') not in ('core', 'also', 'opening', 'service', 'closing', 'weekly')) then
    raise exception 'Each duty needs its text and group: core, also, opening, service, closing or weekly';
  end if;
  -- Trimmed, and blank ones left out.
  new.duties := coalesce((select jsonb_agg(jsonb_build_object('when', e->>'when', 'text', btrim(e->>'text')) order by i)
                            from jsonb_array_elements(new.duties) with ordinality x(e, i)
                           where btrim(e->>'text') <> ''), '[]');
  if exists (select 1 from jsonb_array_elements(new.duties) e where char_length(e->>'text') > 300) then
    raise exception 'Keep each duty to 300 characters';
  end if;
  -- Only people on the team can be added. Someone already in it who has since left the team (their
  -- account removed, or now a partner) just drops out, so the role can still be changed or moved.
  if exists (select 1 from unnest(new.people) p
             where not exists (select 1 from public.profiles where id = p and role in ('admin', 'employee'))
               and (tg_op = 'INSERT' or not p = any(old.people))) then
    raise exception 'Only people on the team can be given a role';
  end if;
  -- Each person once, in the order given.
  new.people := coalesce(array(select p from unnest(new.people) with ordinality u(p, i)
                                where exists (select 1 from public.profiles where id = p and role in ('admin', 'employee'))
                                group by p order by min(i)), '{}');
  if new.reports_to = new.id then raise exception 'A role can’t answer to itself'; end if;
  if new.reports_to is not null and exists (
    with recursive up (id, depth) as (
      select reports_to, 1 from public.job_roles where id = new.reports_to
      union all
      select r.reports_to, up.depth + 1 from public.job_roles r join up on r.id = up.id where up.depth < 100
    )
    select 1 from up where id = new.id
  ) then
    raise exception 'A role can’t answer to one that answers to it';
  end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger job_roles_rules before insert or update on public.job_roles for each row execute function public.job_role_rules();
create trigger audit_job_roles after insert or update or delete on public.job_roles for each row execute function public.audit_row();

alter table public.job_roles enable row level security;
revoke all on public.job_roles from anon;
create policy job_roles_read on public.job_roles for select to authenticated using ((select public.is_staff()));
create policy job_roles_admin on public.job_roles for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create table public.staff_rules (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 120),
  intro       text check (char_length(intro) <= 1000),
  rules       jsonb not null check (jsonb_typeof(rules) = 'array' and jsonb_array_length(rules) between 1 and 50),
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users on delete set null default auth.uid()
);

create or replace function public.staff_rule_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  new.intro := nullif(btrim(new.intro), '');
  if jsonb_typeof(new.rules) is distinct from 'array'
     or exists (select 1 from jsonb_array_elements(new.rules) r where jsonb_typeof(r) <> 'string') then
    raise exception 'Rules must be a list of text';
  end if;
  new.rules := coalesce((select jsonb_agg(btrim(r #>> '{}') order by i) from jsonb_array_elements(new.rules) with ordinality x(r, i)
                          where btrim(r #>> '{}') <> ''), '[]');
  if exists (select 1 from jsonb_array_elements_text(new.rules) r where char_length(r) > 500) then
    raise exception 'Keep each rule to 500 characters';
  end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    -- Only a change to what it says counts as a change (everyone's asked to read the rules again).
    if (new.title, new.intro, new.rules) is not distinct from (old.title, old.intro, old.rules) then
      new.updated_at := old.updated_at;
      new.updated_by := old.updated_by;
      return new;
    end if;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger staff_rules_rules before insert or update on public.staff_rules for each row execute function public.staff_rule_rules();
create trigger audit_staff_rules after insert or update or delete on public.staff_rules for each row execute function public.audit_row();

alter table public.staff_rules enable row level security;
revoke all on public.staff_rules from anon;
create policy staff_rules_read on public.staff_rules for select to authenticated using ((select public.is_staff()));
create policy staff_rules_admin on public.staff_rules for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create table public.staff_rules_read (
  profile_id  uuid primary key references public.profiles on delete cascade,
  read_at     timestamptz not null default now()
);
alter table public.staff_rules_read enable row level security;
revoke all on public.staff_rules_read from anon;
revoke insert, update, delete on public.staff_rules_read from authenticated;
create policy staff_rules_read_own on public.staff_rules_read for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_admin()));

-- "I've read the rules": now, for the person signed in.
create or replace function public.read_staff_rules()
returns timestamptz
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  insert into public.staff_rules_read (profile_id, read_at) values (auth.uid(), now())
  on conflict (profile_id) do update set read_at = excluded.read_at;
  return now();
end;
$$;
revoke execute on function public.read_staff_rules() from public, anon;
grant execute on function public.read_staff_rules() to authenticated;
