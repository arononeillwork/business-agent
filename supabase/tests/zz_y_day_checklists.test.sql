-- Daily checklists: Easy Beans starts with the owners' own, for the start and the end of the day, in
-- English and Spanish (their first version, then their changes: the `checklist_changes` migration); the
-- team reads them and ticks things off for today, whoever ticked something (or an admin) unticks it,
-- admins change the lists, and partners and the café tablet see none.
-- People from the tests before it: maria (admin), julio (employee); dc-tablet is new here.

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
insert into auth.users (email, raw_user_meta_data, invited_at) values ('dc-tablet@test', '{"full_name":"Tablet"}', now());
update public.profiles set role = 'kiosk' where email = 'dc-tablet@test';

-- 1. Easy Beans' own: the start of the day from the shutters, the end of it to the alarm, with steps,
--    in both languages; the start of the day as the owners changed it (shared/checklists.test.ts checks
--    the app's copy is the same).
select pg_temp.act_as('julio@test');
do $$ begin
  assert (select array_agg(text_en order by sort) from public.checklist_items where list = 'opening' and parent_id is null) = array[
    'Open the 2 shutters', 'Turn off the alarm', 'Clock in on the app', 'Take out and lay out the tables outside', 'Turn on:',
    'Set up the awnings outside (front and back)', 'Turn on the lights for:', 'Check the stock of bakery items, and bake more if needed',
    'Stock the fridges with pastries', 'Stock the fridges with milk and drinks', 'Put music on', 'Stock check and update the system',
    'Put the chalkboard sign out', 'Check and clean the display fridges', 'Fill up the dog bowl and put it outside, on the corner',
    'Cockroach sweep: kill and remove', 'Brush the front of the shop, in front of the shutter', 'Clean and wipe each table'], 'the start of the day, in order';
  assert not exists (select 1 from public.checklist_items s join public.checklist_items p on p.id = s.parent_id
                      where p.text_en = 'Take out and lay out the tables outside'), 'the tables without steps';
  assert (select array_agg(s.text_en order by s.sort) from public.checklist_items s join public.checklist_items p on p.id = s.parent_id
           where p.list = 'opening' and p.text_en = 'Turn on the lights for:') = array['The front 2 fridges', 'The back 2 fridges',
           'The outside lights (logo light), from the fuse board (box of electrics)', 'The sign in front of the coffee machine'], 'no light under the counter';
  assert (select text_es from public.checklist_items where text_en = 'Stock the fridges with milk and drinks') = 'Reponer los refrigeradores con leche y bebidas', 'milk and drinks';
  assert (select count(*) from public.checklist_items s join public.checklist_items p on p.id = s.parent_id
           where p.text_en = 'Stock the fridges with milk and drinks') = 1, 'still with its step';
  assert (select count(*) from public.checklist_items where list = 'closing' and parent_id is null) = 10, 'ten to close';
  assert (select text_en = 'Open the 2 shutters' and text_es = 'Abrir las 2 persianas' from public.checklist_items
           where list = 'opening' and parent_id is null order by sort limit 1), 'first, the shutters';
  assert (select text_es from public.checklist_items where list = 'closing' and parent_id is null order by sort desc limit 1) = 'Activar la alarma', 'last, the alarm';
  assert (select array_agg(s.text_en order by s.sort) from public.checklist_items s join public.checklist_items p on p.id = s.parent_id
           where p.list = 'opening' and p.text_en = 'Turn on:') = array['Coffee machine', 'Lights under the counter', 'Till system'], 'with its steps, no ice machine';
  assert not exists (select 1 from public.checklist_items where text_en is null or text_es is null), 'both languages';
end $$;

-- 2. An employee changes none of it.
select pg_temp.expect_error($q$insert into public.checklist_items (list, text_en) values ('opening', 'Nap')$q$, 'row-level security');
do $$ begin
  update public.checklist_items set text_en = 'Renamed';
  delete from public.checklist_items;
  assert (select count(*) from public.checklist_items where text_en = 'Renamed') = 0, 'unchanged';
  assert (select count(*) from public.checklist_items) = 52, 'nothing deleted';
end $$;

-- 3. He ticks things off for today, as himself: a thing without steps, or a step; not an item with
--    steps (its steps are), not something that isn't on it, and not a day long gone.
do $$
declare v_shutters uuid := (select id from public.checklist_items where text_en = 'Open the 2 shutters');
begin
  insert into public.checklist_ticks (item_id, day, done_by) values (v_shutters, current_date, (select id from public.profiles where email = 'maria@test'));
  assert (select done_by = auth.uid() from public.checklist_ticks where item_id = v_shutters), 'ticked as himself';
  insert into public.checklist_ticks (item_id, day) select id, current_date from public.checklist_items where text_en = 'Coffee machine' and list = 'opening';
  assert (select count(*) from public.checklist_ticks) = 2, 'two ticked';
end $$;
select pg_temp.expect_error($q$insert into public.checklist_ticks (item_id, day) select id, current_date from public.checklist_items where text_en = 'Turn on:'$q$, 'Tick off its steps');
select pg_temp.expect_error($q$insert into public.checklist_ticks (item_id, day) values (gen_random_uuid(), current_date)$q$, 'isn''t on the checklist');
select pg_temp.expect_error($q$insert into public.checklist_ticks (item_id, day) select id, current_date - 7 from public.checklist_items where text_en = 'Put music on'$q$, 'Only today''s');
select pg_temp.expect_error($q$insert into public.checklist_ticks (item_id, day) select id, current_date from public.checklist_items where text_en = 'Open the 2 shutters'$q$, 'checklist_ticks_pkey');

-- 4. Whoever ticked it unticks it; someone else's stays (an admin unticks anyone's).
select pg_temp.act_as('maria@test');
insert into public.checklist_ticks (item_id, day) select id, current_date from public.checklist_items where text_en = 'Put music on';
select pg_temp.act_as('julio@test');
do $$ begin
  delete from public.checklist_ticks where item_id = (select id from public.checklist_items where text_en = 'Put music on');
  assert exists (select 1 from public.checklist_ticks t join public.checklist_items i on i.id = t.item_id where i.text_en = 'Put music on'), 'not his to untick';
  delete from public.checklist_ticks where item_id = (select id from public.checklist_items where text_en = 'Open the 2 shutters');
  assert not exists (select 1 from public.checklist_ticks t join public.checklist_items i on i.id = t.item_id where i.text_en = 'Open the 2 shutters'), 'his own he unticks';
end $$;
select pg_temp.act_as('maria@test');
do $$ begin
  delete from public.checklist_ticks where item_id = (select id from public.checklist_items where text_en = 'Coffee machine' and list = 'opening');
  assert (select count(*) from public.checklist_ticks) = 1, 'an admin unticks anyone''s';
end $$;

-- 5. An admin adds an item (tidied, in one language or both) and a step under it; a step goes under an
--    item of the same list, and isn't one with steps of its own.
do $$
declare v_item public.checklist_items; v_step public.checklist_items;
begin
  insert into public.checklist_items (list, text_en, text_es, sort) values ('closing', '  Empty the bins  ', ' ', 20) returning * into v_item;
  assert v_item.text_en = 'Empty the bins' and v_item.text_es is null and v_item.updated_by = auth.uid(), 'tidied and stamped';
  insert into public.checklist_items (list, parent_id, text_es) values ('closing', v_item.id, 'El de vidrio también') returning * into v_step;
  assert v_step.text_en is null, 'Spanish only';
  update public.checklist_items set text_es = 'Vaciar las papeleras' where id = v_item.id;
end $$;
select pg_temp.expect_error($q$insert into public.checklist_items (list, text_en, text_es) values ('closing', ' ', '')$q$, 'in English or Spanish');
select pg_temp.expect_error($q$insert into public.checklist_items (list, text_en) values ('lunch', 'Eat')$q$, 'checklist_items_list_check');
select pg_temp.expect_error($q$insert into public.checklist_items (list, parent_id, text_en) select 'opening', id, 'Glass too' from public.checklist_items where text_en = 'Empty the bins'$q$, 'same checklist');
select pg_temp.expect_error($q$insert into public.checklist_items (list, parent_id, text_en) select 'closing', id, 'Deeper' from public.checklist_items where text_es = 'El de vidrio también'$q$, 'same checklist');
select pg_temp.expect_error($q$update public.checklist_items set parent_id = (select id from public.checklist_items where text_en = 'Pull down both shutters') where text_en = 'Empty the bins'$q$, 'can''t be a step itself');
select pg_temp.expect_error($q$update public.checklist_items set list = 'opening' where text_en = 'Empty the bins'$q$, 'stays on its checklist');
select pg_temp.expect_error($q$insert into public.checklist_items (list, text_en) values ('closing', repeat('x', 301))$q$, 'checklist_items_text_en_check');

-- 6. Taking an item off takes its steps and their ticks with it.
do $$ begin
  insert into public.checklist_ticks (item_id, day) select id, current_date from public.checklist_items where text_es = 'El de vidrio también';
  delete from public.checklist_items where text_en = 'Empty the bins';
  assert not exists (select 1 from public.checklist_items where text_es = 'El de vidrio también'), 'its step went with it';
  assert (select count(*) from public.checklist_ticks) = 1, 'and its tick';
end $$;

-- 7. The café tablet sees none of it, and ticks nothing.
select pg_temp.act_as('dc-tablet@test');
do $$ begin
  assert (select count(*) from public.checklist_items) + (select count(*) from public.checklist_ticks) = 0, 'no checklists';
end $$;
reset role;
select set_config('dc.shutters', (select id::text from public.checklist_items where text_en = 'Open the 2 shutters'), false);
select pg_temp.act_as('dc-tablet@test');
-- It can't see the shutters to tick them.
select pg_temp.expect_error($q$insert into public.checklist_ticks (item_id, day) values (current_setting('dc.shutters')::uuid, current_date)$q$, 'isn''t on the checklist');

reset role; select set_config('request.jwt.claim.sub', '', false);
delete from public.checklist_ticks;
delete from auth.users where email = 'dc-tablet@test';
