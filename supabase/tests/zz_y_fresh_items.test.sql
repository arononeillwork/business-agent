-- Freshly made: the menu items with a set shelf life, how long each keeps and its offer ("25% off for
-- the last 2 days of 5"). Admins set them; the team and finance partners read them; nobody else does.
-- An offer starts before the shelf life ends; a set price needs the price; only this business's menu
-- items; one each.
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

reset role; select set_config('request.jwt.claim.sub', '', false);
insert into auth.users (email, raw_user_meta_data, invited_at) values
  ('fi-gestoria@test', '{"full_name": "Lola", "role": "partner", "partner_company": "Gestoría Sur", "partner_access": ["finances"]}', now()),
  ('fi-payroll@test', '{"full_name": "Pepe", "role": "partner", "partner_company": "Nóminas Sur", "partner_access": ["payroll"]}', now());

-- 1. Maria sets the cheesecake: keeps 5 days, 25% off for its last 2; the chia pudding: 3 days, no offer.
select pg_temp.act_as('maria@test');
insert into public.recipes (name, category, sell_price) values ('FI Biscoff cheesecake', 'Sweet things', 4.50), ('FI Mango chia pudding', 'Chia puddings', 4.50);
insert into public.fresh_items (recipe_id, shelf_life_hours, offer_hours, percent_off)
select id, 120, 48, 25 from public.recipes where name = 'FI Biscoff cheesecake';
insert into public.fresh_items (recipe_id, shelf_life_hours, price)
select id, 72, '  ' from public.recipes where name = 'FI Mango chia pudding';
do $$ begin
  assert (select offer_hours = 48 and percent_off = 25 and not from_square from public.fresh_items f join public.recipes r on r.id = f.recipe_id
           where r.name = 'FI Biscoff cheesecake'), 'the cheesecake, with its offer';
  assert (select price is null and offer_hours is null from public.fresh_items f join public.recipes r on r.id = f.recipe_id
           where r.name = 'FI Mango chia pudding'), 'an empty price is none';
end $$;

-- 2. What stops one: an offer that starts before it's made, a set price without one, a second for the
--    same item, too long a shelf life.
select pg_temp.expect_error($q$update public.fresh_items set offer_hours = 120 where shelf_life_hours = 120 and percent_off = 25$q$, 'fresh_items_offer');
select pg_temp.expect_error($q$update public.fresh_items set discount = 'price' where shelf_life_hours = 120 and percent_off = 25$q$, 'offer price');
select pg_temp.expect_error($q$insert into public.fresh_items (recipe_id, shelf_life_hours) select id, 24 from public.recipes where name = 'FI Biscoff cheesecake'$q$, 'duplicate key');
select pg_temp.expect_error($q$update public.fresh_items set shelf_life_hours = 721 where shelf_life_hours = 72$q$, 'check constraint');

-- 3. Who sees and changes them: the team and a finance partner read, a payroll partner doesn't; only
--    admins add, change and delete.
reset role;
select set_config('fi.recipe', (select id::text from public.recipes where name = 'FI Mango chia pudding'), false);
-- (The team reads the menu through menu_items(), not the recipes themselves: the shelf lives alone here.)
select pg_temp.act_as('julio@test');
do $$ begin assert (select count(*) from public.fresh_items) = 2, 'the team reads them'; end $$;
select pg_temp.expect_error($q$insert into public.fresh_items (recipe_id, shelf_life_hours) values (current_setting('fi.recipe')::uuid, 24)$q$, 'row-level security');
update public.fresh_items set shelf_life_hours = 24 where shelf_life_hours = 72;
delete from public.fresh_items where shelf_life_hours = 120;
select pg_temp.act_as('fi-gestoria@test');
do $$ begin assert (select count(*) from public.fresh_items) >= 2, 'a finance partner reads them'; end $$;
select pg_temp.act_as('fi-payroll@test');
do $$ begin assert (select count(*) from public.fresh_items) = 0, 'a payroll partner sees none'; end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.fresh_items where shelf_life_hours = 72), 'the team doesn''t change one';
  assert exists (select 1 from public.fresh_items where shelf_life_hours = 120), 'the team doesn''t delete one';
end $$;
select pg_temp.act_as('maria@test');
delete from public.fresh_items f using public.recipes r where r.id = f.recipe_id and r.name = 'FI Mango chia pudding';
reset role;
do $$ begin assert (select count(*) from public.fresh_items f join public.recipes r on r.id = f.recipe_id where r.name like 'FI %') = 1, 'an admin deletes one'; end $$;

-- 3b. An admin takes one off the list: it stays, not made here (so the menu doesn't put it back), and
--     adding it again puts it back. Everything's on the list to start with.
select pg_temp.act_as('maria@test');
insert into public.fresh_items (recipe_id, shelf_life_hours) select id, 72 from public.recipes where name = 'FI Mango chia pudding';
do $$ begin assert (select bool_and(made_here) from public.fresh_items f join public.recipes r on r.id = f.recipe_id where r.name like 'FI %'), 'on the list'; end $$;
update public.fresh_items f set made_here = false from public.recipes r where r.id = f.recipe_id and r.name = 'FI Mango chia pudding';
select pg_temp.act_as('julio@test');
update public.fresh_items set made_here = true;
reset role;
do $$ begin
  assert (select not made_here from public.fresh_items f join public.recipes r on r.id = f.recipe_id where r.name = 'FI Mango chia pudding'), 'taken off, and the team doesn''t put it back';
end $$;
select pg_temp.act_as('maria@test');
update public.fresh_items f set made_here = true from public.recipes r where r.id = f.recipe_id and r.name = 'FI Mango chia pudding';
delete from public.fresh_items f using public.recipes r where r.id = f.recipe_id and r.name = 'FI Mango chia pudding';
reset role;

-- 4. The menu item gone, its shelf life goes with it.
delete from public.recipes where name = 'FI Biscoff cheesecake';
do $$ begin assert not exists (select 1 from public.fresh_items f where not exists (select 1 from public.recipes r where r.id = f.recipe_id)), 'gone with its item'; end $$;

-- Tidy up.
reset role;
delete from public.recipes where name like 'FI %';
delete from auth.users where email in ('fi-gestoria@test', 'fi-payroll@test');
