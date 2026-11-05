-- Two more kinds of business to sign up as: a pub and a real estate agency (the set-up guide
-- suggests the apps each usually connects first, src/app/setupPresets.ts). create_business is the
-- self_serve_sign_up migration's, unchanged but for the kinds it takes, what it calls them and the
-- positions each starts with: a pub's bar and kitchen, an agency's agents and office.
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
  if p_kind is not null and p_kind not in ('cafe', 'restaurant', 'pub', 'salon', 'real_estate', 'other') then raise exception 'Unknown kind of business' using errcode = '22023'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_tz) then v_tz := 'Europe/Madrid'; end if;
  if nullif(btrim(p_referral), '') is not null then
    select * into v_by from public.business where referral_code = upper(btrim(p_referral));
  end if;

  -- Everything from here is the new business's: its rows, and what their triggers write.
  v_id := nextval('public.business_id_seq');
  perform set_config('app.business_id', v_id::text, true);
  insert into public.business (id, name, business_type, timezone, referred_by)
  values (v_id, v_name,
          case p_kind when 'cafe' then 'Café' when 'restaurant' then 'Restaurant & bar' when 'pub' then 'Pub'
                      when 'salon' then 'Salon & beauty' when 'real_estate' then 'Real estate agency' end,
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
      ('pub', 'Bar', '#F79BA4', 1), ('pub', 'Kitchen', '#6B8E4E', 2),
      ('salon', 'Stylist', '#F79BA4', 1), ('salon', 'Reception', '#B7A3D8', 2),
      ('real_estate', 'Agent', '#F79BA4', 1), ('real_estate', 'Office', '#B7A3D8', 2)) x(kind, name, colour, sort)
   where x.kind = p_kind
  union all
  select 'Team', '#8d6e63', 1 where coalesce(p_kind, 'other') not in ('cafe', 'restaurant', 'pub', 'salon', 'real_estate');
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
