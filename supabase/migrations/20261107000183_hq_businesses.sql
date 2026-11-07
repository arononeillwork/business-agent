-- The Business Agent's back-office: the Businesses page, for HQ's admins only (business.is_hq, the
-- hq_reps migration). Every business with its plan and billing status, trial end, team size, whether it
-- finished setting up and when its people last signed in, so running the service doesn't need the
-- SQL editor. The one function reads across businesses, so it stays with postgres (like the hq_reps
-- ones) and answers only an active admin of HQ; anyone else gets no rows.
create or replace function public.hq_businesses()
returns table (id int, name text, created_at timestamptz, is_hq boolean, plan text, status text, billing_interval text,
               trial_ends_at timestamptz, complimentary text, people int, set_up_at timestamptz, last_sign_in timestamptz)
language sql stable security definer set search_path = ''
as $$
  select b.id, b.name, b.created_at, b.is_hq, coalesce(bl.plan, 'free'), coalesce(bl.status, 'none'), bl.billing_interval,
         bl.trial_ends_at, bl.complimentary,
         (select count(*)::int from public.profiles p where p.business_id = b.id and p.active and p.role in ('admin', 'employee')),
         b.setup_completed_at,
         (select max(u.last_sign_in_at) from auth.users u join public.profiles p on p.id = u.id where p.business_id = b.id)
    from public.business b
    left join public.billing bl on bl.business_id = b.id
   where exists (select 1 from public.profiles me join public.business h on h.id = me.business_id
                  where me.id = auth.uid() and me.active and me.role = 'admin' and h.is_hq)
   order by b.created_at desc, b.id desc;
$$;
revoke execute on function public.hq_businesses() from public, anon;
grant execute on function public.hq_businesses() to authenticated;
