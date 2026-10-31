-- Pets: the team's dogs (and cats and others), each with its name and a photo. Everyone adds their
-- own on My account; the People page shows them beside their person when "Show pets" is pressed.
-- The photo is cropped square and made small in the browser (a JPEG of about 50 KB) and kept here as a
-- data: URL, as the brand's logo is, so it needs no Drive or OneDrive.
-- Who: the whole team sees everyone's pets; each person adds, changes and removes their own, and admins
-- anyone's. Partners and the café tablet see none.

create table public.pets (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  kind        text not null default 'dog' check (kind in ('dog', 'cat', 'other')),
  breed       text check (char_length(breed) <= 60),
  photo       text check (photo is null or (photo ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' and length(photo) <= 1000000)),
  -- Their order on the person's card.
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
select public.add_business_scope('public.pets');
create index pets_profile_idx on public.pets (profile_id, sort);

-- Tidy what's typed; a pet belongs to someone on this business's team (not the tablet or a partner), up
-- to 20 each, and stays theirs. With the caller's rights, filtered by the row's business for the Worker.
create or replace function public.pet_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.breed := nullif(btrim(new.breed), '');
  if tg_op = 'UPDATE' then
    new.profile_id := old.profile_id;
    new.created_at := old.created_at;
  else
    if not exists (select 1 from public.profiles p
                    where p.id = new.profile_id and p.business_id = new.business_id and p.role in ('admin', 'employee')) then
      raise exception 'Pets belong to someone on the team' using errcode = '22023';
    end if;
    if (select count(*) from public.pets where profile_id = new.profile_id) >= 20 then
      raise exception 'Up to 20 pets each' using errcode = '22023';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger pets_rules before insert or update on public.pets for each row execute function public.pet_rules();
-- No row audit: each photo would be copied into the audit log with it.

alter table public.pets enable row level security;
revoke all on public.pets from anon;
create policy pets_read on public.pets for select to authenticated using ((select public.is_staff()));
create policy pets_write on public.pets for all to authenticated
  using ((select public.is_staff()) and (profile_id = (select auth.uid()) or (select public.is_admin())))
  with check ((select public.is_staff()) and (profile_id = (select auth.uid()) or (select public.is_admin())));

-- Aron's dogs, Fudge and Cooper, at Easy Beans (business 1), waiting for their photos. Aron is the
-- owner of that name there; with nobody of that name, nothing is added.
insert into public.pets (business_id, profile_id, name, kind, sort)
select a.business_id, a.id, d.name, 'dog', d.sort
  from (select id, business_id from public.profiles
         where business_id = 1 and role in ('admin', 'employee') and full_name ~* '^\s*aron\M'
         order by (role = 'admin' and can_see_pay) desc, active desc, created_at
         limit 1) a
 cross join (values ('Fudge', 1), ('Cooper', 2)) d(name, sort)
 where not exists (select 1 from public.pets x where x.profile_id = a.id and x.name = d.name);
