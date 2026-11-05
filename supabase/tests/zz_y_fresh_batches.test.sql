-- Freshly made: the team records what it made, when, how long it keeps and when its discount starts.
-- A batch with a discount puts itself on Offers & specials from then until its shelf life ends, its
-- menu price crossed out, on the screens that are on; a change moves its offer; sold out or thrown
-- away, an offer that's on ends and one still to come goes. Finance partners read; nobody else outside
-- the team does; only admins and whoever recorded a batch delete it. Offers stay admins' to change.
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
  ('fb-gestoria@test', '{"full_name": "Lola", "role": "partner", "partner_company": "Gestoría Sur", "partner_access": ["finances"]}', now()),
  ('fb-payroll@test', '{"full_name": "Pepe", "role": "partner", "partner_company": "Nóminas Sur", "partner_access": ["payroll"]}', now());

-- The menu item and a screen (as an admin).
select pg_temp.act_as('maria@test');
insert into public.recipes (name, category, sell_price) values ('FB Banana bread', 'Bakery', 3.50);
insert into public.screens (name) values ('FB counter TV');

-- 1. Julio records a banana bread made an hour ago, keeping a day, 30% off for its last 6 hours: the
--    menu name links it to the menu item; it has to be gone a day after it was made; its offer is
--    there from the discount until then, the menu price crossed out, on the counter TV.
select pg_temp.act_as('julio@test');
do $$
declare b public.fresh_batches;
begin
  insert into public.fresh_batches (name, quantity, made_at, shelf_life_hours, discount_at, percent_off, notes)
  values ('  fb banana BREAD ', 12, now() - interval '1 hour', 24, now() + interval '17 hours', 30, '  ')
  returning * into b;
  assert b.name = 'fb banana BREAD' and b.notes is null, format('tidied: %s', to_jsonb(b));
  assert b.recipe_id is not null, 'a name on the menu is that item';
  assert b.good_until = b.made_at + interval '24 hours', 'gone a day after it was made';
  assert b.made_by = auth.uid() and b.cleared is null and b.cleared_at is null, 'recorded by Julio, still on the counter';
  -- Julio can't see offers (they're admins'), but it's there.
  assert (select count(*) from public.offers) = 0, 'the team sees no offers';
end $$;
reset role;
do $$
declare b public.fresh_batches := (select b from public.fresh_batches b where name = 'fb banana BREAD');
        o public.offers := (select o from public.offers o where fresh_batch_id = b.id);
begin
  assert b.recipe_id = (select id from public.recipes where name = 'FB Banana bread'), 'the menu item of that name';
  assert o.id is not null, 'its offer is on Offers & specials';
  assert o.title = 'fb banana BREAD' and o.price = '€2.45' and o.was_price = '€3.50', format('30%% off the menu price: %s', to_jsonb(o));
  assert o.starts_at = b.discount_at and o.ends_at = b.good_until and o.active, 'from the discount until it has to be gone';
  assert (select id from public.screens where name = 'FB counter TV') = any (o.screen_ids), 'on the screens that are on';
  assert o.business_id = b.business_id, 'the business''s own';
end $$;

-- 2. What stops a batch: no name, a discount outside its shelf life, a set price without one, made
--    too far ahead, too long a shelf life.
select pg_temp.act_as('julio@test');
select pg_temp.expect_error($q$insert into public.fresh_batches (name, shelf_life_hours) values ('  ', 8)$q$, 'Say what was made');
select pg_temp.expect_error($q$insert into public.fresh_batches (name, shelf_life_hours, discount_at) values ('FB scones', 8, now() - interval '1 hour')$q$,
  'Start the discount after it’s made');
select pg_temp.expect_error($q$insert into public.fresh_batches (name, shelf_life_hours, discount_at) values ('FB scones', 8, now() + interval '9 hours')$q$,
  'Start the discount after it’s made');
select pg_temp.expect_error($q$insert into public.fresh_batches (name, shelf_life_hours, discount_at, discount) values ('FB scones', 8, now() + interval '1 hour', 'price')$q$,
  'Say the offer price');
select pg_temp.expect_error($q$insert into public.fresh_batches (name, shelf_life_hours, made_at) values ('FB scones', 8, now() + interval '13 hours')$q$,
  'more than 12 hours from now');
select pg_temp.expect_error($q$insert into public.fresh_batches (name, shelf_life_hours) values ('FB scones', 721)$q$, 'check constraint');

-- 3. A change moves the offer: a set price, and an earlier start. Something else changing (the notes)
--    leaves an admin's own changes to it alone.
update public.fresh_batches set discount = 'price', price = ' 2 for €5 ', discount_at = now() - interval '10 minutes' where name = 'fb banana BREAD';
reset role;
do $$ declare o public.offers := (select o from public.offers o join public.fresh_batches b on b.id = o.fresh_batch_id where b.name = 'fb banana BREAD'); begin
  assert o.price = '2 for €5' and o.was_price = '€3.50', format('the set price: %s', to_jsonb(o));
  assert o.starts_at < now(), 'on now';
  assert (select count(*) from public.offers where fresh_batch_id = o.fresh_batch_id) = 1, 'still the one offer';
end $$;
select pg_temp.act_as('maria@test');
update public.offers set seconds = 30 where fresh_batch_id = (select id from public.fresh_batches where name = 'fb banana BREAD');
select pg_temp.act_as('julio@test');
update public.fresh_batches set notes = 'Top shelf' where name = 'fb banana BREAD';
reset role;
do $$ begin
  assert (select seconds from public.offers where fresh_batch_id = (select id from public.fresh_batches where name = 'fb banana BREAD')) = 30, 'an admin''s change stays';
end $$;

-- 4. Sold out: its offer, on now, ends now, and when it was cleared is kept.
select pg_temp.act_as('julio@test');
update public.fresh_batches set cleared = 'sold' where name = 'fb banana BREAD';
reset role;
do $$
declare b public.fresh_batches := (select b from public.fresh_batches b where name = 'fb banana BREAD');
        o public.offers := (select o from public.offers o where fresh_batch_id = b.id);
begin
  assert b.cleared = 'sold' and b.cleared_at is not null, 'sold out, and when';
  assert o.ends_at <= now(), 'its offer has ended';
end $$;

-- 5. A batch without a discount has no offer; one whose discount is still to come loses its offer when
--    thrown away, or when the discount is taken off. Not on the menu: no price to cross out.
select pg_temp.act_as('julio@test');
insert into public.fresh_batches (name, shelf_life_hours) values ('FB sandwiches', 8);
insert into public.fresh_batches (name, shelf_life_hours, discount_at, percent_off) values ('FB brownies', 48, now() + interval '30 hours', 50);
insert into public.fresh_batches (name, shelf_life_hours, discount_at) values ('FB flapjacks', 48, now() + interval '30 hours');
reset role;
do $$ begin
  assert not exists (select 1 from public.offers o join public.fresh_batches b on b.id = o.fresh_batch_id where b.name = 'FB sandwiches'), 'no discount, no offer';
  assert (select o.price is not distinct from '-50%' and o.was_price is null from public.offers o join public.fresh_batches b on b.id = o.fresh_batch_id where b.name = 'FB brownies'),
    'not on the menu: just the % off';
end $$;
select pg_temp.act_as('julio@test');
update public.fresh_batches set cleared = 'binned' where name = 'FB brownies';
update public.fresh_batches set discount_at = null where name = 'FB flapjacks';
reset role;
do $$ begin
  assert not exists (select 1 from public.offers o join public.fresh_batches b on b.id = o.fresh_batch_id where b.name in ('FB brownies', 'FB flapjacks')),
    'an offer still to come goes';
  assert (select cleared_at is not null from public.fresh_batches where name = 'FB brownies'), 'thrown away, and when';
end $$;

-- 6. Who sees and changes them: a finance partner reads, a payroll one doesn't; neither adds any. Only
--    admins and whoever recorded one delete it; deleting one takes its offer still to come with it.
select pg_temp.act_as('fb-gestoria@test');
do $$ begin assert (select count(*) from public.fresh_batches where name like 'FB%' or name like 'fb%') = 4, 'a finance partner reads them'; end $$;
select pg_temp.expect_error($q$insert into public.fresh_batches (name, shelf_life_hours) values ('FB pies', 8)$q$, 'row-level security');
select pg_temp.act_as('fb-payroll@test');
do $$ begin assert (select count(*) from public.fresh_batches) = 0, 'a payroll partner sees none'; end $$;
select pg_temp.act_as('maria@test');
insert into public.fresh_batches (name, shelf_life_hours, discount_at) values ('FB cookies', 24, now() + interval '2 hours');
select pg_temp.act_as('julio@test');
delete from public.fresh_batches where name = 'FB cookies';
do $$ begin assert (select count(*) from public.fresh_batches where name = 'FB cookies') = 1, 'Julio doesn''t delete Maria''s'; end $$;
delete from public.fresh_batches where name = 'FB sandwiches';
do $$ begin assert (select count(*) from public.fresh_batches where name = 'FB sandwiches') = 0, 'Julio deletes his own'; end $$;
select pg_temp.act_as('maria@test');
delete from public.fresh_batches where name = 'FB cookies';
reset role;
do $$ begin
  assert not exists (select 1 from public.offers where title = 'FB cookies'), 'its offer still to come went with it';
  assert exists (select 1 from public.offers o where o.title = 'fb banana BREAD' and o.fresh_batch_id is not null), 'the ended one stays linked';
end $$;

-- Tidy up.
reset role;
delete from public.offers where title like 'FB%' or title like 'fb%';
delete from public.fresh_batches where name like 'FB%' or name like 'fb%';
delete from public.screens where name = 'FB counter TV';
delete from public.recipes where name = 'FB Banana bread';
delete from auth.users where email in ('fb-gestoria@test', 'fb-payroll@test');
