-- Ireland's Tax and Grants pages. A business in Ireland now sees Revenue's returns on Tax (the VAT3 every
-- two months and the Return of Trading Details, payroll each month, the CT1 and preliminary tax for a company
-- or Form 11 for a sole trader, the VIES listing for EU sales: shared/taxIreland.ts) and Ireland's grants on
-- Grants (the Local Enterprise Office's, Microfinance Ireland, Enterprise Ireland and SEAI:
-- shared/grantCatalogueIreland.ts). So a new Irish business no longer starts with them hidden (the country
-- migration hid them), and the Irish businesses made since get them back. Spain's are as they were.

-- 1. What's been done about Revenue's returns is kept as Spain's modelos are: their codes, and their periods
--    (1B…6B: two months of VAT, January and February first; 1M…12M: a month of payroll).
alter table public.tax_filings drop constraint tax_filings_model_check,
  add constraint tax_filings_model_check check (model in ('303', '111', '115', '349', '202', '390', '190', '180', '347', '200', 'CCAA',
                                                         'VAT3', 'RTD', 'VIES', 'PAYE', 'CT1', 'F11'));
alter table public.tax_filings drop constraint tax_filings_period_check,
  add constraint tax_filings_period_check check (period in ('1T', '2T', '3T', '4T', '0A', '1P', '2P', '3P',
                                                           '1B', '2B', '3B', '4B', '5B', '6B',
                                                           '1M', '2M', '3M', '4M', '5M', '6M', '7M', '8M', '9M', '10M', '11M', '12M'));

-- 2. What you file, in Ireland: a sole trader files Form 11 instead of a company's CT1 (Spain doesn't use it).
alter table public.tax_settings add column sole_trader boolean not null default false;

-- 3. What a new business starts with: the country migration's, without Grants and Tax hidden in Ireland.
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
  -- Keep in step with KIND_HIDDEN_PAGES in shared/hqReps.ts and COUNTRY_HIDDEN_PAGES in shared/country.ts
  -- (no country hides any now: Grants and Tax have Ireland's own).
  insert into public.settings (hidden_pages) values (case coalesce(p_kind, 'other')
    when 'pub' then array['coffees']
    when 'salon' then array['coffees', 'menu', 'recipes', 'allergens', 'foodsafety', 'waste', 'sports']
    when 'real_estate' then array['coffees', 'menu', 'recipes', 'allergens', 'foodsafety', 'waste', 'stock', 'wholesale',
                                  'screens', 'loyalty', 'music', 'sports', 'tips']
    else '{}'::text[] end);
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

-- 4. The Irish businesses made since the country migration: Grants and Tax shown again.
update public.settings s
   set hidden_pages = array(select p from unnest(s.hidden_pages) with ordinality x(p, n) where p not in ('grants', 'tax') order by n)
  from public.business b
 where b.id = s.business_id and b.country = 'IE' and s.hidden_pages && array['grants', 'tax'];
