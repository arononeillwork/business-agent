-- Vegan and vegetarian on stock items: what an item contains has to fit its diet, admins set it,
-- and the team reads it with the menu's allergens. People from the tests before it: maria (admin),
-- julio (employee).

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

select pg_temp.act_as('maria@test');
do $$
declare v_beans uuid; v_milk uuid; v_r uuid;
begin
  insert into public.stock_items (name, unit, allergens) values ('Diet beans', 'kg', '{}') returning id into v_beans;
  insert into public.stock_items (name, unit, allergens) values ('Diet milk', 'l', '{milk}') returning id into v_milk;
  assert (select diet is null from public.stock_items where id = v_beans), 'not said yet: null';
  update public.stock_items set diet = 'vegan' where id = v_beans;
  update public.stock_items set diet = 'vegetarian' where id = v_milk;
  insert into public.recipes (name, sell_price) values ('Diet latte', 3) returning id into v_r;
  insert into public.recipe_lines (recipe_id, item_id, quantity, unit) values (v_r, v_beans, 18, 'g'), (v_r, v_milk, 200, 'ml');
  assert jsonb_path_exists(public.menu_allergens(), '$.items[*] ? (@.name == "Diet milk" && @.diet == "vegetarian")'), 'the menu’s items with their diet';
  insert into public.stock_items (name, unit, diet) values ('Diet ham', 'kg', 'neither');
  insert into public.stock_items (name, unit, diet) values ('Diet unknown', 'kg', 'vegan'); -- allergens not said: nothing to clash with
end $$;
select pg_temp.expect_error($q$update public.stock_items set diet = 'vegan' where name = 'Diet milk'$q$, 'stock_items_diet_fits');
select pg_temp.expect_error($q$update public.stock_items set allergens = '{eggs}' where name = 'Diet beans'$q$, 'stock_items_diet_fits');
select pg_temp.expect_error($q$insert into public.stock_items (name, unit, allergens, diet) values ('Diet prawns', 'kg', '{crustaceans}', 'vegetarian')$q$, 'stock_items_diet_fits');
select pg_temp.expect_error($q$update public.stock_items set diet = 'pescatarian' where name = 'Diet ham'$q$, 'check constraint');
select pg_temp.act_as('julio@test');
do $$ declare n int; begin
  assert jsonb_path_exists(public.menu_allergens(), '$.items[*] ? (@.name == "Diet beans" && @.diet == "vegan")'), 'the team reads each item’s diet';
  update public.stock_items set diet = 'neither'; get diagnostics n = row_count;
  assert n = 0, 'and changes none';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
