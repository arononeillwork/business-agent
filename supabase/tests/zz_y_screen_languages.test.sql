-- Screens in English and Spanish (the screen_languages migration): a slide's Spanish version is
-- checked like its English one, a slide needs at least one of the two, which versions show is
-- true or false, a digital menu shown in Spanish can't be deleted while it's on a screen, and the
-- screen's link carries the menus of both versions. People and the 'TV menu' design come from the
-- tests before it (maria, admin; zz_tax_menu_and_screens).

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
do $$ declare v_design uuid; begin
  insert into public.menu_designs (name, format, size) values ('Menú TV', 'digital', 'screen_portrait') returning id into v_design;
  insert into public.screens (name, slides) values ('Bilingual TV', jsonb_build_array(
    jsonb_build_object('id', 'p', 'kind', 'image', 'url', 'https://cdn.example/offer-en.jpg', 'url_es', 'https://cdn.example/offer-es.jpg',
                       'show_en', true, 'show_es', true, 'active', true),
    jsonb_build_object('id', 's', 'kind', 'image', 'url_es', 'https://cdn.example/solo-es.jpg', 'active', true),
    jsonb_build_object('id', 'm', 'kind', 'menu', 'design_id', (select id from public.menu_designs where name = 'TV menu'), 'design_id_es', v_design, 'active', true)));
  assert (select jsonb_array_length(slides) from public.screens where name = 'Bilingual TV') = 3, 'English and Spanish versions, or Spanish only';
end $$;
select pg_temp.expect_error($q$insert into public.screens (name, slides) values ('X', '[{"kind": "image", "url": "https://x.es/a.jpg", "url_es": "http://x.es/b.jpg"}]')$q$, 'https://');
select pg_temp.expect_error($q$insert into public.screens (name, slides) values ('X', '[{"kind": "image"}]')$q$, 'https://');
select pg_temp.expect_error($q$insert into public.screens (name, slides) values ('X', '[{"kind": "image", "url": "https://x.es/a.jpg", "show_es": "yes"}]')$q$, 'true or false');
select pg_temp.expect_error(format($q$insert into public.screens (name, slides) values ('X', '[{"kind": "menu", "design_id_es": "%s"}]')$q$,
  (select id from public.menu_designs where name = 'Counter menu')), 'digital menus');
select pg_temp.expect_error($q$insert into public.screens (name, slides) values ('X', '[{"kind": "menu"}]')$q$, 'digital menus');
select pg_temp.expect_error($q$delete from public.menu_designs where name = 'Menú TV'$q$, 'Take it off that screen first');

-- The screen's link, through the Worker: the menus of both versions.
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare f jsonb := public.display_feed((select token from public.screens where name = 'Bilingual TV')); begin
  assert f->'menus' ? (select id::text from public.menu_designs where name = 'TV menu'), 'the English menu';
  assert f->'menus' ? (select id::text from public.menu_designs where name = 'Menú TV'), 'and the Spanish one';
  assert f->'screen'->'slides'->0->>'url_es' = 'https://cdn.example/offer-es.jpg', 'each slide with its Spanish version';
end $$;

-- Tidy up: later tests count screens and designs.
delete from public.screens where name = 'Bilingual TV';
delete from public.menu_designs where name = 'Menú TV';
