-- Closing an account and taking everything out (Billing, owners only: admins with pay access).
--
-- Closing: an owner asks; the account closes 30 days later, and until then an owner can keep it with
-- one click. The Worker also stops the subscription renewing (worker/account.ts), and The Business
-- Agent's admins hear about it (a notification at HQ). Deleting the data once it has closed is done by
-- HQ, by hand: everything except the working-hours records (registro de jornada), which Spanish law
-- keeps for four years (docs/SEVERAL_BUSINESSES.md, "Closing an account").
--
-- Export: every table of the business's as rows for the Worker's zip of CSV files, without the secrets
-- (stored tokens, key and PIN hashes) and the app's own plumbing.

-- ---------------------------------------------------------------------------
-- 1. Who asked to close it, and when
-- ---------------------------------------------------------------------------
alter table public.business
  add column closing_requested_at timestamptz,
  add column closing_requested_by uuid references public.profiles (id) on delete set null;
create index business_closing_requested_by_idx on public.business (closing_requested_by);

-- Set through the functions below only (the Worker), never by updating the business from the app.
create or replace function public.business_closing_fixed() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if coalesce(public.request_role(), '') in ('authenticated', 'anon') then
    new.closing_requested_at := old.closing_requested_at;
    new.closing_requested_by := old.closing_requested_by;
  end if;
  return new;
end $$;
create trigger business_closing_fixed before update on public.business
  for each row execute function public.business_closing_fixed();

-- The Business Agent's admins hear about something (notifications at HQ). Writes HQ's rows for another
-- business, so it stays with postgres; only the functions here call it.
create or replace function public.notify_hq(p_title text, p_body text, p_link text default '/hq/businesses')
returns void
language sql security definer set search_path = ''
as $$
  insert into public.notifications (business_id, profile_id, title, body, link)
  select h.id, p.id, p_title, p_body, p_link
    from public.business h join public.profiles p on p.business_id = h.id
   where h.is_hq and p.active and p.role = 'admin';
$$;
revoke execute on function public.notify_hq(text, text, text) from public, anon, authenticated;
grant execute on function public.notify_hq(text, text, text) to app_definer;

-- An owner asks to close the account (the Worker, for whoever signed in). Returns when it closes; asking
-- again changes nothing.
create or replace function public.request_account_closure(p_by uuid)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  v public.business;
  v_who text;
begin
  select * into v from public.business where id = public.current_business_id();
  if v.id is null then
    raise exception 'No business to close';
  end if;
  if v.is_hq then
    raise exception 'The Business Agent HQ can''t be closed from the app';
  end if;
  select full_name into v_who from public.profiles
   where id = p_by and business_id = v.id and role = 'admin' and active and can_see_pay;
  if not found then
    raise exception 'Only an owner can close the account';
  end if;
  if v.closing_requested_at is not null then
    return v.closing_requested_at + interval '30 days';
  end if;
  update public.business set closing_requested_at = now(), closing_requested_by = p_by where id = v.id;
  perform public.notify_hq(
    format('%s asked to close its account', v.name),
    format('%s (#%s), asked by %s. It closes on %s unless an owner keeps it. Then delete its data, except the registro de jornada (kept four years).',
           v.name, v.id, coalesce(nullif(v_who, ''), 'an owner'), to_char((now() + interval '30 days') at time zone 'Europe/Madrid', 'DD/MM/YYYY')));
  return now() + interval '30 days';
end $$;
alter function public.request_account_closure(uuid) owner to app_definer;
revoke execute on function public.request_account_closure(uuid) from public, anon, authenticated;
grant execute on function public.request_account_closure(uuid) to service_role;

-- An owner keeps the account, within the 30 days.
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
    raise exception 'The account has closed. Write to support@businesssagent.com about it.';
  end if;
  update public.business set closing_requested_at = null, closing_requested_by = null where id = v.id;
  perform public.notify_hq(format('%s is staying', v.name), format('An owner kept %s (#%s): it won''t close.', v.name, v.id));
end $$;
alter function public.keep_account(uuid) owner to app_definer;
revoke execute on function public.keep_account(uuid) from public, anon, authenticated;
grant execute on function public.keep_account(uuid) to service_role;

-- HQ's Businesses page: the businesses whose owners asked to close them, and when each closes.
create or replace function public.hq_closures()
returns table (id int, closing_requested_at timestamptz, closes_at timestamptz, requested_by text)
language sql stable security definer set search_path = ''
as $$
  select b.id, b.closing_requested_at, b.closing_requested_at + interval '30 days', p.full_name
    from public.business b left join public.profiles p on p.id = b.closing_requested_by
   where b.closing_requested_at is not null and public.is_hq_admin()
   order by b.closing_requested_at;
$$;
revoke execute on function public.hq_closures() from public, anon;
grant execute on function public.hq_closures() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Everything out: the tables in an owner's export
-- ---------------------------------------------------------------------------
-- Every table with the business's rows and its columns in order, except the secrets and the app's own
-- plumbing (the outbox, push subscriptions, the kiosk's PIN attempts, outside services' answers kept
-- for a while). Secret columns anywhere are left out too (export_hidden_columns()).
create or replace function public.export_hidden_columns() returns text[]
language sql immutable set search_path = ''
as $$ select array['ciphertext', 'key_hash', 'token_hash', 'token', 'pin_hash', 'ftp_password', 'ip_hash'] $$;

create or replace function public.export_tables()
returns table (name text, columns text[])
language sql stable set search_path = ''
as $$
  select c.relname::text,
         array(select a.attname::text from pg_attribute a
                where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
                  and a.attname <> all (public.export_hidden_columns())
                order by a.attnum)
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and (c.relname = 'business' or exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'business_id' and not a.attisdropped))
     and c.relname not in ('integration_secrets', 'music_accounts', 'push_subscriptions', 'square_pins', 'provider_cache', 'outbox', 'kiosk_attempts')
   order by c.relname = 'business' desc, c.relname;
$$;
revoke execute on function public.export_tables() from public, anon, authenticated;
grant execute on function public.export_tables() to service_role, app_definer;

-- The rows of the business the request is for (the Worker names it), table by table in export_tables()'s
-- order: from row p_offset of table number p_from, up to p_rows rows in all, as one part per table (tables
-- with nothing in them left out). A call that comes back with fewer rows than asked for is the end; else
-- the Worker asks again from where the last part ended. A few calls take everything, so the Worker stays
-- well within the outside requests it may make. The audit log's copies of rows lose the secret columns too.
create or replace function public.export_part(p_from int default 1, p_offset int default 0, p_rows int default 5000)
returns table (n int, name text, first_row int, rows jsonb)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_business int := public.current_business_id();
  v_hide text[] := public.export_hidden_columns();
  v_left int := least(greatest(coalesce(p_rows, 5000), 1), 10000);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_rows jsonb;
  v_got int;
  t record;
begin
  if v_business is null then
    raise exception 'No business to export';
  end if;
  for t in select e.name as table_name, e.ord::int as ord
             from public.export_tables() with ordinality as e(name, columns, ord)
            where e.ord >= greatest(coalesce(p_from, 1), 1)
            order by e.ord
  loop
    execute format(
      'select coalesce(jsonb_agg(case when %L = ''audit_log'' then x.r || jsonb_build_object(
                ''old_values'', case when jsonb_typeof(x.r -> ''old_values'') = ''object'' then (x.r -> ''old_values'') - $4 else x.r -> ''old_values'' end,
                ''new_values'', case when jsonb_typeof(x.r -> ''new_values'') = ''object'' then (x.r -> ''new_values'') - $4 else x.r -> ''new_values'' end)
              else x.r end order by x.at), ''[]''), count(*)::int
         from (select to_jsonb(t) - $4 as r, t.ctid as at from public.%I t where t.%I = $1 order by t.ctid offset $2 limit $3) x',
      t.table_name, t.table_name, case when t.table_name = 'business' then 'id' else 'business_id' end)
      into v_rows, v_got
      using v_business, v_offset, v_left, v_hide;
    if v_got > 0 then
      n := t.ord;
      name := t.table_name;
      first_row := v_offset;
      rows := v_rows;
      return next;
    end if;
    v_left := v_left - v_got;
    exit when v_left <= 0;
    v_offset := 0;
  end loop;
end $$;
alter function public.export_part(int, int, int) owner to app_definer;
revoke execute on function public.export_part(int, int, int) from public, anon, authenticated;
grant execute on function public.export_part(int, int, int) to service_role;
