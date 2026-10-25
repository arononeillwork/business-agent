-- Partners: outside businesses get a read-only login to the areas an admin picks.
--   calendar  holidays and events (not admin-only items)
--   rota      the published rota and approved time off
--   payroll   timecards, breaks and pay rates (e.g. the gestoría doing payroll)
--   finances  the monthly expenses
-- Everyone who is a partner can read the business details and the clock-in rules. Partners never
-- write: every write policy and SQL function already requires staff or admin.
alter table public.profiles
  add column partner_company text,
  add column partner_access text[] not null default '{}'
    check (partner_access <@ array['calendar', 'rota', 'payroll', 'finances']::text[]);

grant select (partner_company, partner_access) on public.profiles to authenticated;
-- No update grant: only admins change them, through set_partner_access().

create or replace function public.is_partner()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select role = 'partner' from public.profiles where id = auth.uid() and active), false);
$$;

create or replace function public.partner_can(p_area text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select role = 'partner' and p_area = any(partner_access)
                     from public.profiles where id = auth.uid() and active), false);
$$;

-- Read-only access, area by area.
create policy business_partner_read on public.business for select to authenticated using (public.is_partner());
create policy settings_partner_read on public.settings for select to authenticated using (public.is_partner());
create policy positions_partner_read on public.positions for select to authenticated using (public.is_partner());
create policy break_types_partner_read on public.break_types for select to authenticated using (public.is_partner());

create policy calendar_partner_read on public.calendar_events for select to authenticated
  using (visibility = 'all' and public.partner_can('calendar'));

create policy shifts_partner_read on public.shifts for select to authenticated
  using (status = 'published' and (public.partner_can('rota') or public.partner_can('payroll')));
create policy time_off_partner_read on public.time_off for select to authenticated
  using (status = 'approved' and (public.partner_can('rota') or public.partner_can('payroll')));

create policy time_entries_partner_read on public.time_entries for select to authenticated
  using (public.partner_can('payroll'));
create policy breaks_partner_read on public.breaks for select to authenticated
  using (public.partner_can('payroll'));
create policy pay_rates_partner_read on public.pay_rates for select to authenticated
  using (public.partner_can('payroll'));

create policy expenses_partner_read on public.expenses for select to authenticated
  using (public.partner_can('finances'));

-- Partners see the team by name only (no email, phone or birth date), and only with rota or
-- payroll access. The profiles table itself shows a partner only their own row.
create or replace function public.partner_team()
returns table (id uuid, full_name text, colour text, role public.app_role, active boolean)
language sql stable security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.colour, p.role, p.active
    from public.profiles p
   where p.role in ('admin', 'employee')
     and (public.partner_can('rota') or public.partner_can('payroll'))
   order by p.full_name;
$$;

-- Admins set a partner's company and areas. Audited through the profiles trigger.
create or replace function public.set_partner_access(p_id uuid, p_company text, p_access text[])
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change partner access';
  end if;
  update public.profiles
     set partner_company = nullif(btrim(p_company), ''),
         partner_access = coalesce(p_access, '{}')
   where id = p_id and role = 'partner';
  if not found then
    raise exception 'That person is not a partner';
  end if;
end;
$$;

-- Invites: the Worker (service key) sets role, company and areas in the invite metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_first   boolean;
  v_invited boolean := new.invited_at is not null;
  v_role    text := new.raw_user_meta_data ->> 'role';
  v_access  text[];
begin
  select not exists (select 1 from public.profiles where role = 'admin') into v_first;
  if v_invited and v_role = 'partner' and not v_first then
    select coalesce(array_agg(a), '{}') into v_access
      from jsonb_array_elements_text(coalesce(new.raw_user_meta_data -> 'partner_access', '[]'::jsonb)) a
     where a in ('calendar', 'rota', 'payroll', 'finances');
  end if;
  insert into public.profiles (id, full_name, email, role, can_see_pay, active, partner_company, partner_access)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    case when v_first then 'admin'::public.app_role
         when v_invited and v_role in ('admin', 'employee', 'kiosk', 'partner') then v_role::public.app_role
         else 'employee'::public.app_role end,
    v_first,
    v_first or v_invited,
    case when v_access is not null then nullif(btrim(new.raw_user_meta_data ->> 'partner_company'), '') end,
    coalesce(v_access, '{}')
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_partner(), public.partner_can(text), public.partner_team(),
  public.set_partner_access(uuid, text, text[]) from public, anon;
grant execute on function public.is_partner(), public.partner_can(text), public.partner_team(),
  public.set_partner_access(uuid, text, text[]) to authenticated;
