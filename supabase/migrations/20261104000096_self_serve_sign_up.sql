-- Self-serve sign-up: anyone can create an account, then their own business, and go on to the set-up
-- guide (docs/SEVERAL_BUSINESSES.md). Someone who signs up on their own is in no business until they
-- create one (create_business) or an admin adds them to theirs.

-- ---------------------------------------------------------------------------
-- A new account: invited into a business, or in none yet
-- ---------------------------------------------------------------------------
-- An invite joins the business the Worker names (an invite from before it named one: the only
-- business there is). Someone nobody invited is in no business, except on a brand-new database whose
-- one business nobody runs yet: the first person to sign up runs it. The first person in a business
-- with no admin is its admin.
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
  if v_business is null and v_invited then
    select min(id) into v_business from public.business having count(*) = 1;
  end if;
  if v_business is null then
    select b.id into v_business from public.business b
     where (select count(*) from public.business) = 1
       and not exists (select 1 from public.profiles p where p.business_id = b.id and p.role = 'admin');
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

-- ---------------------------------------------------------------------------
-- Referrals: the business a referral became, and who referred a business
-- ---------------------------------------------------------------------------
alter table public.business add column referred_by int references public.business on delete set null;
create index business_referred_by_idx on public.business (referred_by);
alter table public.referrals add column became int references public.business on delete set null;
create index referrals_became_idx on public.referrals (became);

-- ---------------------------------------------------------------------------
-- Create my business
-- ---------------------------------------------------------------------------
-- Someone signed in and in no business creates theirs and runs it: its admin and first boss, on the
-- Free plan. It starts with what every business has (its settings, the apps to connect, the sports
-- catalogue, to-do categories, itself on Competitors) and a position and a break for its kind. A
-- referral code (another business's link) is that business's referral: the new one gets its month
-- free, and the referrer's month counts once the new business finishes set-up (business_set_up()).
-- Works across businesses (the new one, the referrer's list), so it stays with postgres.
create or replace function public.create_business(p_name text, p_kind text default null, p_timezone text default null,
  p_referral text default null)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_me    public.profiles;
  v_name  text := btrim(coalesce(p_name, ''));
  v_tz    text := coalesce(nullif(btrim(p_timezone), ''), 'Europe/Madrid');
  v_by    public.business;
  v_id    int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into v_me from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Sign in first'; end if;
  if v_me.business_id is not null then raise exception 'Your account is already in a business'; end if;
  if char_length(v_name) not between 1 and 120 then raise exception 'Give your business a name (up to 120 characters)' using errcode = '22023'; end if;
  if p_kind is not null and p_kind not in ('cafe', 'restaurant', 'salon', 'other') then raise exception 'Unknown kind of business' using errcode = '22023'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_tz) then v_tz := 'Europe/Madrid'; end if;
  if nullif(btrim(p_referral), '') is not null then
    select * into v_by from public.business where referral_code = upper(btrim(p_referral));
  end if;

  -- Everything from here is the new business's: its rows, and what their triggers write.
  v_id := nextval('public.business_id_seq');
  perform set_config('app.business_id', v_id::text, true);
  insert into public.business (id, name, business_type, timezone, referred_by)
  values (v_id, v_name,
          case p_kind when 'cafe' then 'Café' when 'restaurant' then 'Restaurant & bar' when 'salon' then 'Salon & beauty' end,
          v_tz, v_by.id);

  insert into public.business_admin_notes default values;
  insert into public.settings default values;
  insert into public.billing default values;
  insert into public.brand default values;
  insert into public.music_player default values;
  insert into public.tax_settings default values;
  insert into public.ad_settings default values;
  insert into public.pnl_settings default values;
  insert into public.website_checks default values;
  insert into public.competitor_settings default values;
  insert into public.rep_settings default values;
  insert into public.kitty_settings default values;
  insert into public.grant_profile default values;
  -- Every app the others can connect, and the sports catalogue (nothing followed yet).
  insert into public.integrations (provider) select distinct provider from public.integrations where business_id <> v_id;
  insert into public.sports_competitions (code, source, source_id, name, sport, region, kind, season_style, followed, sort)
  select distinct on (code) code, source, source_id, name, sport, region, kind, season_style, false, sort
    from public.sports_competitions where business_id <> v_id order by code, business_id;
  insert into public.todo_categories (name, hint, colour, sort) values
    ('Legal & money',    'Contracts, licences, insurance, bills', '#2F4C73', 1),
    ('People',           'Roles, reviews, standards, hiring, pay', '#21907F', 2),
    ('Shop',             'The space: fit-out, repairs, cleaning',  '#D46A2E', 3),
    ('Buying',           'Stock, packaging, equipment',            '#C2961C', 4),
    ('Food & drink',     'Menu, recipes, ingredients, prep',       '#4F8A3F', 5),
    ('Tech & till',      'Till, wifi, TV, website',                '#4B4FB0', 6),
    ('Design',           'Menus, signage, branding, print',        '#7C52AE', 7),
    ('Social & content', 'Photos, videos, posts',                  '#2479A8', 8),
    ('Marketing',        'Events, collabs, outreach',              '#B23C78', 9),
    ('Future ideas',     'New business ideas for later',           '#6E7D1A', 10);
  insert into public.competitors (is_self, name) values (true, left(v_name, 120));
  insert into public.positions (name, colour, sort)
  select x.name, x.colour, x.sort from (values
      ('cafe', 'Barista', '#F79BA4', 1), ('cafe', 'Kitchen', '#6B8E4E', 2),
      ('restaurant', 'Floor', '#F79BA4', 1), ('restaurant', 'Kitchen', '#6B8E4E', 2), ('restaurant', 'Bar', '#B7A3D8', 3),
      ('salon', 'Stylist', '#F79BA4', 1), ('salon', 'Reception', '#B7A3D8', 2)) x(kind, name, colour, sort)
   where x.kind = p_kind
  union all
  select 'Team', '#8d6e63', 1 where coalesce(p_kind, 'other') not in ('cafe', 'restaurant', 'salon');
  -- Spain: 15 minutes' break once a shift is over six hours (shared/rules.ts).
  insert into public.break_types (name, minutes, paid) values ('Rest 15 min (paid)', 15, true);

  -- Its creator runs it.
  perform set_config('app.business_setup', 'on', true);
  update public.profiles set business_id = v_id, role = 'admin', can_see_pay = true, active = true where id = v_me.id;
  perform set_config('app.business_setup', '', true);

  if v_by.id is not null and v_by.id <> v_id then
    -- Its month for being referred, and the referrer's list (one row per business that joined).
    update public.billing set referred_by = v_by.name, referred_month = true, updated_at = now() where business_id = v_id;
    if v_me.email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      insert into public.referrals (business_id, business_name, contact_name, email, became)
      values (v_by.id, v_name, left(v_me.full_name, 120), lower(v_me.email), v_id)
      on conflict (business_id, email) do update set business_name = excluded.business_name, became = excluded.became;
    end if;
  end if;
  return v_id;
end $$;
revoke execute on function public.create_business(text, text, text, text) from public, anon;
grant execute on function public.create_business(text, text, text, text) to authenticated;

-- A referred business finished its set-up guide: that's when the referrer's free month counts.
create or replace function public.business_set_up()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.setup_completed_at is not null and old.setup_completed_at is null and new.referred_by is not null then
    update public.referrals set set_up_at = coalesce(set_up_at, now()) where business_id = new.referred_by and became = new.id;
  end if;
  return null;
end $$;
revoke execute on function public.business_set_up() from public, anon, authenticated;
create trigger business_set_up after update of setup_completed_at on public.business
  for each row execute function public.business_set_up();
