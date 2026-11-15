-- User analytics: each person's last sign-in, from Supabase's own records, so the page shows who has signed in
-- (with Google, Apple, Microsoft, an email…) even before the app has recorded a visit for them, and for sign-ins
-- from before User analytics existed. Visits and their pages stay as the user_analytics migration keeps them.
--
-- It reads auth.users and auth.identities, which only the database's owner may, so it stays with postgres (like
-- hq_businesses()) and keeps to the caller's own business itself; only an owner (an admin with pay access) gets
-- any rows. zzzz_several_businesses.test.sql lists it with the other functions that do so.
create or replace function public.usage_sign_ins()
returns table (profile_id uuid, last_sign_in_at timestamptz, provider text, full_name text, colour text, role text)
language sql stable security definer set search_path = ''
as $$
  select p.id, u.last_sign_in_at,
         -- How they last signed in: the identity used most recently, else the one they joined with.
         coalesce((select i.provider from auth.identities i where i.user_id = u.id order by i.last_sign_in_at desc nulls last limit 1),
                  u.raw_app_meta_data ->> 'provider'),
         -- Whose it is (partners too, whom the app's list of the team leaves out).
         p.full_name, p.colour, p.role::text
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.business_id = public.current_business_id()
     and u.last_sign_in_at is not null
     and public.can_see_pay();
$$;
revoke execute on function public.usage_sign_ins() from public, anon;
grant execute on function public.usage_sign_ins() to authenticated;
