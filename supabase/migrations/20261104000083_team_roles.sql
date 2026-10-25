-- Team roles: employee, shop manager and boss (the CEO or owner). They're kept as the access the
-- database already checks: a boss is an admin who sees pay and finances (can_see_pay), a shop manager
-- an admin who doesn't. What's new is who may hand that out. Before, any admin could give pay access,
-- so a shop manager could make themselves or anyone else a boss, or demote or switch off the boss.
-- Now only a boss can make someone a boss or change a boss's role or switch them off, unless the
-- business has no active boss at all, so it can never get stuck without one. The other rules are as
-- before; the service role (auth.uid() is null) meets only the ones about keeping an admin.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role
       or new.can_see_pay is distinct from old.can_see_pay
       or new.active is distinct from old.active
       or (new.pin_hash is distinct from old.pin_hash and old.id <> auth.uid()) then
      raise exception 'Only an admin can change role, pay access, status or PIN';
    end if;
  end if;
  if auth.uid() is not null and not public.can_see_pay()
     and (new.can_see_pay is distinct from old.can_see_pay
          or (old.role = 'admin' and old.can_see_pay and (new.role is distinct from old.role or new.active is distinct from old.active)))
     and exists (select 1 from public.profiles where role = 'admin' and can_see_pay and active) then
    raise exception 'Only a boss can make someone a boss or change a boss''s role';
  end if;
  if old.id = auth.uid() and old.active and not new.active then
    raise exception 'You can''t switch off your own account. Ask another admin.';
  end if;
  if old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active) then
    if not exists (select 1 from public.profiles
                   where role = 'admin' and active and id <> old.id) then
      raise exception 'At least one admin must remain';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_profile_update() from public, anon, authenticated;
