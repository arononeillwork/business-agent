-- Waste log: an entry is changed or taken off by whoever logged it or an admin; the stock follows
-- through corrections, and the history keeps the undone entry. And what suppliers supply.
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

-- 1. Items to waste ------------------------------------------------------------------------
select pg_temp.act_as('maria@test');
insert into public.stock_items (name, unit, cost_per_unit, on_hand) values ('Waste test croissants', 'unit', 0.85, 20), ('Waste test muffins', 'unit', 1, 10);

-- 2. Julio logs waste, then changes it: the old one is undone, the new one keeps its day ------
select pg_temp.act_as('julio@test');
do $$
declare v_c uuid := (select id from public.stock_items where name = 'Waste test croissants');
        v_m uuid := (select id from public.stock_items where name = 'Waste test muffins');
        v_w uuid; v_new uuid;
begin
  insert into public.stock_movements (item_id, reason, change, waste_reason, by) values (v_c, 'waste', -4, 'expired', auth.uid()) returning id into v_w;
  assert (select on_hand = 16 from public.stock_items where id = v_c), 'waste comes off';
  -- Logged yesterday, say.
  reset role;
  update public.stock_movements set at = now() - interval '1 day' where id = v_w;
  perform pg_temp.act_as('julio@test');

  v_new := public.edit_waste(v_w, v_m, 3, 'quality', ' Burnt ');
  assert (select undone_at is not null and undone_by = auth.uid() from public.stock_movements where id = v_w), 'old entry undone';
  assert (select on_hand = 20 from public.stock_items where id = v_c), 'croissants back';
  assert (select on_hand = 7 from public.stock_items where id = v_m), 'muffins off instead';
  assert (select reason = 'waste' and change = -3 and waste_reason = 'quality' and note = 'Burnt' and by = auth.uid()
            and at::date = (now() - interval '1 day')::date from public.stock_movements where id = v_new), 'new entry on the same day';
  assert (select count(*) = 1 from public.stock_movements where item_id = v_c and reason = 'correction' and change = 4), 'a correction put it back';

  -- Taken off: undone, stock back; not twice.
  perform public.undo_waste(v_new);
  assert (select on_hand = 10 from public.stock_items where id = v_m), 'muffins back';
  perform set_config('test.waste', v_new::text, false);
end $$;
select pg_temp.expect_error($q$select public.undo_waste(current_setting('test.waste')::uuid)$q$, 'already off the waste log');
select pg_temp.expect_error($q$select public.edit_waste(current_setting('test.waste')::uuid, (select id from public.stock_items where name = 'Waste test muffins'), 0, 'other')$q$, 'Enter how many');
-- Only waste, and nothing moves straight from the table.
select pg_temp.expect_error($q$select public.undo_waste((select id from public.stock_movements where reason = 'correction' limit 1))$q$, 'isn’t on the waste log');
do $$ begin
  update public.stock_movements set change = -1 where reason = 'waste';
  assert not found, 'movements are not edited directly';
end $$;

-- 3. Someone else's entry: an admin can, another employee can't --------------------------------
select pg_temp.act_as('maria@test');
do $$
declare v_m uuid := (select id from public.stock_items where name = 'Waste test muffins'); v_w uuid;
begin
  insert into public.stock_movements (item_id, reason, change, waste_reason, by) values (v_m, 'waste', -2, 'spilled', auth.uid()) returning id into v_w;
  perform set_config('test.maria_waste', v_w::text, false);
end $$;
select pg_temp.act_as('julio@test');
select pg_temp.expect_error($q$select public.undo_waste(current_setting('test.maria_waste')::uuid)$q$, 'Only an admin or whoever logged it');
select pg_temp.act_as('maria@test');
do $$
declare v_julio uuid;
begin
  -- Maria takes off one of Julio's.
  perform pg_temp.act_as('julio@test');
  insert into public.stock_movements (item_id, reason, change, waste_reason, by)
    values ((select id from public.stock_items where name = 'Waste test muffins'), 'waste', -1, 'other', auth.uid()) returning id into v_julio;
  perform pg_temp.act_as('maria@test');
  perform public.undo_waste(v_julio);
  assert (select undone_by = auth.uid() from public.stock_movements where id = v_julio), 'admin undid it';
end $$;

-- 4. What suppliers supply: only the five groups ---------------------------------------------
select pg_temp.act_as('maria@test');
do $$ begin
  insert into public.suppliers (name, supplies) values ('Fruit test', '{fruit_veg,groceries}');
  assert (select supplies = '{fruit_veg,groceries}' from public.suppliers where name = 'Fruit test'), 'supplies kept';
  insert into public.suppliers (name) values ('Plain test');
  assert (select supplies = '{}' from public.suppliers where name = 'Plain test'), 'others start empty';
end $$;
select pg_temp.expect_error($q$insert into public.suppliers (name, supplies) values ('Odd', '{furniture}')$q$, 'check constraint');
reset role;
