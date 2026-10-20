-- Stock: suppliers, items and the movements that keep "how many are in" right. Admins manage;
-- the team reads and records deliveries, counts and waste; a gestoría with finances access reads.
-- Reuses the people of the tests before it: maria (by now an admin), julio (employee).

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

-- 1. The business's old supplier list came across --------------------------------------------
reset role;
do $$ begin
  assert (select count(*) from public.suppliers) = (select count(*) from public.business b, jsonb_array_elements(b.suppliers) s
                                                     where nullif(btrim(s->>'name'), '') is not null), 'old suppliers copied';
end $$;

-- 2. An admin adds a supplier and items; what's typed is tidied ------------------------------
select pg_temp.act_as('maria@test');
do $$
declare v_sup uuid; v_milk uuid;
begin
  insert into public.suppliers (name, kind, contact_name, email, phone, whatsapp, website, order_url, order_days, cutoff, lead_days, minimum_order)
    values ('  Lácteos Costa ', ' Dairy ', ' Paco ', ' Pedidos@LacteosCosta.ES ', '+34  611  222 333', true, 'https://lacteoscosta.es',
            'https://lacteoscosta.es/pedidos', '{fri, mon, wed}', '12:00', 1, 60)
    returning id into v_sup;
  assert (select name = 'Lácteos Costa' and kind = 'Dairy' and email = 'pedidos@lacteoscosta.es' and phone = '+34 611 222 333'
          and order_days = '{mon,wed,fri}' and updated_by = auth.uid() from public.suppliers where id = v_sup), 'supplier tidied';

  insert into public.stock_items (name, category, supplier_id, unit, pack_size, order_multiple, cost_per_unit, on_hand, par_level, reorder_at, location)
    values (' Oat milk ', 'Milk & dairy', v_sup, 'l', '6 × 1 l', 6, 1.45, 8, 24, 10, 'Storeroom')
    returning id into v_milk;
  assert (select name = 'Oat milk' and on_hand = 8 from public.stock_items where id = v_milk), 'item added with its first count';

  -- Editing an item never changes how many are in: that goes through a movement.
  update public.stock_items set on_hand = 999, cost_per_unit = 1.49 where id = v_milk;
  assert (select on_hand = 8 and cost_per_unit = 1.49 from public.stock_items where id = v_milk), 'on hand kept, price changed';
end $$;
select pg_temp.expect_error($q$insert into public.suppliers (name, phone) values ('Bad phone', '611 222 333')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.suppliers (name, order_days) values ('Bad day', '{someday}')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.suppliers (name, website) values ('Bad site', 'lacteos.es')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.stock_items (name, unit) values ('Odd unit', 'barrel')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.stock_items (name, par_level, reorder_at) values ('Upside down', 5, 10)$q$, 'stock_items_levels');
select pg_temp.expect_error($q$insert into public.stock_items (name, vat_rate) values ('Too much IVA', 30)$q$, 'check constraint');

-- 3. The team records movements; the figure follows -------------------------------------------
reset role;
select set_config('test.maria', (select id::text from auth.users where email = 'maria@test'), false);
select pg_temp.act_as('julio@test');
do $$
declare v_milk uuid := (select id from public.stock_items where name = 'Oat milk'); n int;
begin
  assert (select count(*) from public.suppliers where name = 'Lácteos Costa') = 1, 'the team reads suppliers';
  insert into public.stock_movements (item_id, reason, change, note) values (v_milk, 'delivery', 12, '  ');
  assert (select on_hand = 20 from public.stock_items where id = v_milk), 'a delivery adds';
  insert into public.stock_movements (item_id, reason, change) values (v_milk, 'waste', -2);
  assert (select on_hand = 18 from public.stock_items where id = v_milk), 'waste takes away';
  insert into public.stock_movements (item_id, reason, counted, change) values (v_milk, 'count', 15, 0);
  assert (select on_hand = 15 from public.stock_items where id = v_milk), 'a count sets the figure';
  assert (select change = -3 and on_hand_after = 15 and by = auth.uid() and note is null
          from public.stock_movements where item_id = v_milk and reason = 'count'), 'the count records the difference and who';

  -- But the team can't change items or suppliers (prices included), or rewrite history.
  update public.stock_items set cost_per_unit = 0.01 where id = v_milk; get diagnostics n = row_count;
  assert n = 0, 'employees change no prices';
  update public.suppliers set minimum_order = 0; get diagnostics n = row_count;
  assert n = 0, 'employees change no suppliers';
  update public.stock_movements set change = 100; get diagnostics n = row_count;
  assert n = 0, 'movements are never edited';
  delete from public.stock_movements; get diagnostics n = row_count;
  assert n = 0, 'or deleted';
end $$;
select pg_temp.expect_error($q$insert into public.stock_items (name) values ('Sneaky')$q$, 'row-level security');
select pg_temp.expect_error($q$insert into public.stock_movements (item_id, reason, change)
  select id, 'delivery', -5 from public.stock_items where name = 'Oat milk'$q$, 'A delivery adds stock');
select pg_temp.expect_error($q$insert into public.stock_movements (item_id, reason, change)
  select id, 'sold', 5 from public.stock_items where name = 'Oat milk'$q$, 'take stock away');
select pg_temp.expect_error($q$insert into public.stock_movements (item_id, reason, change)
  select id, 'used', 0 from public.stock_items where name = 'Oat milk'$q$, 'Enter how many');
select pg_temp.expect_error($q$insert into public.stock_movements (item_id, reason, change)
  select id, 'count', 0 from public.stock_items where name = 'Oat milk'$q$, 'Enter how many you counted');
do $$
declare v uuid;
begin
  assert (select on_hand = 15 from public.stock_items where name = 'Oat milk'), 'refused movements change nothing';
  -- Nobody records a movement in someone else's name: it's always the person signed in.
  insert into public.stock_movements (item_id, reason, change, by)
    select id, 'delivery', 1, current_setting('test.maria')::uuid from public.stock_items where name = 'Oat milk' returning id into v;
  assert (select by = auth.uid() from public.stock_movements where id = v), 'recorded as who did it';
  assert (select on_hand = 16 from public.stock_items where name = 'Oat milk'), 'and counted';
end $$;

-- 4. Partners: finances access reads, anything else sees nothing --------------------------------
reset role;
insert into auth.users (email, raw_user_meta_data, invited_at) values
  ('stock-gestoria@test', '{"full_name": "Lola", "role": "partner", "partner_company": "Gestoría Sur", "partner_access": ["finances"]}', now()),
  ('stock-rota@test', '{"full_name": "Rafa", "role": "partner", "partner_company": "Turnos SL", "partner_access": ["rota"]}', now());
select pg_temp.act_as('stock-gestoria@test');
do $$ begin
  assert (select count(*) from public.stock_items) = 1 and (select count(*) from public.stock_movements) = 4, 'the gestoría reads stock';
end $$;
select pg_temp.expect_error($q$insert into public.stock_movements (item_id, reason, change)
  select id, 'delivery', 1 from public.stock_items where name = 'Oat milk'$q$, 'row-level security');
select pg_temp.act_as('stock-rota@test');
do $$ begin
  assert (select count(*) from public.stock_items) = 0 and (select count(*) from public.suppliers) = 0, 'other partners see no stock';
end $$;

-- 5. Admins remove a supplier: its items stay, with no supplier ---------------------------------
select pg_temp.act_as('maria@test');
delete from public.suppliers where name = 'Lácteos Costa';
do $$ begin
  assert (select supplier_id is null from public.stock_items where name = 'Oat milk'), 'item kept without its supplier';
  assert exists (select 1 from public.audit_log where table_name = 'stock_items' and action = 'update'), 'item changes audited';
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
