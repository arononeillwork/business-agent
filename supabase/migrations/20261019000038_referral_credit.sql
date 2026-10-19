-- Referral months become credit on the business's Stripe bill. A month free is earned for each
-- referred business that finished set-up (up to 12), plus one month if this business was itself
-- referred (set by us when we set it up). The Worker adds each month to the Stripe customer's
-- balance once, while there is a subscription to pay, and counts it here.
alter table public.billing
  add column referred_by text,
  add column referred_month boolean not null default false,
  add column referral_months_applied int not null default 0 check (referral_months_applied between 0 and 13);

-- This business joined through another business's link: its own month free. By us only.
create or replace function public.mark_referred(p_by text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(btrim(p_by), '') = '' then raise exception 'Say which business referred this one'; end if;
  update public.billing set referred_by = btrim(p_by), referred_month = true, updated_at = now() where id = 1;
end;
$$;
revoke execute on function public.mark_referred(text) from public, anon, authenticated;
grant execute on function public.mark_referred(text) to service_role;

-- Months earned so far: referred businesses that finished set-up (capped at 12), plus our own.
create or replace function public.referral_months_earned() returns int
language sql stable security definer set search_path = ''
as $$
  select least(12, (select count(*) from public.referrals where set_up_at is not null))::int
       + (select case when referred_month then 1 else 0 end from public.billing where id = 1);
$$;
revoke execute on function public.referral_months_earned() from public, anon;
grant execute on function public.referral_months_earned() to authenticated, service_role;
