-- Short links, picture slideshows and the live offers' pictures (the screen_links migration): each
-- screen gets a link name from its name, free in its business (bar-tv, then bar-tv-2), kept when
-- it's renamed and made again when emptied; a typed one is tidied and checked; a slide of kind
-- 'offers' needs no address; and a screen with one gets the other offers' pictures that haven't
-- ended (not those already on it, switched off, ended or without a picture). maria (admin) comes
-- from the tests before it.

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

-- 1. Link names: made from the name, free in the business; kept, typed or made again.
select pg_temp.act_as('maria@test');
do $$ declare a public.screens; b public.screens; c public.screens; d public.screens; begin
  insert into public.screens (name) values ('Bär TV') returning * into a;
  insert into public.screens (name) values ('Bär  TV!') returning * into b;
  insert into public.screens (name, kind, slug) values ('Window', 'slideshow', '  Pictures ') returning * into c;
  insert into public.screens (name) values ('2x1 Promo') returning * into d;
  assert a.slug = 'bar-tv' and a.kind = 'screen', format('from its name, a screen to start with: %s', a.slug);
  assert b.slug = 'bar-tv-2', format('the next free one: %s', b.slug);
  assert c.slug = 'pictures' and c.kind = 'slideshow', format('typed, tidied: %s', c.slug);
  assert d.slug = 'screen-2x1-promo', format('starting with a letter: %s', d.slug);
  update public.screens set name = 'Bar Counter' where id = a.id returning * into a;
  assert a.slug = 'bar-tv', 'renamed, it keeps its link';
  update public.screens set slug = '' where id = b.id returning * into b;
  assert b.slug = 'bar-tv-2', format('emptied, made from the name again (its own name is free to it): %s', b.slug);
  update public.screens set slug = 'bar-counter' where id = a.id returning * into a;
  assert a.slug = 'bar-counter', 'a new one typed';
end $$;
select pg_temp.expect_error($q$update public.screens set slug = 'pictures' where name = 'Bar Counter'$q$, 'already has the link name');
select pg_temp.expect_error($q$update public.screens set slug = 'Bad name' where name = 'Bar Counter'$q$, 'link name is up to 40');
select pg_temp.expect_error($q$update public.screens set slug = '9-tv' where name = 'Bar Counter'$q$, 'link name is up to 40');
select pg_temp.expect_error($q$update public.screens set slug = 'tv-' where name = 'Bar Counter'$q$, 'link name is up to 40');
select pg_temp.expect_error($q$insert into public.screens (name, kind) values ('X', 'poster')$q$, 'check constraint');

-- 2. The live offers' pictures: a slide with no address of its own.
update public.screens set slides = '[{"id": "o", "kind": "offers", "seconds": 12, "active": true},
                                     {"id": "p", "kind": "image", "url": "https://x.es/latte.jpg", "active": true}]'
 where name = 'Window';
select pg_temp.expect_error($q$update public.screens set slides = '[{"id": "o", "kind": "offers", "seconds": 1}]' where name = 'Window'$q$, 'between 3 seconds');
select pg_temp.expect_error($q$update public.screens set slides = '[{"id": "x", "kind": "poster"}]' where name = 'Window'$q$, 'isn’t one the screen can show');

do $$ declare w uuid := (select id from public.screens where name = 'Window'); begin
  insert into public.offers (title, starts_at, ends_at, image_url, screen_ids) values
    ('SL on it', now() - interval '1 hour', now() + interval '1 hour', 'https://x.es/on.jpg', array[w]),
    ('SL picture', now() - interval '1 hour', now() + interval '1 hour', 'https://x.es/p.jpg', '{}'),
    ('SL tomorrow', now() + interval '1 day', now() + interval '25 hours', 'https://x.es/t.jpg', '{}'),
    ('SL next week', now() + interval '7 days', now() + interval '8 days', 'https://x.es/w.jpg', '{}'),
    ('SL no picture', now() - interval '1 hour', now() + interval '1 hour', null, '{}');
  insert into public.offers (title, starts_at, ends_at, image_url, active) values ('SL off', now() - interval '1 hour', now() + interval '1 hour', 'https://x.es/o.jpg', false);
  insert into public.offers (title, starts_at, ends_at, image_url) values ('SL ended', now() - interval '3 hours', now() + interval '1 hour', 'https://x.es/e.jpg');
  update public.offers set ends_at = now() - interval '1 hour' where title = 'SL ended';
end $$;

-- 3. The screen's link, through the Worker.
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare f jsonb; v text[]; begin
  f := public.display_feed((select token from public.screens where name = 'Window'));
  assert f->'screen'->>'slug' = 'pictures' and f->'screen'->>'kind' = 'slideshow', 'with its link name and kind';
  select array_agg(x->>'title' order by x->>'starts_at') into v from jsonb_array_elements(f->'offer_pictures') x where x->>'title' like 'SL %';
  assert v = array['SL picture', 'SL tomorrow'], format('the other offers with a picture that haven''t ended and start within two days: %s', v);
  assert (select x->>'image_url' from jsonb_array_elements(f->'offer_pictures') x where x->>'title' = 'SL picture') = 'https://x.es/p.jpg', 'with its picture';
  assert (select count(*) from jsonb_array_elements(f->'offers') x where x->>'title' = 'SL on it') = 1, 'the one on the screen as before, not twice';
  -- Without the slide (or with it switched off): none.
  assert jsonb_array_length(public.display_feed((select token from public.screens where name = 'Bar Counter'))->'offer_pictures') = 0, 'none without the slide';
  update public.screens set slides = '[{"id": "o", "kind": "offers", "active": false}]' where name = 'Window';
  assert jsonb_array_length(public.display_feed((select token from public.screens where name = 'Window'))->'offer_pictures') = 0, 'none with it switched off';
end $$;

-- Tidy up: later tests count screens and offers.
delete from public.offers where title like 'SL %';
delete from public.screens where name in ('Bar Counter', 'Bär  TV!', 'Window', '2x1 Promo');
