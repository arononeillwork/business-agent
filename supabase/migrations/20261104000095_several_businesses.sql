-- Several businesses in one database. Until now it held one business (Easy Beans): one `business`
-- row, settings tables with a single row (id 1), and everything else implicitly its. Now every table
-- has business_id, and a restrictive policy on each keeps a business's rows to its own people:
-- whatever else a policy allows, it only applies within the person's business. Easy Beans' data
-- stays as it is, as business 1. How it fits together: docs/SEVERAL_BUSINESSES.md.
--
-- Whose a request is (current_business_id()):
-- - someone signed in: their business (profiles.business_id; none yet for someone who signed up and
--   isn't in a business);
-- - the Worker (service role): the business it names in the x-business-id header (businessDb() in
--   worker/supabase.ts);
-- - the nightly and minute jobs: each business in turn (each_business());
-- - a trusted function, for the rest of its transaction: app.business_id (set_config(..., true)).
-- While there's only one business, the service role and the SQL editor fall back to it, so what's
-- live keeps working while the Worker that sends the header goes out.
--
-- SQL functions: security definer functions ran as postgres, which skips row security. They now run
-- as app_definer, a role that doesn't: inside one, a query only sees the caller's business, and
-- `where id = 1` on a settings table finds that business's own row (id stays 1 on those, one row
-- per business, business_id is their key). The policies' own helpers and the few functions that
-- work across businesses stay with postgres; zz_several_businesses.test.sql lists them and fails
-- if any other security definer function is left with postgres.
--
-- From here on, a migration that creates a table runs `select public.add_business_scope(...)` on
-- it, gives a new security definer function to app_definer (`alter function ... owner to
-- app_definer`), and seeds rows for every business (`select id from public.business`).

-- ---------------------------------------------------------------------------
-- Businesses get numbers of their own
-- ---------------------------------------------------------------------------
alter table public.business drop constraint business_id_check;
-- A new database has rows from earlier migrations (billing, brand, connections…) before any business:
-- they become the first business's, so it has to exist. Its details are filled in afterwards.
insert into public.business (id, name)
select 1, 'My business' where not exists (select 1 from public.business);
create sequence public.business_id_seq as int owned by public.business.id;
select setval('public.business_id_seq', max(id)) from public.business;
alter table public.business alter column id set default nextval('public.business_id_seq');

-- Each person is in one business, or none yet (signed up, not in a business).
alter table public.profiles add column business_id int references public.business on delete cascade;
alter table public.profiles disable trigger user;
update public.profiles set business_id = (select min(id) from public.business);
alter table public.profiles enable trigger user;
create index profiles_business_idx on public.profiles (business_id);
grant select (business_id) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Whose a request is
-- ---------------------------------------------------------------------------
-- The API role of the request (anon, authenticated, service_role); null in the SQL editor.
create or replace function public.request_role() returns text
language sql stable set search_path = ''
as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role');
$$;

create or replace function public.current_business_id() returns int
language plpgsql stable security definer set search_path = ''
as $$
declare v text := nullif(current_setting('app.business_id', true), '');
begin
  if v is not null then return v::int; end if;
  if auth.uid() is not null then
    return (select business_id from public.profiles where id = auth.uid());
  end if;
  -- The Worker names the business; nobody else's header counts. The SQL editor has no API role.
  if coalesce(public.request_role(), 'service_role') = 'service_role' then
    v := nullif(nullif(current_setting('request.headers', true), '')::json ->> 'x-business-id', '');
    if v is not null then return v::int; end if;
    return (select min(id) from public.business having count(*) = 1);
  end if;
  return null;
end $$;
revoke execute on function public.current_business_id() from public;
grant execute on function public.current_business_id() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- app_definer: who security definer functions run as
-- ---------------------------------------------------------------------------
do $$ begin create role app_definer nologin; exception when duplicate_object then null; end $$;
-- Whoever runs migrations hands functions to it and replaces them later (CREATE OR REPLACE needs
-- the owner's rights).
grant app_definer to current_user with inherit true, set true;
-- The auth schema (auth.uid()) and extensions (pgcrypto) come with authenticated.
grant authenticated to app_definer;
grant usage, create on schema public to app_definer;
grant select, insert, update, delete on all tables in schema public to app_definer;
grant usage, select, update on all sequences in schema public to app_definer;
grant execute on all functions in schema public to app_definer;
alter default privileges in schema public grant select, insert, update, delete on tables to app_definer;
alter default privileges in schema public grant usage, select, update on sequences to app_definer;
alter default privileges in schema public grant execute on functions to app_definer;

-- ---------------------------------------------------------------------------
-- A business column and the policy that keeps it to its business
-- ---------------------------------------------------------------------------
-- For each table (and each one a later migration creates): business_id, filled in with the business
-- the request is for; rows already there are the first business's.
create or replace function public.add_business_scope(p_table regclass) returns void
language plpgsql set search_path = ''
as $$
declare v_name text := (select relname from pg_class where oid = p_table);
begin
  if not exists (select 1 from pg_attribute where attrelid = p_table and attname = 'business_id' and not attisdropped) then
    execute format('alter table %s add column business_id int not null default %s references public.business on delete cascade',
                   p_table, coalesce((select min(id) from public.business), 1));
    execute format('alter table %s alter column business_id set default public.current_business_id()', p_table);
    execute format('create index %I on %s (business_id)', v_name || '_business_idx', p_table);
  end if;
  execute format('drop policy if exists business_scope on %s', p_table);
  execute format('create policy business_scope on %s as restrictive for all to public '
                 'using (business_id = (select public.current_business_id())) '
                 'with check (business_id = (select public.current_business_id()))', p_table);
  execute format('drop policy if exists definer_all on %s', p_table);
  execute format('create policy definer_all on %s for all to app_definer using (true) with check (true)', p_table);
  execute format('grant select, insert, update, delete on %s to app_definer', p_table);
end $$;
revoke execute on function public.add_business_scope(regclass) from public, anon, authenticated;

-- Every table but these: the business itself and its people (below), and the plans and prices,
-- which are Business Agent's, the same for everyone.
do $$
declare t regclass;
begin
  for t in select c.oid::regclass from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
              and c.relname not in ('business', 'profiles', 'plan_limits', 'pay_per_use')
            order by c.relname
  loop
    perform public.add_business_scope(t);
  end loop;
end $$;

-- The business row and the people: each sees their own business, and their own profile (someone not
-- in a business yet has only that).
create policy business_scope on public.business as restrictive for all to public
  using (id = (select public.current_business_id()))
  with check (id = (select public.current_business_id()));
create policy definer_all on public.business for all to app_definer using (true) with check (true);
create policy business_scope on public.profiles as restrictive for all to public
  using (business_id = (select public.current_business_id()) or id = (select auth.uid()))
  with check (business_id = (select public.current_business_id()) or id = (select auth.uid()));
create policy definer_all on public.profiles for all to app_definer using (true) with check (true);
-- The plans and prices: read by the functions that check them.
create policy definer_all on public.plan_limits for select to app_definer using (true);
create policy definer_all on public.pay_per_use for select to app_definer using (true);

-- ---------------------------------------------------------------------------
-- Keys: one of each per business
-- ---------------------------------------------------------------------------
-- One-row tables: business_id is the key; id stays 1 (so `where id = 1` is "this business's row").
do $$
declare t text;
begin
  foreach t in array array['business_admin_notes', 'settings', 'brand', 'billing', 'music_player', 'tax_settings',
    'ad_settings', 'pnl_settings', 'website_checks', 'competitor_settings', 'rep_settings', 'kitty_settings', 'grant_profile']
  loop
    execute format('alter table public.%I drop constraint %I, add primary key (business_id)', t, t || '_pkey');
  end loop;
end $$;

-- Rows named by something outside (a provider, a Google place, a match): per business.
alter table public.integration_secrets drop constraint integration_secrets_provider_fkey;
alter table public.integrations drop constraint integrations_pkey, add primary key (business_id, provider);
alter table public.integration_secrets drop constraint integration_secrets_pkey, add primary key (business_id, provider),
  add constraint integration_secrets_provider_fkey foreign key (business_id, provider)
    references public.integrations (business_id, provider) on delete cascade;
alter table public.sports_events drop constraint sports_events_competition_fkey;
alter table public.sports_competitions drop constraint sports_competitions_pkey, add primary key (business_id, code);
alter table public.sports_events drop constraint sports_events_pkey, add primary key (business_id, id),
  add constraint sports_events_competition_fkey foreign key (business_id, competition)
    references public.sports_competitions (business_id, code) on delete cascade;
drop index public.sports_events_competition_idx;
create index sports_events_competition_idx on public.sports_events (business_id, competition);
alter table public.sports_teams drop constraint sports_teams_pkey, add primary key (business_id, name);
alter table public.rep_rewards drop constraint rep_rewards_mention_id_fkey;
alter table public.instagram_mentions drop constraint instagram_mentions_pkey, add primary key (business_id, id);
alter table public.reviews drop constraint reviews_pkey, add primary key (business_id, id);
alter table public.provider_cache drop constraint provider_cache_pkey, add primary key (business_id, key);
alter table public.competitor_radar drop constraint competitor_radar_pkey, add primary key (business_id, place_id);

-- Unique within a business (a position's name, a Square id, a message's id…), not across all of them.
do $$
declare
  v_name text;
  v_def text;
  v_table regclass;
begin
  foreach v_name in array array[
    'benefits_law_key_key', 'brand_documents_storage_file_id_key', 'calendar_events_external_idx', 'competitor_items_name',
    'competitors_one_self', 'competitors_place_id_key', 'contractors_name_key', 'customers_square_id_key',
    'event_alerts_kind_ref_id_key', 'grant_applications_open_idx', 'invoices_email_id_key', 'job_roles_name_key',
    'kitty_entries_month_idx', 'legal_documents_storage_file_id_key', 'music_tracks_starter_key_key', 'outbox_dedupe_key_key',
    'positions_name_key', 'recipes_square_id_key', 'recipes_square_item_key', 'referrals_email_key', 'rep_rewards_mention_id_key',
    'sales_reps_code_key', 'sales_reps_instagram_idx', 'tax_documents_sha256_key', 'tax_filings_model_year_period_key',
    'todo_categories_name_key', 'whatsapp_messages_wa_message_id_key']
  loop
    select pg_get_indexdef(i.indexrelid), i.indrelid::regclass into v_def, v_table
      from pg_index i join pg_class c on c.oid = i.indexrelid
     where c.relname = v_name and c.relnamespace = 'public'::regnamespace;
    if v_def is null then raise exception 'No unique index %', v_name; end if;
    if exists (select 1 from pg_constraint where conname = v_name and conrelid = v_table) then
      execute format('alter table %s drop constraint %I', v_table, v_name);
    else
      execute format('drop index public.%I', v_name);
    end if;
    -- The same index with business_id first: "... USING btree (name)" becomes "(business_id, name)".
    execute regexp_replace(v_def, ' USING (\w+) \(', ' USING \1 (business_id, ');
  end loop;
end $$;

alter table public.rep_rewards add constraint rep_rewards_mention_id_fkey foreign key (business_id, mention_id)
  references public.instagram_mentions (business_id, id) on delete set null (mention_id);

-- An index on business_id alone is no use where another one starts with it.
do $$
declare v record;
begin
  for v in select c.relname from pg_index i join pg_class c on c.oid = i.indexrelid
            where c.relnamespace = 'public'::regnamespace and c.relname like '%\_business\_idx'
              and c.relname <> 'profiles_business_idx'
              and exists (select 1 from pg_index o join pg_attribute a on a.attrelid = o.indrelid and a.attnum = o.indkey[0]
                           where o.indrelid = i.indrelid and o.indexrelid <> i.indexrelid and a.attname = 'business_id'
                             and o.indpred is null)
  loop
    execute format('drop index public.%I', v.relname);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Functions that named the business or a key that's now per business
-- ---------------------------------------------------------------------------
create or replace function public.business_tz()
returns text
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select timezone from public.business where id = public.current_business_id()), 'Europe/Madrid');
$$;

create or replace function public.auto_close_entries()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_set    public.settings;
  v_tz     text := public.business_tz();
  v_hours  jsonb;
  v_count  int := 0;
  r        record;
  v_close  timestamptz;
  v_day    text;
  v_local  date;
begin
  select * into v_set from public.settings where id = 1;
  select opening_hours into v_hours from public.business where id = public.current_business_id();

  for r in
    select t.id, t.profile_id, t.clock_in, s.ends_at
      from public.time_entries t
      left join public.shifts s on s.id = t.shift_id
     where t.clock_out is null
  loop
    v_close := null;
    if r.ends_at is not null then
      v_close := r.ends_at + make_interval(mins => v_set.auto_clock_out_minutes);
    else
      v_local := (r.clock_in at time zone v_tz)::date;
      v_day := lower(to_char(v_local, 'Dy'));
      if v_hours -> v_day ->> 'close' is not null then
        v_close := ((v_local + (v_hours -> v_day ->> 'close')::time)::timestamp at time zone v_tz)
                   + make_interval(mins => v_set.forgot_clock_out_grace_minutes);
      else
        v_close := r.clock_in + interval '12 hours';
      end if;
    end if;

    if v_close is not null and v_close < now() and v_close > r.clock_in then
      update public.breaks set ended_at = least(v_close, now())
       where time_entry_id = r.id and ended_at is null;
      update public.time_entries
         set clock_out = v_close,
             clock_out_source = 'auto',
             flags = array(select distinct f from unnest(flags || '{auto_clock_out}'::text[]) f)
       where id = r.id;
      update public.time_entries set flags = public._compute_flags(r.id) where id = r.id;
      v_count := v_count + 1;
    end if;
  end loop;

  update public.correction_requests set status = 'expired'
   where status = 'pending' and expires_at < now();

  return v_count;
end;
$$;

create or replace function public.display_feed(p_token text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare v public.screens;
begin
  select * into v from public.screens where token = p_token;
  if not found then return null; end if;
  insert into public.screen_status (screen_id, last_seen_at) values (v.id, now())
    on conflict (screen_id) do update set last_seen_at = now() where public.screen_status.last_seen_at < now() - interval '50 seconds';
  return jsonb_build_object(
    'screen', to_jsonb(v) - 'token' - 'created_at' - 'updated_by' - 'business_id',
    'business', jsonb_build_object('name', (select name from public.business where id = public.current_business_id()))
                || coalesce((select jsonb_build_object('logo', coalesce(b.logo_mark, b.logo), 'heading_font', b.heading_font, 'body_font', b.body_font, 'colours', b.colours)
                               from public.brand b where b.id = 1), '{"logo": null}'::jsonb),
    'sections', (select to_jsonb(menu_sections) from public.settings where id = 1),
    'menus', coalesce((
      select jsonb_object_agg(d.id, jsonb_build_object(
               'design', to_jsonb(d) - 'updated_by' - 'created_at' - 'business_id'
                         || jsonb_build_object('image_url', (select i.url from public.menu_images i where i.id = d.image_id and i.status = 'ready')),
               'items', public.menu_list()))
        from public.menu_designs d
       where d.format = 'digital' and v.active
         and exists (select 1 from jsonb_array_elements(v.slides) s where s->>'design_id' = d.id::text)), '{}'::jsonb),
    'allergens', case when v.active then public.display_menu_allergens() end);
end $$;

-- The log row is the business's whose row changed (someone not in a business yet: not logged).
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
begin
  if v_business is null then return coalesce(new, old); end if;
  -- never copy PIN hashes into the log
  v_old := v_old - 'pin_hash';
  v_new := v_new - 'pin_hash';
  insert into public.audit_log (business_id, actor, via, table_name, row_id, action, old_values, new_values)
  values (v_business, auth.uid(), public.request_via(), tg_table_name,
          coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'profile_id', v_old ->> 'profile_id'),
          lower(tg_op), v_old, v_new);
  return coalesce(new, old);
end;
$$;

create or replace function public._enqueue(p_kind text, p_payload jsonb, p_dedupe text default null)
returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare v_id bigint;
begin
  insert into public.outbox (kind, payload, dedupe_key) values (p_kind, p_payload, p_dedupe)
  on conflict (business_id, dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.applicant_interview_event()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare v_key text := 'interview:' || coalesce(new.id, old.id)::text;
begin
  if tg_op = 'DELETE' or new.interview_at is null or new.stage in ('hired', 'rejected') then
    delete from public.calendar_events where source = 'app' and external_id = v_key;
    return null;
  end if;
  insert into public.calendar_events (starts_on, starts_at, title, category, source, external_id, visibility, details)
  values ((new.interview_at at time zone public.business_tz())::date, new.interview_at,
          left('Interview: ' || new.full_name || coalesce(' (' || (select title from public.job_openings where id = new.opening_id) || ')', ''), 200),
          'business', 'app', v_key, 'admins', jsonb_build_object('applicant', new.id))
  on conflict (business_id, source, external_id) where external_id is not null
  do update set starts_on = excluded.starts_on, starts_at = excluded.starts_at, title = excluded.title;
  return null;
end $$;

create or replace function public.grant_deadline_event()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare v_key text := 'grant:' || coalesce(new.id, old.id)::text;
begin
  if tg_op = 'DELETE' or new.deadline is null or new.stage in ('rejected', 'closed') then
    delete from public.calendar_events where source = 'app' and external_id = v_key;
    return null;
  end if;
  insert into public.calendar_events (starts_on, title, category, source, external_id, visibility, details)
  values (new.deadline, left('Grant deadline: ' || new.grant_name || coalesce(' (' || new.deadline_label || ')', ''), 200),
          'business', 'app', v_key, 'admins', jsonb_build_object('grant_application', new.id))
  on conflict (business_id, source, external_id) where external_id is not null
  do update set starts_on = excluded.starts_on, title = excluded.title;
  return null;
end $$;

create or replace function public.set_event_alert(p_kind text, p_ref_id text, p_on boolean)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_title text; v_start timestamptz; v_all_day boolean := false; v_link text; v_remind timestamptz;
  v_tz text := public.business_tz();
begin
  if not public.is_admin() then raise exception 'Only an admin can set event alerts'; end if;
  if not p_on then
    delete from public.event_alerts where kind = p_kind and ref_id = p_ref_id;
    return false;
  end if;
  if p_kind = 'calendar' then
    select e.title, coalesce(e.starts_at, (e.starts_on::timestamp at time zone v_tz)), e.starts_at is null
      into v_title, v_start, v_all_day
      from public.calendar_events e where e.id::text = p_ref_id;
    v_link := '/calendar';
  elsif p_kind = 'sports' then
    select s.title, s.starts_at, s.time_tbc into v_title, v_start, v_all_day from public.sports_events s where s.id = p_ref_id;
    v_link := '/sports';
  else
    raise exception 'Unknown kind of event';
  end if;
  if v_title is null then raise exception 'That event no longer exists'; end if;
  v_remind := case when v_all_day
    then (((v_start at time zone v_tz)::date - 1)::timestamp + time '10:00') at time zone v_tz
    else v_start - interval '3 hours' end;
  v_remind := greatest(v_remind, now());
  insert into public.event_alerts (kind, ref_id, title, starts_at, remind_at, link)
    values (p_kind, p_ref_id, v_title, v_start, v_remind, v_link)
    on conflict (business_id, kind, ref_id) do update set title = excluded.title, starts_at = excluded.starts_at,
      remind_at = excluded.remind_at, sent_at = null;
  return true;
end;
$$;

-- Checks that run as whoever writes the row (the Worker skips row security): within its business.
create or replace function public.claim_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_pay boolean := public.can_see_pay();
begin
  new.description := btrim(new.description);
  new.category := nullif(btrim(new.category), '');
  new.from_place := nullif(btrim(new.from_place), '');
  new.to_place := nullif(btrim(new.to_place), '');
  new.decision_note := nullif(btrim(new.decision_note), '');
  if new.kind = 'mileage' then
    if new.km is null then raise exception 'Enter the kilometres'; end if;
    new.rate_per_km := coalesce(new.rate_per_km, (select mileage_rate from public.settings where business_id = new.business_id), 0.26);
    new.amount := round(new.km * (case when new.return_trip then 2 else 1 end) * new.rate_per_km, 2);
  else
    new.km := null; new.rate_per_km := null; new.return_trip := false; new.from_place := null; new.to_place := null;
  end if;
  -- Without pay access (signed in): only your own, sent to approve, and only while it waits.
  if auth.uid() is not null and not v_pay then
    if tg_op = 'UPDATE' and old.status <> 'submitted' then raise exception 'This claim was already decided: ask an admin to change it'; end if;
    new.profile_id := case when tg_op = 'UPDATE' then old.profile_id else auth.uid() end;
    new.status := 'submitted';
    new.document_id := case when tg_op = 'UPDATE' then old.document_id end;
    new.decision_note := case when tg_op = 'UPDATE' then old.decision_note end;
  end if;
  -- Who decided and when; paid gets a day (today unless given).
  -- (Approved, then paid back: still the approval's.)
  if new.status = 'submitted' then
    new.decided_by := null; new.decided_at := null;
  elsif tg_op = 'INSERT' or (new.status is distinct from old.status and not (old.status = 'approved' and new.status = 'paid')) then
    new.decided_by := auth.uid(); new.decided_at := now();
  else
    new.decided_by := old.decided_by; new.decided_at := old.decided_at;
  end if;
  new.paid_on := case when new.status = 'paid' then coalesce(new.paid_on, current_date) end;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.plan_profiles_rule()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_max  int;
  v_was  boolean := tg_op = 'UPDATE' and old.active and old.role = new.role and old.business_id is not distinct from new.business_id;
begin
  if not new.active or v_was or new.business_id is null then return new; end if;
  if new.role in ('admin', 'employee') and not (tg_op = 'UPDATE' and old.active and old.role in ('admin', 'employee')
                                                 and old.business_id is not distinct from new.business_id) then
    select people into v_max from public.plan_limits where plan = public.current_plan();
    if v_max is not null and (select count(*) from public.profiles
         where business_id = new.business_id and active and role in ('admin', 'employee') and id <> new.id) >= v_max then
      raise exception 'Your plan includes % people, and the team is full. Switch someone off, or upgrade on the Billing page.', v_max
        using errcode = 'P0402';
    end if;
  elsif new.role = 'kiosk' and not public.plan_allows('kiosk') then
    raise exception 'The clock-in tablet needs the % plan or higher. Upgrade on the Billing page.', public.plan_needed('kiosk') using errcode = 'P0402';
  elsif new.role = 'partner' and not public.plan_allows('partners') then
    raise exception 'Partner access needs the % plan. Upgrade on the Billing page.', public.plan_needed('partners') using errcode = 'P0402';
  end if;
  return new;
end;
$$;

create or replace function public.recipe_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.category := nullif(btrim(new.category), '');
  new.square_item := nullif(btrim(new.square_item), '');
  new.notes := nullif(btrim(new.notes), '');
  new.description := nullif(btrim(new.description), '');
  new.photo_url := nullif(btrim(new.photo_url), '');
  new.price_label := nullif(btrim(new.price_label), '');
  -- A new item goes last in its section.
  if tg_op = 'INSERT' and new.menu_sort = 0 then
    new.menu_sort := coalesce((select max(r.menu_sort) from public.recipes r
                                where r.business_id = new.business_id and r.category is not distinct from new.category), 0) + 1;
  end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create or replace function public.contractor_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.contact_name := nullif(btrim(new.contact_name), '');
  new.email := lower(nullif(btrim(new.email), ''));
  new.website := nullif(btrim(new.website), '');
  new.portfolio_url := nullif(btrim(new.portfolio_url), '');
  new.location := nullif(btrim(new.location), '');
  new.notes := nullif(btrim(new.notes), '');
  -- Each job once (whatever the capitals), trimmed, in the order given; blank ones left out.
  new.services := coalesce(array(
    select s from (
      select distinct on (lower(btrim(s))) btrim(s) as s, i
        from unnest(new.services) with ordinality u(s, i)
       where btrim(s) <> ''
       order by lower(btrim(s)), i
    ) x order by i), '{}');
  if exists (select 1 from unnest(new.services) s where char_length(s) > 80) then
    raise exception 'Keep each job to 80 characters';
  end if;
  -- WhatsApp needs a number.
  new.whatsapp := new.whatsapp and new.phone is not null;
  if exists (select 1 from public.contractors where business_id = new.business_id and lower(name) = lower(new.name) and id <> new.id) then
    raise exception 'There’s already someone called % in the catalogue', new.name;
  end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
-- A new account joins the business that invited it (the Worker puts it in the invite). One nobody
-- invited joins the only business there is, switched off until an admin switches it on, as before;
-- once there are several, it joins none. The first person in a business with no admin is its admin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_admin_made boolean := coalesce(new.raw_app_meta_data ->> 'created_by_admin', '') = 'true';
  v_invited    boolean := new.invited_at is not null or v_admin_made;
  -- Invites carry the details in user metadata (set by the Worker); admin-made accounts in app metadata.
  v_meta       jsonb := case when v_admin_made then new.raw_app_meta_data else new.raw_user_meta_data end;
  v_role       text := v_meta ->> 'role';
  v_business   int := case when v_invited and coalesce(v_meta ->> 'business_id', '') ~ '^\d+$' then (v_meta ->> 'business_id')::int end;
  v_first      boolean;
  v_access     text[];
  v_was        text := current_setting('app.business_id', true);
begin
  if v_business is not null and not exists (select 1 from public.business where id = v_business) then
    v_business := null;
  end if;
  if v_business is null then
    select min(id) into v_business from public.business having count(*) = 1;
  end if;
  v_first := v_business is not null
             and not exists (select 1 from public.profiles where business_id = v_business and role = 'admin');
  if v_invited and v_role = 'partner' and not v_first then
    select coalesce(array_agg(a), '{}') into v_access
      from jsonb_array_elements_text(coalesce(v_meta -> 'partner_access', '[]'::jsonb)) a
     where a in ('calendar', 'rota', 'payroll', 'finances');
  end if;
  -- What the new profile's triggers write (the audit log, team badges) is that business's.
  perform set_config('app.business_id', coalesce(v_business::text, ''), true);
  insert into public.profiles (id, business_id, full_name, email, role, can_see_pay, active, partner_company, partner_access)
  values (
    new.id,
    v_business,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    case when v_first then 'admin'::public.app_role
         when v_invited and v_role in ('admin', 'employee', 'kiosk', 'partner') then v_role::public.app_role
         else 'employee'::public.app_role end,
    v_first,
    v_business is not null and (v_first or v_invited),
    case when v_access is not null then nullif(btrim(v_meta ->> 'partner_company'), '') end,
    coalesce(v_access, '{}')
  );
  perform set_config('app.business_id', coalesce(v_was, ''), true);
  return new;
end;
$$;

-- Nobody signed in moves themselves (or anyone) into another business: only the Worker adding someone
-- to a team, the SQL editor, or a business being set up.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
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
    raise exception 'Only a boss can make someone a boss or change a boss''s role';
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

-- ---------------------------------------------------------------------------
-- By hand (SQL editor): say which business once there are several
-- ---------------------------------------------------------------------------
drop function public.grant_complimentary(text, text);
create function public.grant_complimentary(p_kind text, p_note text default null, p_business int default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_business is not null then perform set_config('app.business_id', p_business::text, true); end if;
  if public.current_business_id() is null then
    raise exception 'Say which business: grant_complimentary(kind, note, business id)';
  end if;
  if p_kind not in ('founder', 'friends_family') then
    raise exception 'Complimentary kind must be founder or friends_family';
  end if;
  update public.billing set plan = 'business', status = 'comped', complimentary = p_kind,
    complimentary_note = coalesce(p_note, complimentary_note), complimentary_since = coalesce(complimentary_since, now()),
    updated_at = now()
   where id = 1;
end;
$$;
revoke execute on function public.grant_complimentary(text, text, int) from public, anon, authenticated;
grant execute on function public.grant_complimentary(text, text, int) to service_role;

drop function public.end_complimentary();
create function public.end_complimentary(p_business int default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_business is not null then perform set_config('app.business_id', p_business::text, true); end if;
  if public.current_business_id() is null then
    raise exception 'Say which business: end_complimentary(business id)';
  end if;
  update public.billing set plan = 'free', status = 'none', complimentary = null, complimentary_note = null,
    complimentary_since = null, updated_at = now()
   where id = 1 and status = 'comped';
end;
$$;
revoke execute on function public.end_complimentary(int) from public, anon, authenticated;
grant execute on function public.end_complimentary(int) to service_role;

-- ---------------------------------------------------------------------------
-- The jobs the Worker runs every minute and every night, for each business in turn
-- ---------------------------------------------------------------------------
-- One business's job failing doesn't stop the others'; returns how many failed (each is in the log).
create or replace function public.each_business(p_job text)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  b int;
  v_failed int := 0;
begin
  if p_job not in ('auto_close_entries', 'queue_shift_alerts', 'deliver_event_alerts', 'queue_due_social_posts',
                   'auto_fill_timecards', 'licence_reminders', 'enquiry_follow_ups', 'campaign_reminders') then
    raise exception 'Not a job that runs for each business: %', p_job;
  end if;
  for b in select id from public.business order by id loop
    perform set_config('app.business_id', b::text, true);
    begin
      execute format('select public.%I()', p_job);
    exception when others then
      v_failed := v_failed + 1;
      raise warning '% failed for business %: %', p_job, b, sqlerrm;
    end;
  end loop;
  perform set_config('app.business_id', '', true);
  return v_failed;
end $$;
revoke execute on function public.each_business(text) from public, anon, authenticated;
grant execute on function public.each_business(text) to service_role;

-- ---------------------------------------------------------------------------
-- Security definer functions run as app_definer, within the caller's business
-- ---------------------------------------------------------------------------
-- These stay with postgres: the policies call them (they read only the caller's own profile, or a
-- row by its id), or they work across businesses on purpose.
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.prosecdef
              and p.proname not in ('current_business_id', 'my_role', 'is_admin', 'is_staff', 'can_see_pay', 'is_partner',
                                    'partner_can', 'tip_pool_out', 'handle_new_user', 'each_business')
  loop
    execute format('alter function %s owner to app_definer', f);
  end loop;
end $$;
