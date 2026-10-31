-- Theme days and the weekly routine: Easy Beans starts with its coffees, three themes in the owner's
-- order and a café's usual week; the team reads them all and ticks routine activities done, admins
-- change them, and partners and the café tablet see none. Everything typed is tidied and kept within
-- the business.
-- People from the tests before it: maria (admin), julio (employee); td-tablet is new here.

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

create function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_err text;
begin
  begin execute p_sql; exception when others then v_err := sqlerrm; end;
  if v_err is null then raise exception 'Expected error like "%" but statement succeeded: %', p_like, p_sql; end if;
  if v_err not ilike '%' || p_like || '%' then raise exception 'Expected error like "%", got "%"', p_like, v_err; end if;
end $$;

reset role; select set_config('request.jwt.claim.sub', '', false);
insert into auth.users (email, raw_user_meta_data, invited_at) values ('td-tablet@test', '{"full_name":"Tablet"}', now());
update public.profiles set role = 'kiosk' where email = 'td-tablet@test';

-- 1. Easy Beans' starters: the coffees, Irish, then Colombian, then Brazilian roast from Monday, nothing on
--    Sunday, St Patrick's Day an Irish day; and the usual week, nothing on Sunday.
select pg_temp.act_as('julio@test');
do $$ begin
  assert (select array_agg(name order by sort) from public.coffees)
    = array['Brazilian dark roast', 'Brazilian light roast', 'Colombian (guest)', 'Irish blend (guest)'], 'the four coffees';
  assert (select country = 'CO' and roast = 'medium' and photo is null from public.coffees where name = 'Colombian (guest)'), 'from Colombia, no photo yet';
  assert (select array_agg(t.name order by s.weekday) from public.day_theme_schedule s join public.day_themes t on t.id = s.theme_id)
    = array['Irish day', 'Colombian day', 'Brazilian roast day', 'Irish day', 'Colombian day', 'Brazilian roast day'], 'Monday to Saturday';
  assert not exists (select 1 from public.day_theme_schedule where weekday = 7), 'nothing on Sunday';
  assert (select c.name from public.day_themes t join public.coffees c on c.id = t.coffee_id where t.name = 'Colombian day') = 'Colombian (guest)', 'each serves its coffee';
  assert (select emoji from public.day_themes where name = 'Irish day') = '🇮🇪', 'with its flag';
  assert (select t.name from public.day_theme_dates d join public.day_themes t on t.id = d.theme_id where d.day = '2027-03-17') = 'Irish day', 'St Patrick''s Day';
  assert (select count(*) from public.routine_items where active) = 12, 'a café''s usual week';
  assert (select starts_at = '09:00' and category = 'stock' and cardinality(checklist) = 3 from public.routine_items where name = 'Stock take and buying list'), 'Monday''s stock take';
  assert (select month_week = 1 and weekdays = '{1}' from public.routine_items where name = 'Licence and insurance check'), 'the first Monday of the month';
  assert not exists (select 1 from public.routine_items where 7 = any(weekdays)), 'nothing on Sunday';
end $$;

-- 2. An employee reads it all and changes none of it.
select pg_temp.expect_error($q$insert into public.coffees (name) values ('Kenya AA')$q$, 'row-level security');
select pg_temp.expect_error($q$insert into public.day_themes (name) values ('Kenyan day')$q$, 'row-level security');
select pg_temp.expect_error($q$insert into public.day_theme_dates (day, theme_id) values ('2026-12-25', null)$q$, 'row-level security');
select pg_temp.expect_error($q$insert into public.routine_items (name, category, weekdays) values ('Nap', 'team', '{1}')$q$, 'row-level security');
do $$ begin
  update public.coffees set name = 'Renamed';
  delete from public.day_theme_schedule;
  update public.routine_items set active = false;
  assert (select count(*) from public.coffees where name = 'Renamed') = 0, 'coffees unchanged';
  assert (select count(*) from public.day_theme_schedule) = 6, 'rotation unchanged';
  assert (select count(*) from public.routine_items where active) = 12, 'routine unchanged';
end $$;

-- 3. An admin adds a coffee with its photo (tidied; only a small data: URL), and a theme that serves it
--    and plays a playlist.
select pg_temp.act_as('maria@test');
do $$
declare v_coffee public.coffees; v_theme public.day_themes;
begin
  insert into public.coffees (name, country, region, roaster, roast, process, tasting_notes, brew, bag_grams, bag_price, photo)
  values ('  Kenya AA  ', 'KE', '  Nyeri ', '', 'light', 'washed', ' Blackcurrant, grapefruit ', 'filter', 250, 12.5, 'data:image/jpeg;base64,/9j/4AAQ')
  returning * into v_coffee;
  assert v_coffee.name = 'Kenya AA' and v_coffee.region = 'Nyeri' and v_coffee.roaster is null and v_coffee.tasting_notes = 'Blackcurrant, grapefruit', 'tidied';
  assert v_coffee.updated_by = auth.uid(), 'stamped';
  insert into public.day_themes (name, emoji, colour, coffee_id, playlist, notes)
  values (' Kenyan day ', ' 🇰🇪 ', '#006600', v_coffee.id, '{"id": "PLkenya", "name": "Benga", "url": "https://music.youtube.com/playlist?list=PLkenya", "provider": "youtube"}', '  ')
  returning * into v_theme;
  assert v_theme.name = 'Kenyan day' and v_theme.emoji = '🇰🇪' and v_theme.notes is null, 'theme tidied';
  assert v_theme.playlist ->> 'name' = 'Benga', 'with its playlist';
end $$;
select pg_temp.expect_error($q$insert into public.coffees (name, photo) values ('Rex', 'https://example.com/bag.jpg')$q$, 'coffees_photo_check');
select pg_temp.expect_error($q$insert into public.coffees (name, country) values ('Somewhere', 'Colombia')$q$, 'coffees_country_check');
select pg_temp.expect_error($q$insert into public.coffees (name) values ('kenya aa')$q$, 'coffees_name_key');
select pg_temp.expect_error($q$insert into public.coffees (name, roast) values ('Burnt', 'charcoal')$q$, 'coffees_roast_check');
select pg_temp.expect_error($q$insert into public.day_themes (name, colour) values ('Grey day', 'grey')$q$, 'day_themes_colour_check');
select pg_temp.expect_error($q$insert into public.day_themes (name, playlist) values ('Bad day', '{"id": "x", "name": "x", "url": "javascript:alert(1)"}')$q$, 'day_themes_playlist_check');
select pg_temp.expect_error($q$insert into public.day_themes (name, coffee_id) values ('Ghost day', gen_random_uuid())$q$, 'isn''t on the Coffees page');

-- 4. The rotation and dates: Sunday becomes Kenyan, Christmas has no theme, a theme that isn't the
--    business's can't be used; removing the theme takes it off both.
do $$
declare v_kenyan uuid := (select id from public.day_themes where name = 'Kenyan day');
begin
  insert into public.day_theme_schedule (weekday, theme_id) values (7, v_kenyan);
  update public.day_theme_schedule set theme_id = v_kenyan where weekday = 1;
  insert into public.day_theme_dates (day, theme_id, note) values ('2026-12-25', null, '  '), ('2026-12-31', v_kenyan, ' Party ');
  assert (select note is null and theme_id is null from public.day_theme_dates where day = '2026-12-25'), 'no theme at Christmas';
  assert (select note = 'Party' and updated_by = auth.uid() from public.day_theme_dates where day = '2026-12-31'), 'tidied and stamped';
  delete from public.day_themes where id = v_kenyan;
  assert not exists (select 1 from public.day_theme_schedule where weekday in (1, 7)), 'off the rotation';
  assert not exists (select 1 from public.day_theme_dates where day = '2026-12-31'), 'and off its date';
  assert exists (select 1 from public.day_theme_dates where day = '2026-12-25'), 'a day with no theme stays';
  -- Monday goes back to Irish for the rest of the tests.
  insert into public.day_theme_schedule (weekday, theme_id) select 1, id from public.day_themes where name = 'Irish day';
  delete from public.day_theme_dates where day = '2026-12-25';
end $$;
select pg_temp.expect_error($q$insert into public.day_theme_schedule (weekday, theme_id) values (7, gen_random_uuid())$q$, 'isn''t one of yours');
select pg_temp.expect_error($q$insert into public.day_theme_schedule (weekday, theme_id) select 8, id from public.day_themes limit 1$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.day_theme_schedule (weekday, theme_id) select 2, id from public.day_themes limit 1$q$, 'day_theme_schedule_pkey');

-- 5. A coffee that goes leaves its theme without one; the theme stays.
do $$ begin
  delete from public.coffees where name = 'Irish blend (guest)';
  assert (select coffee_id is null from public.day_themes where name = 'Irish day'), 'the theme has no coffee now';
  insert into public.coffees (name, country, roast, sort) values ('Irish blend (guest)', 'IE', 'medium', 4);
  update public.day_themes set coffee_id = (select id from public.coffees where name = 'Irish blend (guest)') where name = 'Irish day';
end $$;

-- 6. The routine: an admin adds an activity for someone on the team (tidied), or for a role, not both;
--    times in order; one week of the month only weekly; only someone on the team.
do $$
declare v_item public.routine_items;
begin
  insert into public.routine_items (name, category, weekdays, every_weeks, starts_on, starts_at, ends_at, profile_id, checklist, notes)
  values ('  Window clean ', 'cleaning', '{5,2,2}', 2, '2026-09-28', '07:30', '08:00', (select id from public.profiles where email = 'julio@test'),
          '{"  Inside  ", "", "Outside"}', '  ')
  returning * into v_item;
  assert v_item.name = 'Window clean' and v_item.weekdays = '{2,5}' and v_item.checklist = '{Inside,Outside}' and v_item.notes is null, 'tidied';
end $$;
select pg_temp.expect_error($q$insert into public.routine_items (name, category, weekdays, starts_at, ends_at) values ('Backwards', 'team', '{1}', '10:00', '09:00')$q$, 'routine_items_slot');
select pg_temp.expect_error($q$insert into public.routine_items (name, category, weekdays, every_weeks, month_week) values ('Odd', 'team', '{1}', 2, 1)$q$, 'routine_items_month_week');
select pg_temp.expect_error($q$insert into public.routine_items (name, category, weekdays) values ('Someday', 'team', '{0}')$q$, 'routine_items_weekdays_check');
select pg_temp.expect_error($q$insert into public.routine_items (name, category, weekdays) values ('Dance', 'party', '{1}')$q$, 'routine_items_category_check');
select pg_temp.expect_error($q$insert into public.routine_items (name, category, weekdays, profile_id) values ('Tablet job', 'team', '{1}', (select id from public.profiles where email = 'td-tablet@test'))$q$, 'someone on the team');
select pg_temp.expect_error($q$insert into public.routine_items (name, category, weekdays, job_role_id) values ('Ghost role', 'team', '{1}', gen_random_uuid())$q$, 'one of your roles');
insert into public.job_roles (name, sort) values ('Window cleaner', 99);
select pg_temp.expect_error($q$insert into public.routine_items (name, category, weekdays, profile_id, job_role_id) select 'Both', 'team', '{1}', (select id from public.profiles where email = 'julio@test'), id from public.job_roles where name = 'Window cleaner'$q$, 'routine_items_one_owner');
do $$ begin
  insert into public.routine_items (name, category, weekdays, job_role_id) values ('Gutters', 'maintenance', '{3}', (select id from public.job_roles where name = 'Window cleaner'));
  delete from public.job_roles where name = 'Window cleaner';
  assert (select job_role_id is null from public.routine_items where name = 'Gutters'), 'a role that goes leaves it with nobody';
  delete from public.routine_items where name = 'Gutters';
end $$;

-- 7. Done for the day: Julio ticks the window clean done (as himself, whoever he says), can't untick
--    Maria's; an admin unticks anyone's; removing the activity removes its ticks.
select pg_temp.act_as('julio@test');
do $$
declare v_item uuid := (select id from public.routine_items where name = 'Window clean');
begin
  insert into public.routine_done (item_id, day, done_by) values (v_item, '2026-09-29', (select id from public.profiles where email = 'maria@test'));
  assert (select done_by = auth.uid() from public.routine_done where item_id = v_item and day = '2026-09-29'), 'ticked as himself';
end $$;
select pg_temp.expect_error($q$insert into public.routine_done (item_id, day) select id, '2026-09-29' from public.routine_items where name = 'Window clean'$q$, 'routine_done_pkey');
select pg_temp.expect_error($q$insert into public.routine_done (item_id, day) values (gen_random_uuid(), '2026-09-29')$q$, 'isn''t on the routine');
select pg_temp.act_as('maria@test');
insert into public.routine_done (item_id, day) select id, '2026-10-02' from public.routine_items where name = 'Window clean';
select pg_temp.act_as('julio@test');
do $$ begin
  delete from public.routine_done where day = '2026-10-02';
  assert exists (select 1 from public.routine_done where day = '2026-10-02'), 'not his to untick';
  delete from public.routine_done where day = '2026-09-29';
  assert not exists (select 1 from public.routine_done where day = '2026-09-29'), 'his own he unticks';
end $$;
select pg_temp.act_as('maria@test');
do $$ begin
  insert into public.routine_done (item_id, day) select id, '2026-09-29' from public.routine_items where name = 'Window clean';
  delete from public.routine_done where day = '2026-10-02';
  assert (select count(*) from public.routine_done) = 1, 'an admin unticks anyone''s';
  update public.routine_items set active = false where name = 'Fridge temperature log review';
  assert (select count(*) from public.routine_items where active) = 12, 'switched off, kept';
  delete from public.routine_items where name = 'Window clean';
  assert (select count(*) from public.routine_done) = 0, 'its ticks went with it';
  update public.routine_items set active = true where name = 'Fridge temperature log review';
end $$;

-- 8. The café tablet sees none of it.
select pg_temp.act_as('td-tablet@test');
do $$ begin
  assert (select count(*) from public.coffees) = 0, 'no coffees';
  assert (select count(*) from public.day_themes) = 0, 'no themes';
  assert (select count(*) from public.day_theme_schedule) + (select count(*) from public.day_theme_dates) = 0, 'no rotation or dates';
  assert (select count(*) from public.routine_items) + (select count(*) from public.routine_done) = 0, 'no routine';
end $$;

reset role; select set_config('request.jwt.claim.sub', '', false);
delete from auth.users where email = 'td-tablet@test';
delete from public.coffees where name = 'Kenya AA';
