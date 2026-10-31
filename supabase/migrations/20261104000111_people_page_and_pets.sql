-- The People page shows the team's people. A login that isn't one of them (the business's own shared
-- login, like Easy Beans' "Owner", easybeanscafe@gmail.com, which signs in as an owner but whose
-- owners are Aron and Mark) can be left off it: it still signs in and does everything it did.
-- Only an admin leaves someone off People or puts them back (Team); the server's own code (no
-- signed-in user) may too, as for on_rota (the `off_the_rota` migration).

alter table public.profiles add column on_people boolean not null default true;
grant select (on_people) on public.profiles to authenticated;
grant update (on_people) on public.profiles to authenticated;

create or replace function public.guard_on_people() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.on_people is distinct from old.on_people and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only an admin leaves someone off the People page or puts them back';
  end if;
  return new;
end $$;
revoke execute on function public.guard_on_people() from public, anon, authenticated;
create trigger profiles_on_people before update of on_people on public.profiles
  for each row execute function public.guard_on_people();

-- Easy Beans (business 1): its shared login is off People (and off the rota, where it never works).
update public.profiles set on_people = false, on_rota = false
 where business_id = 1 and full_name = 'Owner' and lower(email) = 'easybeanscafe@gmail.com';

-- Easy Beans' dogs: Yoda and Cooper, with their photos, are Mark's (the `pet_photos` migration gave them
-- to Aron); Aron has none. A dog Mark already has keeps its own photo, or takes Aron's when it has
-- none. With no Mark there, Aron's Yoda and Cooper stay where they are.
do $$
declare
  v_aron uuid;
  v_mark uuid;
  v_sort int;
  d record;
begin
  select p.id into v_aron from public.profiles p
   where p.business_id = 1 and p.role in ('admin', 'employee') and p.full_name ~* '^\s*aron\M'
   order by (p.role = 'admin' and p.can_see_pay) desc, p.active desc, p.created_at limit 1;
  select p.id into v_mark from public.profiles p
   where p.business_id = 1 and p.role in ('admin', 'employee') and p.full_name ~* '^\s*mark\M'
   order by (p.role = 'admin' and p.can_see_pay) desc, p.active desc, p.created_at limit 1;
  if v_aron is null then return; end if;
  if v_mark is not null then
    for d in select name, kind, breed, photo from public.pets
              where profile_id = v_aron and name in ('Yoda', 'Cooper') order by name desc loop
      if exists (select 1 from public.pets where profile_id = v_mark and name = d.name) then
        update public.pets set photo = coalesce(photo, d.photo), breed = coalesce(breed, d.breed)
         where profile_id = v_mark and name = d.name;
      else
        select coalesce(max(sort), 0) + 1 into v_sort from public.pets where profile_id = v_mark;
        insert into public.pets (business_id, profile_id, name, kind, breed, sort, photo)
        values (1, v_mark, d.name, d.kind, d.breed, v_sort, d.photo);
      end if;
    end loop;
    delete from public.pets where profile_id = v_aron;
  else
    delete from public.pets where profile_id = v_aron and name not in ('Yoda', 'Cooper');
  end if;
end $$;
