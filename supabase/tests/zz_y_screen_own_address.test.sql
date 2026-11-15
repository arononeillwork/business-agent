-- A screen's own address (the screen_own_address migration): an https page on the business's own
-- website, kept with the screen and sent with its feed; none to start with; plain http or not an
-- address is refused. maria (admin) comes from the tests before it.

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
  insert into public.screens (name) values ('Own address TV') returning * into s;
  assert s.own_url is null, 'none to start with';
  update public.screens set own_url = 'https://www.example-cafe.es/display-menu' where id = s.id returning * into s;
  assert s.own_url = 'https://www.example-cafe.es/display-menu', 'kept';
end $$;
select pg_temp.expect_error($$update public.screens set own_url = 'http://www.example-cafe.es/display-menu' where name = 'Own address TV'$$, 'own_url');
select pg_temp.expect_error($$update public.screens set own_url = 'example-cafe' where name = 'Own address TV'$$, 'own_url');

-- The screen's feed (no sign-in) carries it, and still not the secret link.
reset role;
do $$ declare v_feed jsonb; begin
  v_feed := public.display_feed((select token from public.screens where name = 'Own address TV'));
  assert v_feed->'screen'->>'own_url' = 'https://www.example-cafe.es/display-menu', format('sent with the feed: %s', v_feed->'screen');
  assert not (v_feed->'screen' ? 'token'), 'the feed keeps the secret link to itself';
end $$;

select pg_temp.act_as('maria@test');
update public.screens set own_url = null where name = 'Own address TV';
do $$ begin
  assert (select own_url from public.screens where name = 'Own address TV') is null, 'taken off';
end $$;
delete from public.screens where name = 'Own address TV';
reset role;
