-- Admins can create an account with a temporary password (no email needed). The Worker does it
-- with the service key and marks it in app_metadata, which only the service key can write, so it
-- counts as invited and its role/company/areas are trusted like an invite's.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_first      boolean;
  v_admin_made boolean := coalesce(new.raw_app_meta_data ->> 'created_by_admin', '') = 'true';
  v_invited    boolean := new.invited_at is not null or v_admin_made;
  -- Invites carry the details in user metadata (set by the Worker); admin-made accounts in app metadata.
  v_meta       jsonb := case when v_admin_made then new.raw_app_meta_data else new.raw_user_meta_data end;
  v_role       text := v_meta ->> 'role';
  v_access     text[];
begin
  select not exists (select 1 from public.profiles where role = 'admin') into v_first;
  if v_invited and v_role = 'partner' and not v_first then
    select coalesce(array_agg(a), '{}') into v_access
      from jsonb_array_elements_text(coalesce(v_meta -> 'partner_access', '[]'::jsonb)) a
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
    case when v_access is not null then nullif(btrim(v_meta ->> 'partner_company'), '') end,
    coalesce(v_access, '{}')
  );
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
