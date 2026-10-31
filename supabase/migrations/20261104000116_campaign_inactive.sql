-- Campaigns: switched off and started from a suggestion.
-- 1. Inactive: an admin switches a campaign off from its row on the Campaigns page. It's kept, out of
--    the main list in an Inactive section at the bottom, and can be switched back on; a planned one
--    isn't reminded about while it's off.
-- 2. Idea: the suggested campaign it was started from (shared/campaignIdeas.ts, the Suggested tab),
--    so that suggestion isn't offered again while it's there.
-- Who: admins, as for the rest of a campaign (the campaigns_admin policy, and the table's own grants,
-- which cover new columns). Both columns have defaults, so the app that's live before this deploy
-- keeps working.

alter table public.campaigns add column inactive boolean not null default false;
alter table public.campaigns add column idea text check (idea ~ '^[a-z0-9_]{1,40}$');

-- The nightly reminder (the `campaigns` migration's), now leaving out campaigns that are switched off.
create or replace function public.campaign_reminders() returns int
language plpgsql security definer set search_path = ''
as $$
declare v record; n int := 0;
begin
  for v in
    select * from public.campaigns
     where status = 'scheduled' and not inactive
       and (scheduled_at at time zone public.business_tz())::date <= (now() at time zone public.business_tz())::date
       and reminded_for is distinct from scheduled_at
  loop
    insert into public.notifications (profile_id, title, body, link)
    select p.id, 'Time to send: ' || v.name, coalesce(v.subject, left(v.body, 120)), '/campaigns'
      from public.profiles p where p.role = 'admin' and p.active;
    update public.campaigns set reminded_for = v.scheduled_at where id = v.id;
    n := n + 1;
  end loop;
  return n;
end $$;
alter function public.campaign_reminders() owner to app_definer;
revoke execute on function public.campaign_reminders() from public, anon, authenticated;
