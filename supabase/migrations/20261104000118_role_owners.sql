-- Who owns each role (Roles & responsibilities → Ownership): the owners share the business's roles
-- between them, each role in one owner's lane, or not owned yet, in the order they put them
-- (shared/roleOwners.ts). The team reads it with the roles. Only an owner (an admin with pay access)
-- changes it, and a role can only be owned by an active owner of its own business; the server's own
-- code (no signed-in user) may change it too, as for the other guarded columns. Someone who leaves
-- the team leaves their roles not owned.

alter table public.job_roles
  add column owned_by uuid references public.profiles on delete set null,
  add column owner_sort int not null default 0;
create index if not exists job_roles_owned_by_idx on public.job_roles (owned_by);

create or replace function public.job_role_owner_rules() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and (new.owned_by is not null or new.owner_sort <> 0))
     or (tg_op = 'UPDATE' and (new.owned_by is distinct from old.owned_by or new.owner_sort is distinct from old.owner_sort)) then
    if auth.uid() is not null and not public.can_see_pay() then
      raise exception 'Only an owner decides who owns a role';
    end if;
  end if;
  if new.owned_by is not null and (tg_op = 'INSERT' or new.owned_by is distinct from old.owned_by) and not exists (
    select 1 from public.profiles p
     where p.id = new.owned_by and p.business_id = new.business_id and p.role = 'admin' and p.can_see_pay and p.active
  ) then
    raise exception 'Only an owner of the business can own a role';
  end if;
  return new;
end $$;
alter function public.job_role_owner_rules() owner to app_definer;
revoke execute on function public.job_role_owner_rules() from public, anon, authenticated;
create trigger job_roles_owner before insert or update of owned_by, owner_sort on public.job_roles
  for each row execute function public.job_role_owner_rules();
