-- Deleting a closed business's data, as docs/SEVERAL_BUSINESSES.md ("Closing an account") tells HQ to:
--   1. once it has closed, every row of it but the working-hours record (registro de jornada), in a
--      transaction that names it twice: app.business_id, and app.deleting_business;
--   2. four years after its last timecard, its business row, which takes everything left with it.
-- Neither could be done. The checks meant for someone deleting one row (the business's own row on
-- Competitors, a contractor with jobs, a digital menu on a screen, a fridge on Food safety with checks
-- recorded, kitty money that's been spent) refused the rows going with their business, and the one
-- meant for someone switching off the last admin refused switching off its people; the audit trigger
-- logged each row of a business that had just gone, which the log's own business_id refused.
--
-- Now each of those checks lets a row through while its business is being deleted:
-- business_being_deleted(). Someone in a business that's still there gets the same errors as before,
-- and nothing the app or the API sends can switch the checks off.
--
-- The foreign keys that keep a row while others point to it (a contractor's jobs, a fridge's checks, a
-- camera's clips, which the Worker deletes from storage first) stay as they are: on its own, the row is
-- still refused, and a business going isn't, since Postgres checks them, RESTRICT too, once its delete
-- has cascaded to every table.

-- ---------------------------------------------------------------------------
-- 1. Is this business being deleted?
-- ---------------------------------------------------------------------------
-- True while its row is going (the delete's cascade, so the row isn't there), or when HQ has named it in
-- the transaction (app.deleting_business) from the SQL editor: the database's owner or a superuser (or
-- the service role signed in as itself, never through the API, whose sign-in is always the
-- authenticator's). It stays with postgres, so it sees the business row whoever asks: as app_definer,
-- a check would see only the request's business, and so none at all for the SQL editor, a job or
-- Supabase's own services, and would take a business that is there for one that has gone.
create or replace function public.business_being_deleted(p_business int)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_business is not null
     and (not exists (select 1 from public.business where id = p_business)
          or (current_setting('app.deleting_business', true) = p_business::text
              and (pg_catalog.pg_has_role(session_user, 'postgres', 'member') or session_user = 'service_role')));
$$;
revoke execute on function public.business_being_deleted(int) from public, anon;
grant execute on function public.business_being_deleted(int) to authenticated, service_role, app_definer;

-- ---------------------------------------------------------------------------
-- 2. The checks, each as it was (the migration named) with the one line that lets a business go
-- ---------------------------------------------------------------------------
-- The competitors migration.
create or replace function public.competitor_keep_self() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if public.business_being_deleted(old.business_id) then return old; end if;
  if old.is_self then raise exception 'The business itself can’t be removed from Competitors'; end if;
  return old;
end $$;

-- The outsourcing migration.
create or replace function public.contractor_keep_with_jobs() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if public.business_being_deleted(old.business_id) then return old; end if;
  if exists (select 1 from public.outsourced_jobs where contractor_id = old.id) then
    raise exception '% has done jobs for the business: archive them instead', old.name;
  end if;
  return old;
end $$;

-- The screen_languages migration.
create or replace function public.menu_design_on_screen() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_screen text;
begin
  if public.business_being_deleted(old.business_id) then return old; end if;
  select name into v_screen from public.screens
   where exists (select 1 from jsonb_array_elements(slides) s
                  where s->>'design_id' = old.id::text or s->>'design_id_es' = old.id::text) limit 1;
  if v_screen is not null then
    raise exception '% is on the screen “%”. Take it off that screen first.', old.name, v_screen using errcode = '23503';
  end if;
  return old;
end $$;
alter function public.menu_design_on_screen() owner to app_definer;
revoke execute on function public.menu_design_on_screen() from public, anon, authenticated;

-- The food_safety migration.
create or replace function public.food_safety_point_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if public.business_being_deleted(old.business_id) then return old; end if;
    if exists (select 1 from public.food_safety_checks where point_id = old.id) then
      raise exception 'It has checks recorded, which are kept: switch it off instead';
    end if;
    return old;
  end if;
  new.name := btrim(new.name);
  new.area := nullif(btrim(new.area), '');
  new.instructions := nullif(btrim(new.instructions), '');
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  return new;
end $$;

-- The staff_kitty migration.
create or replace function public.kitty_entry_rules() returns trigger
language plpgsql set search_path = ''
as $$
declare v_was numeric := case when tg_op = 'INSERT' then 0 else old.amount end;
begin
  -- Nothing takes the kitty below what's been bought with it already.
  if tg_op = 'DELETE' then
    if public.business_being_deleted(old.business_id) then return old; end if;
    if old.amount > 0 and public.kitty_balance() - old.amount < 0 then
      raise exception 'That money has been spent: the kitty has €%', to_char(greatest(public.kitty_balance(), 0), 'FM999990.00');
    end if;
    return old;
  end if;
  new.note := nullif(btrim(new.note), '');
  if new.kind <> 'profit' then new.month := null; new.percent := null; end if;
  if new.kind = 'profit' and new.month >= date_trunc('month', now() at time zone public.business_tz())::date then
    raise exception 'A month''s profit goes in once the month is over';
  end if;
  if new.amount < v_was and public.kitty_balance() - v_was + new.amount < 0 then
    raise exception 'The kitty has €%', to_char(greatest(public.kitty_balance() - v_was, 0), 'FM999990.00');
  end if;
  if tg_op = 'UPDATE' then new.created_by := old.created_by; new.created_at := old.created_at; end if;
  return new;
end $$;

-- The owner_role migration. Step 1 ends by switching off everyone in the business, admins too.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if public.business_being_deleted(old.business_id) then return new; end if;
  if new.business_id is distinct from old.business_id
     and coalesce(public.request_role(), 'service_role') <> 'service_role'
     and coalesce(current_setting('app.business_setup', true), '') <> 'on' then
    raise exception 'Someone''s business can''t be changed here';
  end if;
  if coalesce(current_setting('app.business_setup', true), '') = 'on' then return new; end if;
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role
       or new.can_see_pay is distinct from old.can_see_pay
       or new.active is distinct from old.active
       or (new.pin_hash is distinct from old.pin_hash and old.id <> auth.uid()) then
      raise exception 'Only an admin can change role, pay access, status or PIN';
    end if;
  end if;
  if auth.uid() is not null and not public.can_see_pay()
     and (new.can_see_pay is distinct from old.can_see_pay
          or (old.role = 'admin' and old.can_see_pay and (new.role is distinct from old.role or new.active is distinct from old.active)))
     and exists (select 1 from public.profiles where role = 'admin' and can_see_pay and active) then
    raise exception 'Only an owner can make someone an owner or change an owner''s role';
  end if;
  if old.id = auth.uid() and old.active and not new.active then
    raise exception 'You can''t switch off your own account. Ask another admin.';
  end if;
  if old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active) then
    if not exists (select 1 from public.profiles
                   where role = 'admin' and active and id <> old.id) then
      raise exception 'At least one admin must remain';
    end if;
  end if;
  return new;
end;
$$;
alter function public.guard_profile_update() owner to app_definer;
revoke execute on function public.guard_profile_update() from public, anon, authenticated;

-- The business_of_the_row migration. A change in a business that's going isn't logged: there's no
-- business left to log it in, or its log is going too.
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
  if public.business_being_deleted(v_business) then return coalesce(new, old); end if;
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
alter function public.audit_row() owner to app_definer;
