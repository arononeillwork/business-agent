-- A screen's turn (the screen_rotation migration): upright to start with, a quarter at a time, sent
-- with its feed; anything but a quarter turn is refused. maria (admin) comes from the tests before it.

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
do $$ declare s public.screens; begin
  insert into public.screens (name) values ('Turned TV') returning * into s;
  assert s.rotation = 0, 'upright to start with';
  update public.screens set rotation = 90 where id = s.id returning * into s;
  assert s.rotation = 90, 'kept';
end $$;
select pg_temp.expect_error($$update public.screens set rotation = 45 where name = 'Turned TV'$$, 'rotation');
select pg_temp.expect_error($$update public.screens set rotation = 360 where name = 'Turned TV'$$, 'rotation');

-- The screen's feed (no sign-in) carries it.
reset role;
do $$ declare v_feed jsonb; begin
  v_feed := public.display_feed((select token from public.screens where name = 'Turned TV'));
  assert (v_feed->'screen'->>'rotation')::int = 90, format('sent with the feed: %s', v_feed->'screen');
end $$;

select pg_temp.act_as('maria@test');
delete from public.screens where name = 'Turned TV';
reset role;
