-- Wholesale prices over time: each new cost per unit is kept (by the database, with who set it),
-- read by whoever reads the items, written by nobody else.
-- Reuses the people and items of the stock tests: maria (admin), julio (employee), the two partners.

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

-- 1. A price is kept when an item is added and each time it changes ----------------------------
select pg_temp.act_as('maria@test');
do $$
declare v_oat uuid := (select id from public.stock_items where name = 'Oat milk'); v_beans uuid; v_moves int;
begin
  -- Oat milk came in at 1,45 and went up to 1,49 (the stock tests).
  assert (select array_agg(cost_per_unit order by changed_at, id) from public.stock_item_prices where item_id = v_oat) = '{1.45,1.49}', 'both prices kept';
  assert (select bool_and(changed_by = auth.uid()) from public.stock_item_prices where item_id = v_oat), 'with who set them';

  insert into public.stock_items (name, unit, cost_per_unit) values ('Wholesale beans', 'kg', 21.40) returning id into v_beans;
  update public.stock_items set name = 'Wholesale beans 1 kg', notes = 'New roast' where id = v_beans;   -- no new price
  update public.stock_items set cost_per_unit = 21.40 where id = v_beans;                                -- the same price
  update public.stock_items set cost_per_unit = 22.80 where id = v_beans;                                -- up
  assert (select array_agg(cost_per_unit order by changed_at, id) from public.stock_item_prices where item_id = v_beans) = '{21.40,22.80}',
    'only a different price is kept';

  -- A delivery changes how many are in, not the price.
  v_moves := (select count(*) from public.stock_item_prices);
  insert into public.stock_movements (item_id, reason, change) values (v_beans, 'delivery', 5);
  update public.stock_items set cost_per_unit = null where id = v_beans;   -- no price is no price to keep
  assert (select count(*) from public.stock_item_prices) = v_moves, 'deliveries and a cleared price keep nothing';

  insert into public.stock_items (name, unit) values ('Unpriced napkins', 'pack');
  assert not exists (select 1 from public.stock_item_prices p join public.stock_items i on i.id = p.item_id where i.name = 'Unpriced napkins'),
    'an item without a cost has no prices';
end $$;

-- 2. Nobody writes them by hand, admins included ------------------------------------------------
select pg_temp.expect_error($q$insert into public.stock_item_prices (item_id, cost_per_unit)
  select id, 1 from public.stock_items where name = 'Oat milk'$q$, 'permission denied');
select pg_temp.expect_error($q$update public.stock_item_prices set cost_per_unit = 0$q$, 'permission denied');
select pg_temp.expect_error($q$delete from public.stock_item_prices$q$, 'permission denied');
select pg_temp.expect_error($q$select public.stock_price_kept()$q$, 'permission denied');

-- 3. Who reads them: the team and a gestoría with finances access; no other partner -----------
select pg_temp.act_as('julio@test');
do $$ begin
  assert (select count(*) from public.stock_item_prices p join public.stock_items i on i.id = p.item_id where i.name = 'Oat milk') = 2, 'the team reads';
end $$;
select pg_temp.expect_error($q$insert into public.stock_item_prices (item_id, cost_per_unit)
  select id, 1 from public.stock_items where name = 'Oat milk'$q$, 'permission denied');
select pg_temp.act_as('stock-gestoria@test');
do $$ begin
  assert (select count(*) from public.stock_item_prices) > 0, 'the gestoría reads';
end $$;
select pg_temp.act_as('stock-rota@test');
do $$ begin
  assert (select count(*) from public.stock_item_prices) = 0, 'other partners see none';
end $$;

-- 4. An item deleted takes its prices with it ---------------------------------------------------
select pg_temp.act_as('maria@test');
do $$
declare v_beans uuid := (select id from public.stock_items where name = 'Wholesale beans 1 kg');
begin
  delete from public.stock_items where id = v_beans;
  assert not exists (select 1 from public.stock_item_prices where item_id = v_beans), 'prices gone with the item';
  delete from public.stock_items where name = 'Unpriced napkins';
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
