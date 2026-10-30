-- Server code that names no business (the service key without the Worker's x-business-id header,
-- Supabase's own sign-in service deleting an account, the SQL editor) has no business of its own
-- once there are several. Two checks went by the request's business, so they failed for it:
-- - The team limit went by the request's plan, which came out as Free, so a business on a bigger
--   plan was refused at 3 people. It is the plan of the business the person joins.
-- - A change was logged under the request's business, so a row of a business could not be changed
--   or deleted at all (deleting an account in a business failed). It is logged under the row's own.
-- Both act for that business while they look or write, as handle_new_user() does, and put back
-- whatever business was set before.

create or replace function public.plan_profiles_rule()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_max     int;
  v_full    boolean;
  v_kiosk   boolean;
  v_partner boolean;
  v_set     text;
  v_was     boolean := tg_op = 'UPDATE' and old.active and old.role = new.role and old.business_id is not distinct from new.business_id;
begin
  if not new.active or v_was or new.business_id is null then return new; end if;
  v_set := current_setting('app.business_id', true);
  perform set_config('app.business_id', new.business_id::text, true);
  select people into v_max from public.plan_limits where plan = public.current_plan();
  v_full := v_max is not null and (select count(*) from public.profiles
    where business_id = new.business_id and active and role in ('admin', 'employee') and id <> new.id) >= v_max;
  v_kiosk := public.plan_allows('kiosk');
  v_partner := public.plan_allows('partners');
  perform set_config('app.business_id', coalesce(v_set, ''), true);

  if new.role in ('admin', 'employee') and not (tg_op = 'UPDATE' and old.active and old.role in ('admin', 'employee')
                                                 and old.business_id is not distinct from new.business_id) then
    if v_full then
      raise exception 'Your plan includes % people, and the team is full. Switch someone off, or upgrade on the Billing page.', v_max
        using errcode = 'P0402';
    end if;
  elsif new.role = 'kiosk' and not v_kiosk then
    raise exception 'The clock-in tablet needs the % plan or higher. Upgrade on the Billing page.', public.plan_needed('kiosk') using errcode = 'P0402';
  elsif new.role = 'partner' and not v_partner then
    raise exception 'Partner access needs the % plan. Upgrade on the Billing page.', public.plan_needed('partners') using errcode = 'P0402';
  end if;
  return new;
end;
$$;

-- The change was already allowed on the row (its table's own policies); this only logs it, in the
-- row's business.
create or replace function public.audit_row()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_business int := case when tg_table_name = 'business' then (coalesce(v_new, v_old) ->> 'id')::int
                         else (coalesce(v_new, v_old) ->> 'business_id')::int end;
  v_set text;
begin
  if v_business is null then return coalesce(new, old); end if;
  -- never copy PIN hashes into the log
  v_old := v_old - 'pin_hash';
  v_new := v_new - 'pin_hash';
  v_set := current_setting('app.business_id', true);
  perform set_config('app.business_id', v_business::text, true);
  insert into public.audit_log (business_id, actor, via, table_name, row_id, action, old_values, new_values)
  values (v_business, auth.uid(), public.request_via(), tg_table_name,
          coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'profile_id', v_old ->> 'profile_id'),
          lower(tg_op), v_old, v_new);
  perform set_config('app.business_id', coalesce(v_set, ''), true);
  return coalesce(new, old);
end;
$$;
