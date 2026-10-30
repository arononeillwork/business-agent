-- Someone on the team who isn't worked into the rota (an owner, or the business's own login): they
-- still sign in and use the app, but the rota doesn't give them a row or offer them for a shift.
-- Only an admin takes someone off the rota or puts them back (Team); the server's own code (no
-- signed-in user) may too, as for the other guarded columns (the `service_role_admin` migration).

alter table public.profiles add column on_rota boolean not null default true;
grant select (on_rota) on public.profiles to authenticated;
grant update (on_rota) on public.profiles to authenticated;

create or replace function public.guard_on_rota() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.on_rota is distinct from old.on_rota and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only an admin takes someone off the rota or puts them back';
  end if;
  return new;
end $$;
revoke execute on function public.guard_on_rota() from public, anon, authenticated;
create trigger profiles_on_rota before update of on_rota on public.profiles
  for each row execute function public.guard_on_rota();
