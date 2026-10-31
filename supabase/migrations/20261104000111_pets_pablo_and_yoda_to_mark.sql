-- Pablo and Yoda are Mark's dogs. The `pet_photos` migration added them, with their photos, to Aron's
-- account at Easy Beans (business 1), where Mark already had them without photos. Their photos go onto
-- Mark's Pablo and Yoda (where those have none yet), and Aron's copies go. Mark is whoever on business
-- 1's team is named Mark and has a dog of that name; Aron is found as in the `pet_photos` migration.
-- With either missing, nothing changes, and running it again changes nothing.
do $$
declare
  v_aron uuid;
  v_marks uuid;
  d record;
begin
  select p.id into v_aron
    from public.profiles p
   where p.business_id = 1 and p.role in ('admin', 'employee')
     and (p.full_name ~* '^\s*aron\M'
          or exists (select 1 from public.pets x where x.profile_id = p.id and x.name in ('Fudge', 'Cooper')))
   order by exists (select 1 from public.pets x where x.profile_id = p.id and x.name in ('Fudge', 'Cooper')) desc,
            (p.role = 'admin' and p.can_see_pay) desc, p.active desc, p.created_at
   limit 1;
  if v_aron is null then return; end if;
  for d in select id, name, photo from public.pets where profile_id = v_aron and name in ('Pablo', 'Yoda') loop
    select x.id into v_marks
      from public.pets x
      join public.profiles p on p.id = x.profile_id
     where x.business_id = 1 and x.name = d.name and x.profile_id <> v_aron and p.full_name ~* '^\s*mark\M'
     order by x.created_at
     limit 1;
    continue when v_marks is null;
    update public.pets set photo = d.photo where id = v_marks and photo is null;
    delete from public.pets where id = d.id;
  end loop;
end $$;
