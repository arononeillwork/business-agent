-- Invite-only team: people who sign up by themselves (not invited) start inactive and see
-- nothing, even if public sign-ups are left on in Supabase Auth. Invited people get the role
-- the admin chose at invite time (set server-side by the Worker, never by the browser).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_first   boolean;
  v_invited boolean := new.invited_at is not null;
  v_role    text := new.raw_user_meta_data ->> 'role';
begin
  select not exists (select 1 from public.profiles where role = 'admin') into v_first;
  insert into public.profiles (id, full_name, email, role, can_see_pay, active)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    case when v_first then 'admin'::public.app_role
         when v_invited and v_role in ('admin', 'employee', 'kiosk') then v_role::public.app_role
         else 'employee'::public.app_role end,
    v_first,
    v_first or v_invited
  );
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
