-- The Business Agent's back-office acts (the Businesses page, HQ's admins only): making a business
-- complimentary (the founding account, or friends & family) with a note, and ending it, from the app
-- instead of the SQL editor (grant_complimentary() and end_complimentary() stay for that). Like
-- hq_businesses(), these act across businesses, so they stay with postgres and answer only an active
-- admin of HQ. Extending a Stripe trial is the Worker's (worker/hq.ts): Stripe keeps the trial.

-- Whether whoever is signed in is an active admin of HQ (with their own rights: their profile and business).
create or replace function public.is_hq_admin() returns boolean
language sql stable set search_path = ''
as $$
  select exists (select 1 from public.profiles me join public.business h on h.id = me.business_id
                  where me.id = auth.uid() and me.active and me.role = 'admin' and h.is_hq);
$$;
revoke execute on function public.is_hq_admin() from public, anon;
grant execute on function public.is_hq_admin() to authenticated, service_role;

-- Complimentary: always the top plan, free, with a note saying who it's for. Not while a Stripe
-- subscription runs: its card would go on being charged, so that is cancelled in Stripe first.
create or replace function public.hq_set_complimentary(p_business int, p_kind text, p_note text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.billing;
  v_note text := nullif(btrim(p_note), '');
begin
  if not public.is_hq_admin() then
    raise exception 'Only The Business Agent HQ''s admins can do that';
  end if;
  if p_kind is null or p_kind not in ('founder', 'friends_family') then
    raise exception 'Complimentary kind must be founder or friends_family';
  end if;
  if v_note is null then
    raise exception 'Add a note saying who it''s for';
  end if;
  if char_length(v_note) > 200 then
    raise exception 'Keep the note to 200 characters';
  end if;
  select * into v from public.billing where business_id = p_business and id = 1;
  if v.business_id is null then
    raise exception 'No such business';
  end if;
  if v.stripe_subscription_id is not null and v.status in ('trialing', 'active', 'past_due', 'unpaid', 'incomplete', 'paused') then
    raise exception 'It has a Stripe subscription running. Cancel it in Stripe first, so its card isn''t charged, then make it complimentary.';
  end if;
  update public.billing set plan = 'business', status = 'comped', complimentary = p_kind, complimentary_note = v_note,
    complimentary_since = coalesce(complimentary_since, now()), updated_at = now()
   where business_id = p_business and id = 1;
end $$;
revoke execute on function public.hq_set_complimentary(int, text, text) from public, anon;
grant execute on function public.hq_set_complimentary(int, text, text) to authenticated;

-- Ending it leaves the business on Free; a Stripe subscription it still has comes back with the next sync.
-- HQ itself stays complimentary.
create or replace function public.hq_end_complimentary(p_business int)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_hq_admin() then
    raise exception 'Only The Business Agent HQ''s admins can do that';
  end if;
  if exists (select 1 from public.business where id = p_business and is_hq) then
    raise exception 'The Business Agent HQ stays complimentary';
  end if;
  update public.billing set plan = 'free', status = 'none', complimentary = null, complimentary_note = null,
    complimentary_since = null, updated_at = now()
   where business_id = p_business and id = 1 and status = 'comped';
  if not found then
    raise exception 'It isn''t complimentary';
  end if;
end $$;
revoke execute on function public.hq_end_complimentary(int) from public, anon;
grant execute on function public.hq_end_complimentary(int) to authenticated;
