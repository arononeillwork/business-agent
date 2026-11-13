-- Accounts & rewards on the business's own website (docs/WEBSITE.md → Accounts & rewards). Someone who
-- signs in on the website (Easy Beans' first) is a customer here, and the website's account page reads
-- what they have from the app: their credit from the reps ledger (rep_rewards), how cashback is earned
-- (rep_settings), their code and standing if they're a rep, and their Square Loyalty points (the Worker
-- adds those from Square: worker/siteAccount.ts). They can be erased from the website (GDPR).
--
-- The website's server calls three routes with the business's website key (the newsletter's), never a
-- browser; each runs one of the functions here, for one business (the x-business-id header):
--   site_account_sync     find or make the customer for a signed-in email, as the Square sync does
--   site_account_summary  what their account page shows (credit, cashback, rep), only theirs
--   site_account_erase    erase them: deleted, or blanked where the ledger has to stay (accounting)
-- Each business turns it on on Website & SEO (settings.website_accounts, off until then).

-- 1. The switch, and what a website account keeps on the customer -----------------------------------------
alter table public.settings
  add column website_accounts boolean not null default false;

alter table public.customers
  -- The language they use the website in ("es"), as the website says.
  add column lang text check (lang ~ '^[a-z]{2}$'),
  -- The rep whose code they signed up with on the website (an admin logs the rep's reward, if any).
  add column introduced_by uuid references public.sales_reps on delete set null,
  -- Erased on request (GDPR): their personal details are gone; the row stays only for the ledger.
  add column erased_at timestamptz;
create index customers_introduced_by_idx on public.customers (introduced_by);

-- Someone erased has no name, email or phone left: that's the point.
alter table public.customers drop constraint customers_someone,
  add constraint customers_someone check (erased_at is not null or coalesce(first_name, last_name, email, phone) is not null);

-- 2. The website's calls are this business's, and only while it has them on -------------------------------------
create or replace function public.site_account_business(p_business int) returns int
language plpgsql stable set search_path = ''
as $$
declare v_business int := public.current_business_id();
begin
  if v_business is null or v_business is distinct from p_business then
    raise exception 'Not this business' using errcode = '42501';
  end if;
  if not coalesce((select website_accounts from public.settings where business_id = v_business and id = 1), false) then
    raise exception 'Website accounts are off' using errcode = '42501';
  end if;
  return v_business;
end $$;
revoke execute on function public.site_account_business(int) from public, anon, authenticated;

create or replace function public.site_account_email(p_email text) returns text
language plpgsql immutable set search_path = ''
as $$
declare v text := lower(btrim(coalesce(p_email, '')));
begin
  if v !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(v) > 254 then
    raise exception 'Enter a valid email' using errcode = '22023';
  end if;
  return v;
end $$;
revoke execute on function public.site_account_email(text) from public, anon, authenticated;

-- 3. Sync: find or make the customer -----------------------------------------------------------------------------
-- Matched as the Square sync matches (worker/squareCustomers.ts): by Square id, then email, then phone. The
-- signed-in email is who they are here, so a row with another email is never theirs (a Square id on
-- someone with another email, a phone on someone with an email). What's typed in the app wins: only empty
-- fields are filled. Marketing consent is never touched (signing in isn't a yes). New: a customer from the
-- website; with an active rep's code, that rep introduced them and the admins hear about it (an admin logs
-- the rep's reward once they've come in; nothing is credited by itself). Saying the same again changes nothing.
create or replace function public.site_account_sync(p_business int, p_email text, p_first_name text default null, p_last_name text default null,
  p_phone text default null, p_square_id text default null, p_lang text default null, p_rep_code text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_business int := public.site_account_business(p_business);
  v_email    text := public.site_account_email(p_email);
  v_first    text := left(nullif(btrim(p_first_name), ''), 100);
  v_last     text := left(nullif(btrim(p_last_name), ''), 100);
  v_phone    text := case when btrim(p_phone) ~ '^\+[0-9][0-9 ]{4,24}$' then regexp_replace(btrim(p_phone), '\s+', ' ', 'g') end;
  v_square   text := left(nullif(btrim(p_square_id), ''), 191);
  v_given    text := left(nullif(btrim(p_square_id), ''), 191);
  v_lang     text := case when lower(btrim(p_lang)) ~ '^[a-z]{2}$' then lower(btrim(p_lang)) end;
  v_code     text := nullif(upper(regexp_replace(coalesce(p_rep_code, ''), '\s', '', 'g')), '');
  c          public.customers;
  v_rep      public.sales_reps;
  v_created  boolean := false;
  v_ignored  text[] := '{}';
begin
  -- One at a time for an address (the newsletter sign-up's lock too), so two quick calls make one person.
  perform pg_advisory_xact_lock(hashtextextended('newsletter:' || v_business || ':' || v_email, 0));

  if v_square is not null then
    select * into c from public.customers
     where business_id = v_business and square_id = v_square and erased_at is null;
    if c.id is not null and c.email is not null and lower(c.email) <> v_email then c := null; end if;
  end if;
  if c.id is null then
    select * into c from public.customers
     where business_id = v_business and lower(email) = v_email and erased_at is null
     order by created_at limit 1;
  end if;
  if c.id is null and v_phone is not null then
    select * into c from public.customers
     where business_id = v_business and email is null and erased_at is null
       and regexp_replace(phone, '\D', '', 'g') = regexp_replace(v_phone, '\D', '', 'g')
     order by created_at limit 1;
  end if;

  -- A Square id already on someone else stays theirs.
  if v_square is not null and exists (select 1 from public.customers where business_id = v_business and square_id = v_square
                                         and id is distinct from c.id) then
    v_ignored := array_append(v_ignored, 'square_customer_id');
    v_square := null;
  end if;

  if c.id is null then
    if v_code is not null then
      select * into v_rep from public.sales_reps where business_id = v_business and code = v_code and active and approved;
    end if;
    insert into public.customers (business_id, kind, source, first_name, last_name, email, phone, square_id, lang, introduced_by)
    values (v_business, case when v_square is not null then 'customer' else 'lead' end, 'website', v_first, v_last, v_email, v_phone,
            v_square, v_lang, v_rep.id)
    returning * into c;
    v_created := true;
    if v_rep.id is not null then
      insert into public.notifications (business_id, profile_id, title, body, link)
      select v_business, a.id, coalesce(v_first, 'Someone') || ' signed up on the website with ' || v_rep.name || '’s code',
             'Log ' || v_rep.name || '’s reward on Sales reps once they''ve come in.', '/sales-reps'
        from public.profiles a where a.business_id = v_business and a.role = 'admin' and a.active;
    end if;
  elsif c.email is null or (c.first_name is null and v_first is not null) or (c.last_name is null and v_last is not null)
        or (c.phone is null and v_phone is not null) or (c.square_id is null and v_square is not null) or (c.lang is null and v_lang is not null) then
    update public.customers set
      email = coalesce(email, v_email),
      first_name = coalesce(first_name, v_first),
      last_name = coalesce(last_name, v_last),
      phone = coalesce(phone, v_phone),
      square_id = coalesce(square_id, v_square),
      lang = coalesce(lang, v_lang)
    where id = c.id and business_id = v_business
    returning * into c;
  end if;
  -- Linked to another Square customer already: theirs stays (typed or synced here first).
  if v_given is not null and c.square_id is distinct from v_given and not 'square_customer_id' = any(v_ignored) then
    v_ignored := array_append(v_ignored, 'square_customer_id');
  end if;

  return jsonb_build_object(
    'customer_id', c.id,
    'created', v_created,
    'is_rep', exists (select 1 from public.sales_reps where business_id = v_business and customer_id = c.id and active and approved),
    'ignored', to_jsonb(v_ignored));
end $$;
alter function public.site_account_sync(int, text, text, text, text, text, text, text) owner to app_definer;
revoke execute on function public.site_account_sync(int, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.site_account_sync(int, text, text, text, text, text, text, text) to service_role;

-- 4. Summary: what their account page shows ----------------------------------------------------------------------
-- Only this person's rows. Credit is their rep row's ledger, its balance rep_balance() (what the rep's own
-- page shows): what's approved, added up; pending what waits for an admin. The last 20 lines, newest first,
-- spends and payouts as negatives; a crew bonus without the crew member's name, and only the notes the app
-- writes itself (a post's views and likes, a spend at the till), never the team's. The Worker adds the
-- points from Square, by square_customer_id (not passed on), and words the reach step.
create or replace function public.site_account_summary(p_business int, p_email text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_business int := public.site_account_business(p_business);
  v_email    text := public.site_account_email(p_email);
  v_month    date := date_trunc('month', (now() at time zone public.business_tz())::date)::date;
  c          public.customers;
  r          public.sales_reps;
  s          public.rep_settings;
begin
  select * into c from public.customers
   where business_id = v_business and lower(email) = v_email and erased_at is null
   order by created_at limit 1;
  if c.id is null then return jsonb_build_object('customer', null); end if;
  select * into r from public.sales_reps
   where business_id = v_business and customer_id = c.id
   order by (active and approved) desc, created_at limit 1;
  select * into s from public.rep_settings where business_id = v_business and id = 1;

  return jsonb_build_object(
    'customer', jsonb_build_object('id', c.id, 'first_name', c.first_name),
    'square_customer_id', c.square_id,
    'credit', case when r.id is not null then jsonb_build_object(
      'balance', public.rep_balance(r.id),
      'pending', coalesce((select sum(amount) from public.rep_rewards where rep_id = r.id and status = 'pending'), 0),
      'gift_card_linked', r.square_gift_card_id is not null,
      'lines', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'date', to_char(w.occurred_on, 'YYYY-MM-DD'),
                 'label', case when w.bonus_for is not null then 'Crew bonus' else w.label end,
                 'amount', w.amount, 'status', w.status,
                 'note', case when w.source like 'cashback:%' or w.square_activity_id is not null then w.note end)
               order by w.occurred_on desc, w.created_at desc)
          from (select * from public.rep_rewards where rep_id = r.id order by occurred_on desc, created_at desc limit 20) w), '[]'::jsonb))
    end,
    'cashback', case when s.cashback_on then jsonb_build_object(
      'on', true, 'per_1000_views', s.cashback_per_1000_views, 'per_100_likes', s.cashback_per_100_likes,
      'per_follower', s.cashback_per_follower, 'max', s.cashback_max)
    end,
    'rep', case when r.id is not null and r.active and r.approved then jsonb_build_object(
      'code', r.code, 'kind', r.kind, 'reach', r.reach, 'boost_by_reach', coalesce(s.boost_by_reach, true),
      'crew_members', (select count(*) from public.sales_reps m where m.business_id = v_business and m.leader_id = r.id and m.active),
      'this_month', coalesce((select sum(amount) from public.rep_rewards
                               where rep_id = r.id and kind = 'earn' and status <> 'rejected' and occurred_on >= v_month), 0))
    end);
end $$;
alter function public.site_account_summary(int, text) owner to app_definer;
revoke execute on function public.site_account_summary(int, text) from public, anon, authenticated;
grant execute on function public.site_account_summary(int, text) to service_role;

-- 5. Erase -------------------------------------------------------------------------------------------------------
-- Everyone here with that email. No ledger lines: the customer goes (with their newsletter record), and
-- a customer-kind rep row of theirs with nothing on it. Ledger lines: the customer stays for the
-- accounts, blanked (name, email, phone, birthday, notes, Instagram, company, tags, Square id), with no
-- yes to marketing (unsubscribed: their newsletter record goes rather than keeping their address in a
-- new one); a customer-kind rep is switched off and blanked the same way, their link gone; ids, ledger
-- lines and amounts stay. Someone on the team or an ambassador is a rep for
-- their own reasons: only unlinked. Their details are taken out of the audit log's copies too, and the
-- erasing is logged there as done via the website, without them. Returns whether anyone was found, what
-- was kept, and the Square ids whose points the Worker forgets.
create or replace function public.site_account_erase(p_business int, p_email text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_business int := public.site_account_business(p_business);
  v_email    text := public.site_account_email(p_email);
  v_personal text[] := array['first_name', 'last_name', 'email', 'phone', 'birthday', 'notes', 'instagram', 'company', 'tags', 'square_id'];
  v_rep_personal text[] := array['name', 'phone', 'email', 'notes', 'instagram', 'tiktok', 'youtube', 'facebook', 'picture_url'];
  v_found    boolean := false;
  v_kept     boolean := false;
  v_squares  text[] := '{}';
  v_reps     uuid[];
  v_mine     uuid[];
  v_lines    boolean;
  c          record;
begin
  perform pg_advisory_xact_lock(hashtextextended('newsletter:' || v_business || ':' || v_email, 0));
  for c in select id, square_id from public.customers
            where business_id = v_business and lower(email) = v_email and erased_at is null
            order by created_at for update loop
    v_found := true;
    if c.square_id is not null then v_squares := v_squares || c.square_id; end if;
    select coalesce(array_agg(id), '{}'), coalesce(array_agg(id) filter (where kind = 'customer'), '{}') into v_reps, v_mine
      from public.sales_reps where business_id = v_business and customer_id = c.id;
    v_lines := exists (select 1 from public.rep_rewards where business_id = v_business and rep_id = any(v_reps));

    if not v_lines then
      delete from public.sales_reps where business_id = v_business and customer_id = c.id and kind = 'customer';
      delete from public.customers where id = c.id and business_id = v_business;
      update public.audit_log set old_values = old_values - v_personal, new_values = new_values - v_personal
       where business_id = v_business and table_name = 'customers' and row_id = c.id::text;
      update public.audit_log set old_values = old_values - v_rep_personal, new_values = new_values - v_rep_personal
       where business_id = v_business and table_name = 'sales_reps' and row_id = any(select unnest(v_mine)::text);
      insert into public.audit_log (business_id, actor, via, table_name, row_id, action, old_values, new_values)
      values (v_business, null, 'website', 'customers', c.id::text, 'erase', null, jsonb_build_object('kept', null));
      continue;
    end if;

    v_kept := true;
    update public.customers set
      first_name = null, last_name = null, email = null, phone = null, birthday = null, notes = null, instagram = null,
      company = null, tags = '{}', square_id = null, lang = null, marketing_consent = false, erased_at = now()
    where id = c.id and business_id = v_business;
    delete from public.newsletter_events where business_id = v_business and customer_id = c.id;
    delete from public.rep_links where business_id = v_business
       and rep_id = any(select id from public.sales_reps where business_id = v_business and customer_id = c.id and kind = 'customer');
    update public.sales_reps set
      active = false, name = 'Erased', phone = null, email = null, notes = null, instagram = null, tiktok = null,
      youtube = null, facebook = null, picture_url = null
    where business_id = v_business and customer_id = c.id and kind = 'customer';
    update public.sales_reps set customer_id = null
     where business_id = v_business and customer_id = c.id and kind <> 'customer';
    update public.audit_log set old_values = old_values - v_personal, new_values = new_values - v_personal
     where business_id = v_business and table_name = 'customers' and row_id = c.id::text;
    update public.audit_log set old_values = old_values - v_rep_personal, new_values = new_values - v_rep_personal
     where business_id = v_business and table_name = 'sales_reps' and row_id = any(select unnest(v_mine)::text);
    insert into public.audit_log (business_id, actor, via, table_name, row_id, action, old_values, new_values)
    values (v_business, null, 'website', 'customers', c.id::text, 'erase', null, jsonb_build_object('kept', 'ledger'));
  end loop;
  return jsonb_build_object('found', v_found, 'kept', case when v_kept then 'ledger' end, 'square_ids', to_jsonb(v_squares));
end $$;
alter function public.site_account_erase(int, text) owner to app_definer;
revoke execute on function public.site_account_erase(int, text) from public, anon, authenticated;
grant execute on function public.site_account_erase(int, text) to service_role;
