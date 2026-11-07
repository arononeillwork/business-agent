-- The Business Agent's back-office funnel (the Businesses page, HQ's admins only): of the businesses that
-- signed up, how many finished setting up, were still in use in their second week, are on a trial, pay,
-- and cancelled, with cancellations month by month. Set-up, trials and paying come from hq_businesses()'s
-- list already; hq_funnel() adds, business by business, the two that list hasn't got. A new function rather
-- than more columns on hq_businesses(), so the app that's live while this runs keeps working.
--
-- Active in week two: someone in the business did something from day 7 to day 14 after it was created
-- (created_at + 7 days up to created_at + 14 days): clocked in (time_entries), added a shift to the rota, or
-- made any change the audit log keeps with who made it (the rota, calendar, team, settings and the rest;
-- the app, the REST API and the AI connector all act as the person). Not the last sign-in: auth keeps only
-- the latest one. A business younger than 14 days hasn't had its second week yet: null ("not yet"), not
-- false.
--
-- Cancelled: an owner asked to close the account (the close_account migration), or, unless it's
-- complimentary now, its Stripe subscription was cancelled (ended, or set to end with the period: by its
-- owner, or a trial that ended without a card). When: the earlier of the two. Billing kept only Stripe's
-- status, not when it changed (updated_at moves with every nightly check), so billing.canceled_at now keeps
-- Stripe's own date: worker/billing.ts copies it with the rest, and the nightly check fills it in for
-- subscriptions cancelled before. Until then such a cancellation counts, with no month.
--
-- Like hq_businesses(), it reads across businesses, so it stays with postgres and answers only an active
-- admin of HQ (is_hq_admin(), the hq_actions migration); anyone else gets no rows.

alter table public.billing add column canceled_at timestamptz;
comment on column public.billing.canceled_at is
  'When the Stripe subscription was cancelled (Stripe''s canceled_at, else ended_at), while it is cancelled or set to end; copied by the Worker.';

create or replace function public.hq_funnel()
returns table (id int, active_week_two boolean, cancelled boolean, cancelled_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select b.id,
         case when now() < b.created_at + interval '14 days' then null
              else exists (select 1 from public.time_entries e
                            where e.business_id = b.id
                              and e.clock_in >= b.created_at + interval '7 days' and e.clock_in < b.created_at + interval '14 days')
                or exists (select 1 from public.shifts s
                            where s.business_id = b.id
                              and s.created_at >= b.created_at + interval '7 days' and s.created_at < b.created_at + interval '14 days')
                or exists (select 1 from public.audit_log a
                            where a.business_id = b.id and a.actor is not null
                              and a.at >= b.created_at + interval '7 days' and a.at < b.created_at + interval '14 days')
         end,
         x.ended or b.closing_requested_at is not null,
         case when x.ended or b.closing_requested_at is not null
              then least(case when x.ended then bl.canceled_at end, b.closing_requested_at) end
    from public.business b
    left join public.billing bl on bl.business_id = b.id
    cross join lateral (select coalesce(bl.status <> 'comped' and (bl.status = 'canceled' or bl.canceled_at is not null), false) as ended) x
   where public.is_hq_admin()
   order by b.id;
$$;
revoke execute on function public.hq_funnel() from public, anon;
grant execute on function public.hq_funnel() to authenticated;
