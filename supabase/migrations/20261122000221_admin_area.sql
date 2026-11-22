-- The admin area (/admin): The Business Agent's own back room on the site, for running Business Agent
-- itself rather than a café. No sign-in: it opens with its PIN. First in it is the sales team's board:
-- a lane for each salesperson (Maria Cortes, Julio Cesar to start), a column for each stage, a card for
-- each business they're talking to, added from its Instagram link, a phone number, an email or a website.
--
-- Everything is Business Agent HQ's own rows (business.is_hq). Only the Worker reaches it
-- (worker/adminArea.ts, the service role naming HQ): the PIN is checked here, never in the browser, and
-- a right one gives a session of 12 hours (its token is kept only as a hash). Wrong PINs are counted:
-- 5 from one connection, or 25 from anywhere, in 15 minutes, and the PIN isn't tried again until the
-- 15 minutes are up. Whoever is in changes the PIN, which locks out everyone else.
-- The tables are new: the code live before this never names them.

-- ---------------------------------------------------------------------------
-- 1. The PIN, sessions and wrong tries
-- ---------------------------------------------------------------------------
create table public.admin_area (
  id             int not null default 1 check (id = 1),
  pin_hash       text not null,
  pin_changed_at timestamptz not null default now()
);
select public.add_business_scope('public.admin_area');
create unique index admin_area_key on public.admin_area (business_id, id);
alter table public.admin_area enable row level security;
revoke all on public.admin_area from anon, authenticated;

create table public.admin_sessions (
  id         uuid primary key default gen_random_uuid(),
  -- sha256 of the token the browser keeps; the token itself is never stored.
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
select public.add_business_scope('public.admin_sessions');
create unique index admin_sessions_token_key on public.admin_sessions (business_id, token_hash);
alter table public.admin_sessions enable row level security;
revoke all on public.admin_sessions from anon, authenticated;

create table public.admin_pin_tries (
  id      bigint generated always as identity primary key,
  -- Which connection it came from, as an id the Worker makes with a secret (never the address).
  ip_hash text not null default '' check (char_length(ip_hash) <= 64),
  ok      boolean not null,
  at      timestamptz not null default now()
);
select public.add_business_scope('public.admin_pin_tries');
create index admin_pin_tries_at_idx on public.admin_pin_tries (business_id, at);
alter table public.admin_pin_tries enable row level security;
revoke all on public.admin_pin_tries from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The sales team and the businesses they're talking to
-- ---------------------------------------------------------------------------
create table public.sales_team (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  -- The order of the lanes.
  position   int not null default 0,
  created_at timestamptz not null default now()
);
select public.add_business_scope('public.sales_team');
create unique index sales_team_name_key on public.sales_team (business_id, lower(btrim(name)));
alter table public.sales_team enable row level security;
revoke all on public.sales_team from anon, authenticated;

create table public.sales_prospects (
  id           uuid primary key default gen_random_uuid(),
  -- Whose lane it's in (none: "Not anyone's yet", when someone leaves the team).
  member_id    uuid references public.sales_team on delete set null,
  name         text not null check (char_length(btrim(name)) between 1 and 120),
  stage        text not null default 'to_contact' check (stage in ('to_contact', 'contacted', 'demo', 'trial', 'won', 'lost')),
  -- As Instagram keeps names: no @, lower case (a link or an @ is tidied to that below).
  instagram    text check (instagram ~ '^[a-z0-9._]{1,30}$'),
  phone        text check (char_length(phone) <= 40),
  email        text check (char_length(email) <= 200 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  website      text check (char_length(website) <= 300 and website ~ '^https?://'),
  town         text check (char_length(town) <= 80),
  notes        text check (char_length(notes) <= 2000),
  follow_up_on date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
select public.add_business_scope('public.sales_prospects');
-- The same business isn't on the board twice.
create unique index sales_prospects_instagram_key on public.sales_prospects (business_id, instagram) where instagram is not null;
create index sales_prospects_member_idx on public.sales_prospects (member_id);
alter table public.sales_prospects enable row level security;
revoke all on public.sales_prospects from anon, authenticated;

-- "https://www.instagram.com/The_Bootes_Cafe/?hl=en", "@the_bootes_cafe" → "the_bootes_cafe"; empty → none.
-- Whatever writes the row (the Worker, the SQL editor) gets the same.
create or replace function public.sales_prospect_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.instagram := nullif(lower(regexp_replace(regexp_replace(btrim(new.instagram), '^(https?://)?(www\.)?instagram\.com/@?', '', 'i'),
                                               '^@|[/?#].*$', '', 'g')), '');
  new.email := nullif(lower(btrim(new.email)), '');
  new.phone := nullif(btrim(new.phone), '');
  new.website := nullif(btrim(new.website), '');
  new.town := nullif(btrim(new.town), '');
  new.notes := nullif(btrim(new.notes), '');
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return new;
end $$;
create trigger sales_prospects_rules before insert or update on public.sales_prospects
  for each row execute function public.sales_prospect_rules();

-- ---------------------------------------------------------------------------
-- 3. Opening it: the PIN, a session, locking it again, a new PIN
-- ---------------------------------------------------------------------------
-- Whether a connection (or everyone) has had too many wrong PINs in the last 15 minutes.
create or replace function public.admin_area_too_many(p_from text) returns boolean
language sql stable set search_path = ''
as $$
  select (select count(*) from public.admin_pin_tries where not ok and at > now() - interval '15 minutes' and ip_hash = coalesce(p_from, '')) >= 5
      or (select count(*) from public.admin_pin_tries where not ok and at > now() - interval '15 minutes') >= 25;
$$;
revoke execute on function public.admin_area_too_many(text) from public, anon, authenticated;

-- The PIN typed at /admin. A right one: a new session's token and when it ends. Otherwise what was
-- wrong (error: wrong, too_many, not_set_up), without raising, so the wrong try is kept.
create or replace function public.admin_area_unlock(p_pin text, p_from text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_hash    text;
  v_token   text;
  v_expires timestamptz := now() + interval '12 hours';
begin
  -- One try at a time, so tries sent all at once are counted one after another.
  perform pg_advisory_xact_lock(hashtext('admin_area_unlock'), coalesce(public.current_business_id(), 0));
  select pin_hash into v_hash from public.admin_area where id = 1;
  if v_hash is null then return jsonb_build_object('error', 'not_set_up'); end if;
  delete from public.admin_pin_tries where at < now() - interval '1 day';
  delete from public.admin_sessions where expires_at < now();
  if public.admin_area_too_many(p_from) then return jsonb_build_object('error', 'too_many'); end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4,12}$' or extensions.crypt(p_pin, v_hash) <> v_hash then
    insert into public.admin_pin_tries (ip_hash, ok) values (left(coalesce(p_from, ''), 64), false);
    return jsonb_build_object('error', 'wrong');
  end if;
  insert into public.admin_pin_tries (ip_hash, ok) values (left(coalesce(p_from, ''), 64), true);
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.admin_sessions (token_hash, expires_at) values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_expires);
  return jsonb_build_object('token', v_token, 'expires_at', v_expires);
end $$;
alter function public.admin_area_unlock(text, text) owner to app_definer;
revoke execute on function public.admin_area_unlock(text, text) from public, anon, authenticated;
grant execute on function public.admin_area_unlock(text, text) to service_role;

-- Whether a session's token is still good.
create or replace function public.admin_area_session(p_token text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(p_token ~ '^[0-9a-f]{64}$', false) and exists (
    select 1 from public.admin_sessions
     where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and expires_at > now());
$$;
alter function public.admin_area_session(text) owner to app_definer;
revoke execute on function public.admin_area_session(text) from public, anon, authenticated;
grant execute on function public.admin_area_session(text) to service_role;

-- Lock: the session ends.
create or replace function public.admin_area_lock(p_token text) returns void
language sql security definer set search_path = ''
as $$
  delete from public.admin_sessions where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;
alter function public.admin_area_lock(text) owner to app_definer;
revoke execute on function public.admin_area_lock(text) from public, anon, authenticated;
grant execute on function public.admin_area_lock(text) to service_role;

-- A new PIN, from inside (the one in use typed again): every other session ends.
-- error: locked, wrong, too_many, bad_pin (4 to 12 digits).
create or replace function public.admin_area_change_pin(p_token text, p_current text, p_new text, p_from text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_hash text;
begin
  perform pg_advisory_xact_lock(hashtext('admin_area_unlock'), coalesce(public.current_business_id(), 0));
  if not public.admin_area_session(p_token) then return jsonb_build_object('error', 'locked'); end if;
  select pin_hash into v_hash from public.admin_area where id = 1;
  if public.admin_area_too_many(p_from) then return jsonb_build_object('error', 'too_many'); end if;
  if coalesce(p_current, '') !~ '^[0-9]{4,12}$' or extensions.crypt(p_current, v_hash) <> v_hash then
    insert into public.admin_pin_tries (ip_hash, ok) values (left(coalesce(p_from, ''), 64), false);
    return jsonb_build_object('error', 'wrong');
  end if;
  if coalesce(p_new, '') !~ '^[0-9]{4,12}$' then return jsonb_build_object('error', 'bad_pin'); end if;
  update public.admin_area set pin_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 12)), pin_changed_at = now() where id = 1;
  delete from public.admin_sessions where token_hash <> encode(extensions.digest(p_token, 'sha256'), 'hex');
  return jsonb_build_object('ok', true);
end $$;
alter function public.admin_area_change_pin(text, text, text, text) owner to app_definer;
revoke execute on function public.admin_area_change_pin(text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_area_change_pin(text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. HQ's admin area to start: its PIN, the sales team and who they're talking to
-- ---------------------------------------------------------------------------
-- Once, for HQ. Run here on the live database; a brand-new one runs `select public.start_admin_area();`
-- after `select public.start_hq();`. The PIN is the owner's 1234568 (a bcrypt hash; this repository is
-- public, so change it from the admin area: the new one is kept in the database only).
create or replace function public.start_admin_area() returns void
language plpgsql set search_path = ''
as $$
declare v_hq int := (select id from public.business where is_hq);
begin
  if v_hq is null then return; end if;
  perform set_config('app.business_id', v_hq::text, true);
  insert into public.admin_area (business_id, pin_hash)
  values (v_hq, '$2a$12$HJlXgx92xjI2vG6RNWQI4uFiwMD23WnDyCSv8qmMYmgsOGUNcfwqe')
  on conflict do nothing;
  if not exists (select 1 from public.sales_team where business_id = v_hq) then
    insert into public.sales_team (business_id, name, position) values (v_hq, 'Maria Cortes', 1), (v_hq, 'Julio Cesar', 2);
    insert into public.sales_prospects (business_id, member_id, name, instagram)
    select v_hq, m.id, p.name, p.instagram
      from (values ('Maria Cortes', 'The Bootes Cafe', 'the_bootes_cafe', 1), ('Maria Cortes', 'Santa Roaster', 'santaroaster', 2),
                   ('Julio Cesar', 'Keki Marbella', 'kekimarbella', 3), ('Julio Cesar', 'Roasted Spain', 'roasted.spain', 4)) p(who, name, instagram, n)
      join public.sales_team m on m.business_id = v_hq and m.name = p.who
     order by p.n;
  end if;
  perform set_config('app.business_id', '', true);
end $$;
revoke execute on function public.start_admin_area() from public, anon, authenticated, service_role;

select public.start_admin_area();
