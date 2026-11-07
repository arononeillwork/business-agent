-- Pages that fit the kind of business. Every new business saw every page: a hair salon got Coffees,
-- Menu and Allergens; an estate agency got Stock and Food safety too. Now create_business() (through
-- seed_new_business()) starts a business with the pages that don't fit its kind hidden, using the Pages
-- setting that already exists (settings.hidden_pages), so an admin can show any of them again on Pages.
-- A café, a restaurant and "other" see everything, as before; businesses that exist are left alone.
-- The rest of seed_new_business() is as the hq_reps migration made it.
create or replace function public.seed_new_business(p_kind text) returns void
language plpgsql set search_path = ''
as $$
declare v_id int := nullif(current_setting('app.business_id', true), '')::int;
begin
  if v_id is null then raise exception 'Say which business: app.business_id'; end if;
  insert into public.business_admin_notes default values;
  -- Pages that don't fit the kind of business start hidden (Pages: an admin shows any of them again).
  -- Keep in step with KIND_HIDDEN_PAGES in shared/hqReps.ts.
  insert into public.settings (hidden_pages) values (case coalesce(p_kind, 'other')
    when 'pub' then array['coffees']
    when 'salon' then array['coffees', 'menu', 'recipes', 'allergens', 'foodsafety', 'waste', 'sports']
    when 'real_estate' then array['coffees', 'menu', 'recipes', 'allergens', 'foodsafety', 'waste', 'stock', 'wholesale',
                                  'screens', 'loyalty', 'music', 'sports', 'tips']
    else '{}'::text[] end);
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
  -- Spain: 15 minutes' break once a shift is over six hours (shared/rules.ts).
  insert into public.break_types (name, minutes, paid) values ('Rest 15 min (paid)', 15, true);
end $$;
revoke execute on function public.seed_new_business(text) from public, anon, authenticated, service_role;
