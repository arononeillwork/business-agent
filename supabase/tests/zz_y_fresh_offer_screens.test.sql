-- Freshly made: which screens a batch's offer shows on (the fresh_offer_screens migration). An item made
-- here picks the screens (or every screen that's on, or none) and how (in turn, or on its own); a batch
-- of it shows its offer there, unless the batch picks its own; a change to the batch's screens moves its
-- offer, a change to anything else keeps where an admin put it. People from the tests before it: maria
-- (admin), julio (employee). Its own rows, removed at the end.

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

-- The menu items, two screens, and how each item's offer shows (as an admin).
select pg_temp.act_as('maria@test');
insert into public.recipes (name, category, sell_price) values ('FO Cheesecake', 'Cakes', 4.00), ('FO Muffin', 'Bakery', 2.50), ('FO Scone', 'Bakery', 2.00);
insert into public.screens (name) values ('FO counter TV'), ('FO window TV');
insert into public.fresh_items (recipe_id, shelf_life_hours, offer_hours, screen_ids, screen_mode)
select id, 72, 24, array[(select id from public.screens where name = 'FO window TV')], 'only' from public.recipes where name = 'FO Cheesecake';
insert into public.fresh_items (recipe_id, shelf_life_hours, offer_hours, screen_mode)
select id, 24, 4, 'none' from public.recipes where name = 'FO Muffin';
-- The scone's screen has gone since it was picked.
insert into public.fresh_items (recipe_id, shelf_life_hours, offer_hours, screen_ids)
select id, 24, 4, array[gen_random_uuid()] from public.recipes where name = 'FO Scone';
do $$ begin
  assert (select screen_mode = 'turns' from public.fresh_items i join public.recipes r on r.id = i.recipe_id where r.name = 'FO Scone'),
    'in turn by default';
end $$;

-- 1. Julio records them as the page does, without saying where: each offer goes where its item says.
select pg_temp.act_as('julio@test');
insert into public.fresh_batches (name, made_at, shelf_life_hours, discount_at, percent_off) values
  ('FO Cheesecake', now() - interval '1 hour', 72, now() + interval '47 hours', 30),
  ('FO Muffin', now() - interval '1 hour', 24, now() + interval '19 hours', 30),
  ('FO Scone', now() - interval '1 hour', 24, now() + interval '19 hours', 30);
reset role;
do $$
declare
  counter uuid := (select id from public.screens where name = 'FO counter TV');
  win uuid := (select id from public.screens where name = 'FO window TV');
  o public.offers;
begin
  select * into o from public.offers where title = 'FO Cheesecake';
  assert o.screen_ids = array[win] and o.screen_mode = 'only', format('the cheesecake''s on the window TV, on its own: %s', to_jsonb(o));
  select * into o from public.offers where title = 'FO Muffin';
  assert o.id is not null and o.screen_ids = '{}', format('the muffins'' offer is on Offers & specials, on no screen: %s', to_jsonb(o));
  select * into o from public.offers where title = 'FO Scone';
  assert counter = any (o.screen_ids) and win = any (o.screen_ids) and o.screen_mode = 'turns', 'its screen gone: every screen that''s on';
  assert (select screen_ids is null and screen_mode is null from public.fresh_batches where name = 'FO Cheesecake'), 'the batch follows its item';
end $$;

-- 2. A batch picks its own: every screen that's on, in turn.
select pg_temp.act_as('julio@test');
insert into public.fresh_batches (name, made_at, shelf_life_hours, discount_at, percent_off, screen_ids, screen_mode)
values ('FO Cheesecake', now() - interval '30 minutes', 72, now() + interval '47 hours', 25, '{}', 'turns');
reset role;
do $$
declare o public.offers := (select o from public.offers o join public.fresh_batches b on b.id = o.fresh_batch_id where b.percent_off = 25 and b.name = 'FO Cheesecake');
begin
  assert (select id from public.screens where name = 'FO counter TV') = any (o.screen_ids)
     and (select id from public.screens where name = 'FO window TV') = any (o.screen_ids) and o.screen_mode = 'turns', 'every screen that''s on, in turn';
end $$;

-- 3. Changing the batch's screens moves its offer there; changing anything else keeps where an admin put it.
-- (The team can't list the screens: the page gives them the item's choice. The id here is found first.)
reset role;
select set_config('test.fo_counter', (select id::text from public.screens where name = 'FO counter TV'), false);
select pg_temp.act_as('julio@test');
update public.fresh_batches set screen_ids = array[current_setting('test.fo_counter')::uuid], screen_mode = 'turns'
 where name = 'FO Muffin';
reset role;
do $$ begin
  assert (select screen_ids = array[(select id from public.screens where name = 'FO counter TV')] and screen_mode = 'turns'
            from public.offers where title = 'FO Muffin'), 'moved to the counter TV';
end $$;
select pg_temp.act_as('maria@test');
update public.offers set screen_ids = array[(select id from public.screens where name = 'FO window TV')] where title = 'FO Muffin';
select pg_temp.act_as('julio@test');
update public.fresh_batches set percent_off = 40 where name = 'FO Muffin';
reset role;
do $$ begin
  assert (select screen_ids = array[(select id from public.screens where name = 'FO window TV')] and price = '€1,50'
            from public.offers where title = 'FO Muffin'), 'the new discount, on the screen Maria picked';
end $$;

-- 4. Where a batch's offer goes is said in full: both, or neither (as its item); a way that's one of the three.
select pg_temp.act_as('julio@test');
select pg_temp.expect_error($q$insert into public.fresh_batches (name, shelf_life_hours, screen_ids) values ('FO Muffin', 24, '{}')$q$, 'fresh_batches_screens');
select pg_temp.expect_error($q$insert into public.fresh_batches (name, shelf_life_hours, screen_ids, screen_mode) values ('FO Muffin', 24, '{}', 'loud')$q$,
  'fresh_batches_screen_mode_check');
-- The team doesn't change an item's screens (admins set the items).
update public.fresh_items set screen_mode = 'turns';
reset role;
do $$ begin
  assert (select screen_mode = 'none' from public.fresh_items i join public.recipes r on r.id = i.recipe_id where r.name = 'FO Muffin'), 'still none';
end $$;

-- 5. Both of a batch's discounts (the `fresh_second_discount` migration) go where its item says.
select pg_temp.act_as('julio@test');
insert into public.fresh_batches (name, made_at, shelf_life_hours, discount_at, percent_off, discount2_at, percent_off2, notes)
values ('FO Cheesecake', now() - interval '10 minutes', 72, now() + interval '24 hours', 30, now() + interval '48 hours', 50, 'two discounts');
reset role;
do $$
declare
  win uuid := (select id from public.screens where name = 'FO window TV');
  b uuid := (select id from public.fresh_batches where notes = 'two discounts');
begin
  assert (select count(*) from public.offers where fresh_batch_id = b) = 2, 'an offer for each discount';
  assert (select bool_and(screen_ids = array[win] and screen_mode = 'only') from public.offers where fresh_batch_id = b), 'both on the window TV, on their own';
end $$;

-- Tidy up.
reset role;
delete from public.offers where title like 'FO %';
delete from public.fresh_batches where name like 'FO %';
delete from public.fresh_items where recipe_id in (select id from public.recipes where name like 'FO %');
delete from public.screens where name like 'FO %';
delete from public.recipes where name like 'FO %';
