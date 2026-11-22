-- Tips after breakeven: a business can share out tips only from the days it took more than its
-- breakeven (what it costs to run it that day: the running costs on Finances spread over the open days,
-- plus the team on the rota). On those days the card tips go to the team; on the others they stay with
-- the business. Off (the default), every day's tips are shared out, as before. The Tips page works out
-- which days count when an owner shares tips out (shared/tips.ts tipsAboveBreakeven).
-- The team reads it with the rest of the settings; only an owner (an admin with pay access) changes it,
-- and the server's own code (no signed-in user) may too, as for owner pay (the `owner_pay_and_rates`
-- migration). The code live before this keeps working: it never names the column.

alter table public.settings add column tips_after_breakeven boolean not null default false;

create or replace function public.guard_tips_after_breakeven() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.tips_after_breakeven is distinct from old.tips_after_breakeven and auth.uid() is not null and not public.can_see_pay() then
    raise exception 'Only an owner changes how tips are shared out';
  end if;
  return new;
end $$;
revoke execute on function public.guard_tips_after_breakeven() from public, anon, authenticated;
create trigger settings_tips_after_breakeven before update of tips_after_breakeven on public.settings
  for each row execute function public.guard_tips_after_breakeven();

-- Easy Beans (business 1): its owners asked for tips to come in only past the breakeven mark.
update public.settings set tips_after_breakeven = true where business_id = 1;
