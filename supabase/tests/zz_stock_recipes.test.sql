-- Recipes and the waste log: a recipe saves with its variants and lines in one go; admins only,
-- the gestoría reads; waste says why. Runs after zz_stock.test.sql (its Oat milk item and people).

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

-- 1. An admin saves a flat white with an oat milk variant ----------------------------------------
select pg_temp.act_as('maria@test');
do $$
declare v_oat uuid := (select id from public.stock_items where name = 'Oat milk'); v_beans uuid; v_whole uuid; v_r uuid; v_var uuid := gen_random_uuid();
begin
  insert into public.stock_items (name, unit, cost_per_unit) values ('Espresso beans', 'kg', 18.5) returning id into v_beans;
  insert into public.stock_items (name, unit, cost_per_unit) values ('Whole milk', 'l', 0.95) returning id into v_whole;
  v_r := public.save_recipe(jsonb_build_object('name', ' Flat white ', 'category', 'Coffee', 'sell_price', 3.2, 'wastage_pct', 5,
    'variants', jsonb_build_array(jsonb_build_object('id', v_var, 'name', 'Oat milk', 'price_change', 0.4)),
    'lines', jsonb_build_array(
      jsonb_build_object('item_id', v_beans, 'quantity', 18, 'unit', 'g'),
      jsonb_build_object('item_id', v_whole, 'quantity', 180, 'unit', 'ml'),
      jsonb_build_object('item_id', v_oat, 'quantity', 180, 'unit', 'ml', 'variant_id', v_var, 'replaces_item_id', v_whole))));
  assert (select name = 'Flat white' and target_margin = 70 and vat_rate = 10 and updated_by = auth.uid() from public.recipes where id = v_r), 'saved, tidied, defaults';
  assert (select count(*) from public.recipe_lines where recipe_id = v_r) = 3, 'three lines';
  assert (select replaces_item_id = v_whole from public.recipe_lines where recipe_id = v_r and variant_id = v_var), 'the variant swaps the milk';

  -- Saving again replaces the lines and variants.
  perform public.save_recipe(jsonb_build_object('id', v_r, 'name', 'Flat white', 'sell_price', 3.4,
    'lines', jsonb_build_array(jsonb_build_object('item_id', v_beans, 'quantity', 20, 'unit', 'g'))));
  assert (select sell_price = 3.4 from public.recipes where id = v_r), 'price changed';
  assert (select count(*) from public.recipe_lines where recipe_id = v_r) = 1 and (select count(*) from public.recipe_variants where recipe_id = v_r) = 0, 'replaced';
end $$;
select pg_temp.expect_error($q$select public.save_recipe('{"name": "Bad", "lines": [{"item_id": "00000000-0000-0000-0000-000000000000", "quantity": 0, "unit": "g"}]}')$q$, 'check constraint');
select pg_temp.expect_error($q$select public.save_recipe('{"name": "Too much", "target_margin": 120}')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.recipes (name, square_item) values ('Twin', 'Flat white'), ('Twin 2', 'Flat white')$q$, 'duplicate key');
-- A failed save leaves nothing half done.
do $$ begin
  assert not exists (select 1 from public.recipes where name in ('Bad', 'Too much')), 'nothing saved from a failed save';
end $$;

-- 2. Staff can't see recipes; the gestoría reads them -------------------------------------------
select pg_temp.act_as('julio@test');
do $$ begin
  assert (select count(*) from public.recipes) = 0 and (select count(*) from public.recipe_lines) = 0, 'staff see no recipes';
end $$;
select pg_temp.expect_error($q$select public.save_recipe('{"name": "Sneaky"}')$q$, 'row-level security');
select pg_temp.act_as('stock-gestoria@test');
do $$ begin
  assert (select count(*) from public.recipes where name = 'Flat white') = 1, 'the gestoría reads recipes';
end $$;

-- 3. Waste says why; nothing else does ---------------------------------------------------------
select pg_temp.act_as('julio@test');
do $$
declare v_oat uuid := (select id from public.stock_items where name = 'Oat milk'); v_before numeric := (select on_hand from public.stock_items where name = 'Oat milk');
begin
  insert into public.stock_movements (item_id, reason, change, waste_reason) values (v_oat, 'waste', -1, 'spilled');
  insert into public.stock_movements (item_id, reason, change) values (v_oat, 'waste', -1);
  insert into public.stock_movements (item_id, reason, change, waste_reason) values (v_oat, 'delivery', 6, 'expired');
  assert (select array_agg(waste_reason order by at, id) from (select * from public.stock_movements where item_id = v_oat order by at desc limit 3) m)
         @> array['spilled', 'other']::text[], 'waste says why (other when not given)';
  assert (select waste_reason is null from public.stock_movements where item_id = v_oat and reason = 'delivery' order by at desc limit 1), 'a delivery has no waste reason';
  assert (select on_hand = v_before + 4 from public.stock_items where id = v_oat), 'and the figure follows';
end $$;
select pg_temp.expect_error($q$insert into public.stock_movements (item_id, reason, change, waste_reason)
  select id, 'waste', -1, 'dropped it' from public.stock_items where name = 'Oat milk'$q$, 'check constraint');

reset role;
select set_config('request.jwt.claim.sub', '', false);
