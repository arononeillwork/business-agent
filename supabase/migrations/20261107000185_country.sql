-- Spain and Ireland. A business now has a country (ES or IE), asked at sign-up, and starts with that
-- country's rules: working time (breaks, rest, the weekly limit), paid leave, its break types and the VAT
-- rate on Profit & loss; Ireland's starts with Grants and Tax hidden, since those pages are Spain's for now.
-- Public holidays follow the country each night (worker/holidays.ts), and so do the app's labels, VAT rates
-- and tax ID (shared/country.ts). Businesses already here are in Spain.

-- 1. The country, and Irish VAT rates (23%) where VAT rates are kept.
alter table public.business add column country text not null default 'ES' check (country in ('ES', 'IE'));
alter table public.stock_items drop constraint stock_items_vat_rate_check,
  add constraint stock_items_vat_rate_check check (vat_rate between 0 and 25);
alter table public.recipes drop constraint recipes_vat_rate_check,
  add constraint recipes_vat_rate_check check (vat_rate between 0 and 25);

-- 2. Create my business, in a country: the hq_reps migration's, with p_country (asked at sign-up; from the
--    time zone when an older app leaves it out). A new argument makes a new function, so the old one goes.
drop function public.create_business(text, text, text, text);
create or replace function public.create_business(p_name text, p_kind text default null, p_timezone text default null,
  p_referral text default null, p_country text default null)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_me    public.profiles;
  v_name  text := btrim(coalesce(p_name, ''));
  -- The country: as asked at sign-up, else from the time zone (Ireland's is Europe/Dublin), else Spain.
  v_country text := coalesce(nullif(upper(btrim(p_country)), ''), case when p_timezone = 'Europe/Dublin' then 'IE' else 'ES' end);
  v_tz    text := coalesce(nullif(btrim(p_timezone), ''), case when upper(btrim(coalesce(p_country, ''))) = 'IE' then 'Europe/Dublin' else 'Europe/Madrid' end);
  v_code  text := nullif(upper(regexp_replace(coalesce(p_referral, ''), '\s', '', 'g')), '');
  v_by    public.business;
  v_rep   public.sales_reps;
  v_id    int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into v_me from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Sign in first'; end if;
  if v_me.business_id is not null then raise exception 'Your account is already in a business'; end if;
  if char_length(v_name) not between 1 and 120 then raise exception 'Give your business a name (up to 120 characters)' using errcode = '22023'; end if;
  if p_kind is not null and p_kind not in ('cafe', 'restaurant', 'pub', 'salon', 'real_estate', 'other') then raise exception 'Unknown kind of business' using errcode = '22023'; end if;
  if v_country not in ('ES', 'IE') then raise exception 'The Business Agent is for businesses in Spain and Ireland for now' using errcode = '22023'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_tz) then v_tz := case v_country when 'IE' then 'Europe/Dublin' else 'Europe/Madrid' end; end if;
  if v_code is not null then
    select * into v_by from public.business where referral_code = v_code;
    if v_by.id is null then
      v_rep := public.hq_rep(v_code);
      if v_rep.email is not null and v_rep.email = lower(coalesce(v_me.email, '')) then v_rep := null; end if;
    end if;
  end if;

  -- Everything from here is the new business's: its rows, and what their triggers write.
  v_id := nextval('public.business_id_seq');
  perform set_config('app.business_id', v_id::text, true);
  insert into public.business (id, name, business_type, timezone, referred_by, country, locale)
  values (v_id, v_name,
          case p_kind when 'cafe' then 'Café' when 'restaurant' then 'Restaurant & bar' when 'pub' then 'Pub'
                      when 'salon' then 'Salon & beauty' when 'real_estate' then 'Real estate agency' end,
          v_tz, v_by.id, v_country, case v_country when 'IE' then 'en-IE' else 'es-ES' end);
  perform public.seed_new_business(p_kind);

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
  elsif v_rep.id is not null then
    perform public.introduce_business(v_id, v_rep, v_code);
  end if;
  return v_id;
end $$;
revoke execute on function public.create_business(text, text, text, text, text) from public, anon;
grant execute on function public.create_business(text, text, text, text, text) to authenticated;

-- 3. What a new business starts with, by its country too (the pages_by_kind migration's, otherwise as it was).
create or replace function public.seed_new_business(p_kind text) returns void
language plpgsql set search_path = ''
as $$
declare
  v_id      int := nullif(current_setting('app.business_id', true), '')::int;
  v_country text;
begin
  if v_id is null then raise exception 'Say which business: app.business_id'; end if;
  select country into v_country from public.business where id = v_id;
  insert into public.business_admin_notes default values;
  -- Pages that don't fit the kind of business start hidden (Pages: an admin shows any of them again).
  -- Keep in step with KIND_HIDDEN_PAGES in shared/hqReps.ts and COUNTRY_HIDDEN_PAGES in shared/country.ts.
  insert into public.settings (hidden_pages) values (case coalesce(p_kind, 'other')
    when 'pub' then array['coffees']
    when 'salon' then array['coffees', 'menu', 'recipes', 'allergens', 'foodsafety', 'waste', 'sports']
    when 'real_estate' then array['coffees', 'menu', 'recipes', 'allergens', 'foodsafety', 'waste', 'stock', 'wholesale',
                                  'screens', 'loyalty', 'music', 'sports', 'tips']
    else '{}'::text[] end
    -- Ireland: Grants and Tax are Spain's (Andalucía's grants, the AEAT's modelos) until Irish versions exist.
    || case when v_country = 'IE' then array['grants', 'tax'] else '{}'::text[] end);
  -- Ireland's working-time rules (Organisation of Working Time Act 1997): 15 minutes' break after 4½ hours,
  -- 11 hours' rest between days, 48 hours a week on average, and 4 working weeks' paid leave (28 calendar
  -- days, as leave is counted here). Spain keeps the table's defaults (Estatuto de los Trabajadores).
  if v_country = 'IE' then
    update public.settings set break_after_hours = 4.5, min_break_minutes = 15, max_daily_hours = 13,
      max_weekly_hours = 48, min_rest_hours = 11, vacation_days_per_year = 28 where business_id = v_id;
  end if;
  insert into public.billing default values;
  insert into public.brand default values;
  insert into public.music_player default values;
  insert into public.tax_settings default values;
  insert into public.ad_settings default values;
  insert into public.pnl_settings default values;
  -- Ireland: food and drink served in a café or restaurant is at the 13.5% rate.
  if v_country = 'IE' then update public.pnl_settings set vat_rate = 13.5 where business_id = v_id; end if;
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
  insert into public.competitors (is_self, name) select true, left(name, 120) from public.business where id = v_id;
  insert into public.positions (name, colour, sort)
  select x.name, x.colour, x.sort from (values
      ('cafe', 'Barista', '#F79BA4', 1), ('cafe', 'Kitchen', '#6B8E4E', 2),
      ('restaurant', 'Floor', '#F79BA4', 1), ('restaurant', 'Kitchen', '#6B8E4E', 2), ('restaurant', 'Bar', '#B7A3D8', 3),
      ('pub', 'Bar', '#F79BA4', 1), ('pub', 'Kitchen', '#6B8E4E', 2),
      ('salon', 'Stylist', '#F79BA4', 1), ('salon', 'Reception', '#B7A3D8', 2),
      ('real_estate', 'Agent', '#F79BA4', 1), ('real_estate', 'Office', '#B7A3D8', 2)) x(kind, name, colour, sort)
   where x.kind = p_kind
  union all
  select 'Team', '#8d6e63', 1 where coalesce(p_kind, 'other') not in ('cafe', 'restaurant', 'pub', 'salon', 'real_estate');
  -- The break the law asks for (shared/rules.ts): Spain, 15 minutes once a shift is over six hours;
  -- Ireland, 15 minutes after 4½ hours and 30 in all after six, usually unpaid.
  if v_country = 'IE' then
    insert into public.break_types (name, minutes, paid) values ('Break 15 min (unpaid)', 15, false), ('Break 30 min (unpaid)', 30, false);
  else
    insert into public.break_types (name, minutes, paid) values ('Rest 15 min (paid)', 15, true);
  end if;
end $$;
revoke execute on function public.seed_new_business(text) from public, anon, authenticated, service_role;
