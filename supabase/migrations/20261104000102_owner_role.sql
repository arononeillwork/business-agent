-- The boss / CEO is called the owner now (shared/teamRoles.ts). Only the words change: an owner is
-- still an admin who sees pay and finances, and the rules are the `team_roles` migration's, as the
-- `several_businesses` migration left them. This is that function with "owner" in its message.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.business_id is distinct from old.business_id
     and coalesce(public.request_role(), 'service_role') <> 'service_role'
     and coalesce(current_setting('app.business_setup', true), '') <> 'on' then
    raise exception 'Someone''s business can''t be changed here';
  end if;
  if coalesce(current_setting('app.business_setup', true), '') = 'on' then return new; end if;
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
    raise exception 'Only an owner can make someone an owner or change an owner''s role';
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
alter function public.guard_profile_update() owner to app_definer;
revoke execute on function public.guard_profile_update() from public, anon, authenticated;
