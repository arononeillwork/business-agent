-- Server-side code using the service key (invites, test setup) has no signed-in user
-- (auth.uid() is null) and may manage profiles. Browser users always have a uid, and the
-- anon role has no grants on profiles, so this does not open anything to the public.
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
