-- Menu, menu designs and screens: the team reads the menu (no costs), admins change it; images and
-- designs are admins'; AI images come only from the Worker and the design shows each once it's
-- ready; a screen's slides are checked; its link loads only through display_feed(), which notes the
-- screen as seen without filling the audit log.
-- Named after zz_tax so its gestoría exists. People from the tests before it: maria (admin),
-- julio (employee), tax-partner (zz_tax, finances access).

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

-- 1. Menu items: what customers read, tidied; the team sees the menu without costs.
select pg_temp.act_as('maria@test');
do $$ declare v_id uuid; begin
  insert into public.recipes (name, category, sell_price, target_margin, description, allergens, dietary, featured)
    values ('Menu flat white', 'Coffee', 3.2, 72, '  Double ristretto, silky milk  ', array['milk', 'milk'], array['vegetarian'], true) returning id into v_id;
  insert into public.recipe_variants (recipe_id, name, price_change) values (v_id, 'Oat milk', 0.4);
  insert into public.recipes (name, category, sell_price, on_menu) values ('Menu espresso', 'Coffee', 1.6, true), ('Menu old cake', 'Bakery', 2, false);
  assert (select description = 'Double ristretto, silky milk' and allergens = array['milk'] from public.recipes where id = v_id), 'tidied, each allergen once';
  perform public.reorder_menu(array[(select id from public.recipes where name = 'Menu espresso'), v_id]);
  assert (select menu_sort from public.recipes where name = 'Menu espresso') = 1 and (select menu_sort from public.recipes where id = v_id) = 2, 'reordered';
end $$;
select pg_temp.expect_error($q$insert into public.recipes (name, allergens) values ('X', array['chocolate'])$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.recipes (name, dietary) values ('X', array['keto'])$q$, 'check constraint');

select pg_temp.act_as('julio@test');
do $$ declare v jsonb; n int; begin
  select e into v from jsonb_array_elements(public.menu_items()) e where e->>'name' = 'Menu flat white';
  assert v is not null, 'employees read the menu';
  assert (v->>'sell_price')::numeric = 3.2 and v->'allergens' = '["milk"]'::jsonb and (v->'variants'->0->>'name') = 'Oat milk', 'with price, allergens and variants';
  assert not (v ? 'target_margin') and not (v ? 'wastage_pct') and not (v ? 'notes'), 'and nothing about costs';
  assert exists (select 1 from jsonb_array_elements(public.menu_items()) e where e->>'name' = 'Menu old cake' and (e->>'on_menu')::boolean = false), 'off-menu items are listed, marked off';
  update public.recipes set sell_price = 0; get diagnostics n = row_count;
  assert n = 0, 'but change nothing';
  assert (select count(*) from public.menu_designs) = 0 and (select count(*) from public.screens) = 0, 'and see no designs or screens';
end $$;
reset role;
select set_config('test.flat_white', (select id::text from public.recipes where name = 'Menu flat white'), false);
set role authenticated;
select public.reorder_menu(array[current_setting('test.flat_white')::uuid]);
reset role;
do $$ begin
  assert (select menu_sort from public.recipes where name = 'Menu flat white') = 2, 'an employee’s reorder changes nothing';
end $$;

select pg_temp.act_as('tax-partner@test');
do $$ begin
  assert jsonb_array_length(public.menu_items()) >= 3, 'the gestoría reads the menu too';
end $$;

-- 2. Designs and their images.
select pg_temp.act_as('maria@test');
do $$ declare d1 uuid; d2 uuid; i1 uuid; begin
  insert into public.menu_designs (name, format, size, title, categories) values (' Counter menu ', 'physical', 'a4_portrait', '  ', array['Coffee', ' Coffee ', '']) returning id into d1;
  assert (select name = 'Counter menu' and title is null and categories = array['Coffee'] from public.menu_designs where id = d1), 'tidied';
  insert into public.menu_designs (name, format, size) values ('TV menu', 'digital', 'screen_landscape') returning id into d2;
  insert into public.menu_images (design_id, url, source) values (d1, 'https://drive.example/menu.jpg', 'upload') returning id into i1;
  update public.menu_designs set image_id = i1 where id = d1;
  assert (select image_id from public.menu_designs where id = d1) = i1, 'an uploaded image is used';
end $$;
select pg_temp.expect_error($q$insert into public.menu_designs (name, format, size) values ('X', 'digital', 'a4_portrait')$q$, 'menu_designs_size_fits');
select pg_temp.expect_error($q$update public.menu_designs set image_id = (select id from public.menu_images limit 1) where name = 'TV menu'$q$, 'isn’t one of this design’s');
select pg_temp.expect_error($q$insert into public.menu_images (design_id, source, model, status, prompt) select id, 'ai', 'ideogram', 'queued', 'x' from public.menu_designs limit 1$q$, 'row-level security');
select pg_temp.expect_error($q$insert into public.menu_images (design_id, url, source) select id, 'http://x.es/a.jpg', 'link' from public.menu_designs limit 1$q$, 'check constraint');
do $$ declare n int; begin
  update public.menu_images set url = 'https://elsewhere.example/x.jpg'; get diagnostics n = row_count;
  assert n = 0, 'nobody changes an image';
exception when insufficient_privilege then null;
end $$;

-- The Worker (service role) makes an AI image: once ready, the design shows it, and an item's photo goes on the item.
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare d1 uuid := (select id from public.menu_designs where name = 'Counter menu'); ai uuid; ph uuid; v_item uuid := (select id from public.recipes where name = 'Menu espresso');
begin
  insert into public.menu_images (design_id, source, model, prompt, status, request_id, status_url)
    values (d1, 'ai', 'recraft', 'Terracotta', 'queued', 'req-1', 'https://api.higgsfield.ai/requests/req-1/status') returning id into ai;
  update public.menu_images set status = 'working' where id = ai;
  assert (select image_id from public.menu_designs where id = d1) <> ai, 'not before it’s ready';
  update public.menu_images set status = 'ready', url = 'https://drive.example/ai.jpg', stored = true where id = ai;
  assert (select image_id from public.menu_designs where id = d1) = ai, 'the design shows it once ready';
  assert (select finished_at is not null from public.menu_images where id = ai), 'finished time noted';

  insert into public.menu_images (item_id, source, model, prompt, status) values (v_item, 'ai', 'qwen', 'Espresso', 'queued') returning id into ph;
  update public.menu_images set status = 'ready', url = 'https://drive.example/espresso.jpg' where id = ph;
  assert (select photo_url from public.recipes where id = v_item) = 'https://drive.example/espresso.jpg', 'the item gets its photo';
end $$;
-- Two asked for one after the other, each step at its own time (as it happens): each takes over when
-- it's done, since switching one in isn't someone changing the design; one picked by hand meanwhile stays.
insert into public.menu_images (design_id, source, model, prompt, status) select id, 'ai', 'ideogram', 'First', 'queued' from public.menu_designs where name = 'Counter menu';
insert into public.menu_images (design_id, source, model, prompt, status) select id, 'ai', 'ideogram', 'Second', 'queued' from public.menu_designs where name = 'Counter menu';
update public.menu_images set status = 'ready', url = 'https://drive.example/first.jpg' where prompt = 'First';
update public.menu_images set status = 'ready', url = 'https://drive.example/second.jpg' where prompt = 'Second';
do $$ begin
  assert (select i.prompt from public.menu_designs d join public.menu_images i on i.id = d.image_id where d.name = 'Counter menu') = 'Second', 'the later one shows';
end $$;
insert into public.menu_images (design_id, source, model, prompt, status) select id, 'ai', 'ideogram', 'Third', 'queued' from public.menu_designs where name = 'Counter menu';
update public.menu_designs set image_id = (select id from public.menu_images where prompt = 'First') where name = 'Counter menu';
update public.menu_images set status = 'ready', url = 'https://drive.example/third.jpg' where prompt = 'Third';
do $$ begin
  assert (select i.prompt from public.menu_designs d join public.menu_images i on i.id = d.image_id where d.name = 'Counter menu') = 'First', 'picked by hand, it stays';
end $$;
do $$ begin
  insert into public.menu_images (design_id, source, model, status) select id, 'ai', 'qwen', 'ready' from public.menu_designs limit 1;
  raise exception 'a ready image needs its address';
exception when check_violation then null;
end $$;

-- 3. Screens.
select pg_temp.act_as('maria@test');
do $$ declare s uuid; v_token text; v_design uuid := (select id from public.menu_designs where name = 'TV menu'); begin
  insert into public.screens (name, slides) values (' Counter TV ', jsonb_build_array(
    jsonb_build_object('id', 'a', 'kind', 'image', 'url', 'https://cdn.example/latte.jpg', 'seconds', 8, 'active', true),
    jsonb_build_object('id', 'b', 'kind', 'menu', 'design_id', v_design, 'seconds', null, 'active', true),
    jsonb_build_object('id', 'c', 'kind', 'youtube', 'url', 'https://youtu.be/dQw4w9WgXcQ', 'active', true))) returning id, token into s, v_token;
  assert (select name from public.screens where id = s) = 'Counter TV', 'tidied';
  assert v_token ~ '^[0-9a-f]{32}$', 'a secret link';
  assert public.new_screen_link(s) <> v_token, 'a new link replaces it';
end $$;
select pg_temp.expect_error($q$insert into public.screens (name, slides) values ('X', '[{"kind": "image", "url": "http://x.es/a.jpg"}]')$q$, 'https://');
select pg_temp.expect_error($q$insert into public.screens (name, slides) values ('X', '[{"kind": "hologram", "url": "https://x.es/a"}]')$q$, 'isn’t one the screen can show');
select pg_temp.expect_error($q$insert into public.screens (name, slides) values ('X', '[{"kind": "image", "url": "https://x.es/a.jpg", "seconds": 1}]')$q$, '3 seconds');
select pg_temp.expect_error(format($q$insert into public.screens (name, slides) values ('X', '[{"kind": "menu", "design_id": "%s"}]')$q$,
  (select id from public.menu_designs where name = 'Counter menu')), 'digital menus');
select pg_temp.expect_error($q$insert into public.screens (name, seconds) values ('X', 2)$q$, 'check constraint');
select pg_temp.expect_error($q$delete from public.menu_designs where name = 'TV menu'$q$, 'Take it off that screen first');
select pg_temp.expect_error($q$select public.display_feed('x')$q$, 'permission denied');

select pg_temp.act_as('julio@test');
select pg_temp.expect_error($q$insert into public.screens (name) values ('Sneaky')$q$, 'row-level security');

-- The screen's link, through the Worker.
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare v_token text := (select token from public.screens where name = 'Counter TV'); f jsonb; n_audit int; v_design uuid := (select id from public.menu_designs where name = 'TV menu');
begin
  select count(*) into n_audit from public.audit_log where table_name = 'screens';
  f := public.display_feed(v_token);
  assert f->'screen'->>'name' = 'Counter TV' and not (f->'screen' ? 'token'), 'its settings, not its link';
  assert jsonb_array_length(f->'screen'->'slides') = 3, 'its slides';
  assert f->'menus' ? v_design::text, 'the digital menu on it';
  assert exists (select 1 from jsonb_array_elements(f->'menus'->(v_design::text)->'items') e where e->>'name' = 'Menu flat white'), 'with the menu’s items';
  assert not (f->'menus'->(v_design::text)->'items'->0 ? 'target_margin'), 'and no costs';
  assert (select last_seen_at is not null from public.screen_status where screen_id = (select id from public.screens where token = v_token)), 'seen';
  perform public.display_feed(v_token);
  assert (select count(*) from public.audit_log where table_name = 'screens') = n_audit, 'being seen isn’t a change to the screen';
  assert public.display_feed('0123456789abcdef0123456789abcdef') is null, 'an unknown link loads nothing';
  update public.screens set active = false where token = v_token;
  assert public.display_feed(v_token)->'menus' = '{}'::jsonb, 'a switched-off screen shows no menus';
end $$;

-- The Higgsfield connection is one more provider.
do $$ begin
  assert exists (select 1 from public.integrations where provider = 'higgsfield' and status = 'disconnected'), 'Higgsfield starts disconnected';
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
