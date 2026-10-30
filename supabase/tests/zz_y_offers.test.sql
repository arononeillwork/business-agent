-- Offers & specials: admins add an offer for a set time on their screens (tidied, only their own
-- screens, each once), with its story's post; the team sees none. A screen's link gets the offers
-- on it that haven't ended and start within two days, nothing switched off, ended or elsewhere.
-- People from the tests before it: maria (admin), julio (employee).

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

-- 1. An admin puts an offer on a screen for the afternoon.
select pg_temp.act_as('maria@test');
do $$ declare s uuid; v public.offers; begin
  insert into public.screens (name) values ('Window TV') returning id into s;
  insert into public.offers (title, details, price, was_price, starts_at, ends_at, screen_ids, screen_mode)
    values ('  Happy hour  ', '  ', ' 2 for 1 ', '', now() - interval '1 hour', now() + interval '2 hours', array[s, s, gen_random_uuid()], 'only')
    returning * into v;
  assert v.title = 'Happy hour' and v.details is null and v.price = '2 for 1' and v.was_price is null, 'tidied';
  assert v.screen_ids = array[s], format('its own screens, each once: %s', v.screen_ids);
  assert v.seconds = 15 and v.active and v.post_id is null, 'with the usual settings';
  assert exists (select 1 from public.audit_log where table_name = 'offers'), 'in the audit log';
end $$;
select pg_temp.expect_error($q$insert into public.offers (title, starts_at, ends_at) values ('Backwards', now(), now() - interval '1 hour')$q$, 'offers_times');
select pg_temp.expect_error($q$insert into public.offers (title, starts_at, ends_at) values ('Forever', now(), now() + interval '100 days')$q$, 'offers_times');
select pg_temp.expect_error($q$insert into public.offers (title, starts_at, ends_at) values ('  ', now(), now() + interval '1 hour')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.offers (title, starts_at, ends_at, image_url) values ('X', now(), now() + interval '1 hour', 'http://x.es/a.jpg')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.offers (title, starts_at, ends_at, seconds) values ('X', now(), now() + interval '1 hour', 2)$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.offers (title, starts_at, ends_at, post_id) values ('X', now(), now() + interval '1 hour', gen_random_uuid())$q$, 'isn’t on your Social planner');

-- 2. Its story: the post is remembered, and forgotten when the post is deleted.
do $$ declare p uuid; begin
  insert into public.social_posts (kind, caption, targets, status) values ('story', 'Happy hour', '{instagram}', 'draft') returning id into p;
  update public.offers set post_id = p where title = 'Happy hour';
  assert (select post_id from public.offers where title = 'Happy hour') = p, 'its post';
  delete from public.social_posts where id = p;
  assert (select post_id from public.offers where title = 'Happy hour') is null, 'a deleted post is no longer its post';
end $$;

-- More offers on the window TV: tomorrow's, next week's, yesterday's, one switched off; one on another screen.
do $$ declare s uuid := (select id from public.screens where name = 'Window TV'); o uuid; begin
  insert into public.screens (name) values ('Back TV') returning id into o;
  insert into public.offers (title, starts_at, ends_at, screen_ids) values
    ('Tomorrow', now() + interval '1 day', now() + interval '1 day 2 hours', array[s]),
    ('Next week', now() + interval '7 days', now() + interval '8 days', array[s]),
    ('Yesterday', now() - interval '1 day', now() - interval '20 hours', array[s]),
    ('Elsewhere', now() - interval '1 hour', now() + interval '1 hour', array[o]);
  insert into public.offers (title, starts_at, ends_at, screen_ids, active) values ('Off', now() - interval '1 hour', now() + interval '1 hour', array[s], false);
end $$;

-- 3. The team sees no offers and can't add one.
select pg_temp.act_as('julio@test');
do $$ begin
  assert (select count(*) from public.offers) = 0, 'employees see no offers';
end $$;
select pg_temp.expect_error($q$insert into public.offers (title, starts_at, ends_at) values ('Sneaky', now(), now() + interval '1 hour')$q$, 'row-level security');

-- 4. The window TV's link, through the Worker.
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare v_token text := (select token from public.screens where name = 'Window TV'); f jsonb; begin
  f := public.display_feed(v_token);
  assert jsonb_array_length(f->'offers') = 2, format('the offers on now and coming up soon: %s', f->'offers');
  assert f->'offers'->0->>'title' = 'Happy hour' and f->'offers'->0->>'screen_mode' = 'only' and f->'offers'->0->>'price' = '2 for 1'
    and (f->'offers'->0->>'seconds')::int = 15 and (f->'offers'->0->>'ends_at')::timestamptz > now(), 'with what the screen shows and when';
  assert f->'offers'->1->>'title' = 'Tomorrow', 'in the order they start';
  assert not (f->'offers'->0 ? 'post_id') and not (f->'offers'->0 ? 'screen_ids'), 'and nothing else';
  update public.screens set active = false where token = v_token;
  assert public.display_feed(v_token)->'offers' = '[]'::jsonb, 'a switched-off screen shows no offers';
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
