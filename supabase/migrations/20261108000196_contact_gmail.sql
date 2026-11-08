-- The Business Agent's one contact address is its Gmail, thebusinesssagent@gmail.com: there's no hello@,
-- sales@, support@ or privacy@businesssagent.com mailbox. HQ's business details and the message an owner
-- sees when an account has already closed (keep_account, as in the close_account migration otherwise) say
-- it instead of support@businesssagent.com.
update public.business set email = 'thebusinesssagent@gmail.com'
 where is_hq and email = 'sales@businesssagent.com';

create or replace function public.keep_account(p_by uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v public.business;
begin
  select * into v from public.business where id = public.current_business_id();
  if v.id is null then
    raise exception 'No business to keep';
  end if;
  if not exists (select 1 from public.profiles where id = p_by and business_id = v.id and role = 'admin' and active and can_see_pay) then
    raise exception 'Only an owner can keep the account';
  end if;
  if v.closing_requested_at is null then
    return;
  end if;
  if v.closing_requested_at + interval '30 days' <= now() then
    raise exception 'The account has closed. Write to thebusinesssagent@gmail.com about it.';
  end if;
  update public.business set closing_requested_at = null, closing_requested_by = null where id = v.id;
  perform public.notify_hq(format('%s is staying', v.name), format('An owner kept %s (#%s): it won''t close.', v.name, v.id));
end $$;
alter function public.keep_account(uuid) owner to app_definer;
revoke execute on function public.keep_account(uuid) from public, anon, authenticated;
grant execute on function public.keep_account(uuid) to service_role;
