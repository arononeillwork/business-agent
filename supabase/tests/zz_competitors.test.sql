-- Competitors: the business is one row (kept, with its name), places and prices are tidied and kept
-- with their history, ideas carry a status, and only admins see or change any of it. Google's side
-- (snapshots, what's nearby, when it last looked) is the Worker's to write: admins only put places
-- aside and set how far to look.
-- People from the tests before it: maria (admin), julio (employee).

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

-- The business's own row: there from the start, with the business's name, following a rename.
create temp table business_name as select name from public.business where id = 1;
do $$ begin
  assert (select count(*) from public.competitors where is_self) = 1, 'one row for the business';
  assert (select name from public.competitors where is_self) = (select name from public.business where id = 1), 'with its name';
  update public.business set name = 'Easy Beans Coffee' where id = 1;
  assert (select name from public.competitors where is_self) = 'Easy Beans Coffee', 'renamed with the business';
end $$;

select pg_temp.act_as('maria@test');
do $$
declare v_molino uuid; v_plaza uuid; v_fw uuid; v_recipe uuid;
begin
  insert into public.competitors (name, kind, threat, address, website, instagram, features, notes)
    values ('  Molino Coffee Lab ', 'specialty', 'high', ' Calle Marqués del Duero 12 ', ' https://molino.example ', 'https://www.instagram.com/molino.coffee/', '{"matcha": true}', '  ')
    returning id into v_molino;
  insert into public.competitors (name, kind, threat, instagram) values ('Café Bar La Plaza', 'cafe_bar', 'medium', '@laplaza_sp') returning id into v_plaza;
  assert (select name = 'Molino Coffee Lab' and address = 'Calle Marqués del Duero 12' and website = 'https://molino.example'
          and instagram = 'molino.coffee' and notes is null and updated_by = auth.uid() from public.competitors where id = v_molino), 'tidied and stamped';
  assert (select instagram from public.competitors where id = v_plaza) = 'laplaza_sp', 'the handle without @';

  -- The business itself: no threat, always followed, never another one, never removed.
  update public.competitors set threat = 'high', active = false where is_self;
  assert (select threat is null and active from public.competitors where is_self), 'the business doesn’t compete with itself';

  -- The basket, one of each name, linked to the menu.
  insert into public.recipes (name, sell_price) values ('Flat white (comp test)', 3.2) returning id into v_recipe;
  insert into public.competitor_items (name, recipe_id, sort) values (' Flat white ', v_recipe, 1) returning id into v_fw;
  assert (select name from public.competitor_items where id = v_fw) = 'Flat white', 'tidied';

  -- Prices: each one kept, the newest first.
  insert into public.competitor_prices (competitor_id, item_id, price, observed_on, note) values (v_molino, v_fw, 2.8, current_date - 120, ' ');
  insert into public.competitor_prices (competitor_id, item_id, price, observed_on, source) values (v_molino, v_fw, 3.0, current_date - 3, 'menu');
  assert (select count(*) from public.competitor_prices where competitor_id = v_molino) = 2, 'both kept';
  assert (select note is null and created_by = auth.uid() from public.competitor_prices where price = 2.8), 'tidied and stamped';

  -- Notes; ideas get a status, others none.
  insert into public.competitor_notes (competitor_id, kind, text) values (v_molino, 'idea', ' Stamp card: the 10th coffee free ');
  insert into public.competitor_notes (competitor_id, kind, text, status) values (v_plaza, 'promotion', '2x1 on Mondays', 'adopted');
  insert into public.competitor_notes (kind, text) values ('other', 'Oat milk is the default in three cafés now');
  assert (select status = 'new' and text = 'Stamp card: the 10th coffee free' from public.competitor_notes where kind = 'idea'), 'an idea starts to try';
  assert (select status is null from public.competitor_notes where kind = 'promotion'), 'only ideas have a status';
  update public.competitor_notes set kind = 'visit' where kind = 'idea';
  assert (select status is null from public.competitor_notes where text like 'Stamp card%'), 'no longer an idea: no status';

  -- A menu item that goes leaves the basket item unlinked.
  delete from public.recipes where id = v_recipe;
  assert (select recipe_id is null from public.competitor_items where id = v_fw), 'unlinked';

  -- Admins put places aside and set how far to look; they don't write Google's side.
  update public.competitor_settings set radius_m = 500, scan_weekly = false;
  assert (select radius_m = 500 and not scan_weekly from public.competitor_settings), 'settings changed';
end $$;
select pg_temp.expect_error($q$insert into public.competitors (is_self, name) values (true, 'Another me')$q$, 'competitors_one_self');
select pg_temp.expect_error($q$update public.competitors set is_self = true where name = 'Molino Coffee Lab'$q$, 'stays the business');
select pg_temp.expect_error($q$delete from public.competitors where is_self$q$, 'can’t be removed');
select pg_temp.expect_error($q$insert into public.competitors (name, kind) values ('X', 'pub')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.competitors (name, instagram) values ('X', 'two words')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.competitors (name, website) values ('X', 'molino.example')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.competitor_items (name) values ('flat white')$q$, 'competitor_items_name');
select pg_temp.expect_error($q$insert into public.competitor_prices (competitor_id, item_id, price) select c.id, i.id, -1 from public.competitors c, public.competitor_items i limit 1$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.competitor_prices (competitor_id, item_id, price, observed_on) select c.id, i.id, 3, current_date + 7 from public.competitors c, public.competitor_items i limit 1$q$, 'in the future');
select pg_temp.expect_error($q$update public.competitor_settings set scanned_at = now()$q$, 'permission denied');
select pg_temp.expect_error($q$insert into public.competitor_snapshots (competitor_id, rating) select id, 4.5 from public.competitors limit 1$q$, 'permission denied');
select pg_temp.expect_error($q$insert into public.competitor_radar (place_id, name) values ('p1', 'Sneaky')$q$, 'permission denied');

-- Google's side, as the Worker writes it.
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  insert into public.competitor_snapshots (competitor_id, taken_on, rating, review_count)
    select id, current_date - 7, 4.7, 400 from public.competitors where name = 'Molino Coffee Lab';
  insert into public.competitor_radar (place_id, name, distance_m) values ('ChIJ-nuevo', 'Nuevo Café', 150), ('ChIJ-hotel', 'Hotel bar', 90);
  update public.competitor_settings set scanned_at = now();
end $$;

select pg_temp.act_as('maria@test');
do $$ begin
  update public.competitor_radar set dismissed = true where place_id = 'ChIJ-hotel';
  assert (select dismissed from public.competitor_radar where place_id = 'ChIJ-hotel'), 'put aside';
  assert (select count(*) from public.competitor_snapshots) = 1, 'admins read the snapshots';
end $$;
select pg_temp.expect_error($q$update public.competitor_radar set name = 'Renamed'$q$, 'permission denied');

-- Removing a place takes its prices, notes and snapshots with it.
do $$ begin
  delete from public.competitors where name = 'Molino Coffee Lab';
  assert (select count(*) from public.competitor_prices) = 0, 'its prices';
  assert (select count(*) from public.competitor_notes where text like 'Stamp card%') = 0, 'its notes';
  assert (select count(*) from public.competitor_snapshots) = 0, 'its snapshots';
  assert (select count(*) from public.competitor_notes where competitor_id is null) = 1, 'notes about the area stay';
end $$;

select pg_temp.act_as('julio@test');
do $$ declare n int; begin
  assert (select count(*) from public.competitors) = 0, 'employees see no competitors';
  assert (select count(*) from public.competitor_prices) + (select count(*) from public.competitor_notes) + (select count(*) from public.competitor_radar)
       + (select count(*) from public.competitor_settings) = 0, 'nor anything about them';
  update public.competitors set name = 'Hacked'; get diagnostics n = row_count;
  assert n = 0, 'and change none';
end $$;
select pg_temp.expect_error($q$insert into public.competitors (name) values ('Sneaky')$q$, 'row-level security');
select pg_temp.expect_error($q$insert into public.competitor_notes (kind, text) values ('other', 'Sneaky')$q$, 'row-level security');

reset role;
select set_config('request.jwt.claim.sub', '', false);
update public.business set name = (select name from business_name) where id = 1;
