-- The menu's prices back to Square (the `square_price_write_back` migration): while the menu comes from
-- Square, a price changed here (the item's, or a variant's) waits for the Worker to send it; a price
-- read from Square doesn't; a read from Square leaves an item whose change is waiting alone, and one
-- Square refused gets Square's price back. Admins see what waits and clear a refusal; employees don't.
-- People from the tests before it: maria (admin), julio (employee). All in one transaction, undone at the end.
begin;

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

-- 1. A menu kept here: nothing goes to Square, even for an item that came from it.
select pg_temp.act_as('maria@test');
update public.settings set menu_source = 'custom';
insert into public.recipes (name, category, sell_price, square_id) values ('Push latte', 'Coffee', 3, 'sqp-latte');
insert into public.recipes (name, category, sell_price) values ('Push own cake', 'Bakery', 2.5);
insert into public.recipe_variants (recipe_id, name, price_change) select id, 'Iced', 1 from public.recipes where square_id = 'sqp-latte';
update public.recipes set sell_price = 3.2 where square_id = 'sqp-latte';
do $$ begin
  assert not exists (select 1 from public.square_price_pushes), 'custom menu: nothing waits for Square';
end $$;

-- 2. The menu from Square: a price changed here waits to be sent; an item that isn't Square's doesn't.
update public.settings set menu_source = 'square';
update public.recipes set sell_price = 3.5 where square_id = 'sqp-latte';
update public.recipes set sell_price = 2.8 where name = 'Push own cake';
do $$ begin
  assert (select count(*) from public.square_price_pushes) = 1, 'one waits';
  assert (select price = 3.5 and error is null from public.square_price_pushes q join public.recipes r on r.id = q.recipe_id where r.square_id = 'sqp-latte'),
    'the latte, at its new price';
end $$;
-- The same price again changes nothing; a description isn't a price.
delete from public.square_price_pushes;
update public.recipes set sell_price = 3.5, description = 'Smooth' where square_id = 'sqp-latte';
do $$ begin assert not exists (select 1 from public.square_price_pushes), 'no price change: nothing to send'; end $$;

-- 3. A variant's price: changed, added or taken away, it's sent too; renaming one isn't a price.
update public.recipe_variants set name = 'Over ice' where name = 'Iced' and recipe_id = (select id from public.recipes where square_id = 'sqp-latte');
do $$ begin assert not exists (select 1 from public.square_price_pushes), 'renamed: nothing to send'; end $$;
update public.recipe_variants set price_change = 1.2 where name = 'Over ice' and recipe_id = (select id from public.recipes where square_id = 'sqp-latte');
do $$ begin assert (select count(*) from public.square_price_pushes) = 1, 'a variant’s price waits'; end $$;
delete from public.square_price_pushes;
delete from public.recipe_variants where name = 'Over ice' and recipe_id = (select id from public.recipes where square_id = 'sqp-latte');
do $$ begin assert (select count(*) from public.square_price_pushes) = 1, 'a variant taken away waits'; end $$;

-- 4. Employees don't see what waits, or clear it.
select pg_temp.act_as('julio@test');
do $$ begin assert not exists (select 1 from public.square_price_pushes), 'employees see none'; end $$;
select pg_temp.expect_error($q$insert into public.square_price_pushes (recipe_id) values (gen_random_uuid())$q$, 'permission denied');
select pg_temp.expect_error($q$update public.square_price_pushes set error = null$q$, 'permission denied');

-- 5. A read from Square (the Worker): it isn't sent back, and the item still waiting keeps its price.
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare r jsonb; begin
  r := public.sync_square_menu('{"items": [
      {"square_id": "sqp-latte", "name": "Push latte", "category": "Coffee", "sell_price": 3.2, "variants": [{"name": "Iced", "price_change": 1}]},
      {"square_id": "sqp-mocha", "name": "Push mocha", "category": "Coffee", "sell_price": 4, "variants": []}], "sections": ["Coffee"]}');
  assert (select sell_price = 3.5 from public.recipes where square_id = 'sqp-latte'), 'waiting: the price here stays until it’s sent';
  assert not exists (select 1 from public.recipe_variants v join public.recipes r on r.id = v.recipe_id where r.square_id = 'sqp-latte'),
    'and its variants';
  assert (select sell_price = 4 from public.recipes where square_id = 'sqp-mocha'), 'a new one comes in';
  assert (select count(*) from public.square_price_pushes) = 1, 'nothing read from Square is sent back';
  -- A second read in the same transaction isn't sent back either.
  r := public.sync_square_menu('{"items": [{"square_id": "sqp-latte", "name": "Push latte", "category": "Coffee", "sell_price": 3.2, "variants": []},
      {"square_id": "sqp-mocha", "name": "Push mocha", "category": "Coffee", "sell_price": 4.2, "variants": []}], "sections": ["Coffee"]}');
  assert (select sell_price = 4.2 from public.recipes where square_id = 'sqp-mocha'), 'Square’s new price';
  assert (select count(*) from public.square_price_pushes) = 1, 'still not sent back';
end $$;

-- 6. Square refused it: the reason stays for the Menu page, and Square's price comes back with the next read.
update public.square_price_pushes set error = 'Square: not allowed', failed_at = now();
do $$ declare r jsonb; begin
  r := public.sync_square_menu('{"items": [{"square_id": "sqp-latte", "name": "Push latte", "category": "Coffee", "sell_price": 3.2,
      "variants": [{"name": "Iced", "price_change": 1}]}], "sections": ["Coffee"]}');
  assert (select sell_price = 3.2 from public.recipes where square_id = 'sqp-latte'), 'Square’s price back';
  assert exists (select 1 from public.recipe_variants v join public.recipes r on r.id = v.recipe_id where r.square_id = 'sqp-latte' and v.name = 'Iced'),
    'with its variants';
  assert (select error = 'Square: not allowed' from public.square_price_pushes), 'the refusal is kept to show';
end $$;
-- A new change here waits again, the refusal gone.
select pg_temp.act_as('maria@test');
update public.recipes set sell_price = 3.4 where square_id = 'sqp-latte';
do $$ begin
  assert (select price = 3.4 and error is null and tries = 0 from public.square_price_pushes), 'waiting again';
end $$;
-- An admin clears one they've read; the queue isn't theirs to add to or change.
select pg_temp.expect_error($q$update public.square_price_pushes set error = 'x'$q$, 'permission denied');
delete from public.square_price_pushes;
reset role;
do $$ begin assert not exists (select 1 from public.square_price_pushes), 'cleared'; end $$;

-- 7. The refresh rates the business chooses: an object of minutes, kept by admins.
select pg_temp.act_as('maria@test');
update public.settings set refresh_minutes = '{"takings": 5, "menu": 15}';
select pg_temp.expect_error($q$update public.settings set refresh_minutes = '[5]'$q$, 'check constraint');
select pg_temp.act_as('julio@test');
update public.settings set refresh_minutes = '{}';
reset role;
do $$ begin
  assert (select refresh_minutes = '{"takings": 5, "menu": 15}'::jsonb from public.settings where business_id = 1), 'an employee doesn’t change them';
end $$;

rollback;
