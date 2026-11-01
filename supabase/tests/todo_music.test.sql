-- Café music player: the team reads the shared row, sends numbered commands and versioned
-- queues; outsiders get nothing. Runs after todo.test.sql (outsider@test exists, inactive).

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

select pg_temp.act_as('julio@test');
do $$
declare v int;
begin
  assert (select count(*) from public.music_player) = 1, 'one shared player row';
  v := public.music_set_queue('{"id":"PL1","name":"Café mix"}', '[{"id":"a","title":"A"},{"id":"b","title":"B"}]', 9);
  assert v = 1, 'queue version 1';
  assert (select position from public.music_player) = 1, 'position kept inside the queue';
  assert public.music_send('next') = 1 and public.music_send('pause') = 2, 'commands are numbered';
  assert (select command->>'action' from public.music_player) = 'pause', 'last command kept';
  -- The speaker reports into the row.
  update public.music_player set device_id = 'dev-1', playing = true, heartbeat_at = now();
  assert (select playing from public.music_player), 'speaker can report';
end $$;
select pg_temp.expect_error($q$select public.music_send('explode')$q$, 'Unknown music action');
select pg_temp.expect_error($q$insert into public.music_player (id) values (2)$q$, 'row-level security');
select pg_temp.expect_error($q$select public.music_set_queue(null, '{"a":1}', 0)$q$, 'list of songs');

select pg_temp.act_as('outsider@test');
do $$ begin
  assert (select count(*) from public.music_player) = 0, 'outsiders see no player';
  update public.music_player set playing = false;
  assert not exists (select 1 from public.music_player), 'and cannot change it';
end $$;
select pg_temp.expect_error($q$select public.music_send('play')$q$, 'Music is for the team');

reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin assert (select playing from public.music_player), 'outsider update ignored'; end $$;

-- The order the café's playlists play in: a list, kept by the shared player, team only.
select pg_temp.act_as('julio@test');
do $$ begin
  assert (select playlist_order from public.music_player) = '[]'::jsonb, 'no order until someone drags one';
  update public.music_player set playlist_order = '["PL2", "PL1"]';
  assert (select playlist_order->>0 from public.music_player) = 'PL2', 'the team can reorder the playlists';
end $$;
select pg_temp.expect_error($q$update public.music_player set playlist_order = '{"a":1}'$q$, 'playlist_order');

-- The café playlist: songs the team adds from a search, kept on the shared player, team only.
select pg_temp.act_as('julio@test');
do $$ begin
  assert (select cafe_playlist from public.music_player) = '[]'::jsonb, 'the café playlist starts empty';
  update public.music_player set cafe_playlist = '[{"id":"v1","title":"Lofi","artist":"Search result"}]';
  assert (select cafe_playlist->0->>'title' from public.music_player) = 'Lofi', 'the team adds a song to the café playlist';
end $$;
select pg_temp.expect_error($q$update public.music_player set cafe_playlist = '{"a":1}'$q$, 'cafe_playlist');
select pg_temp.act_as('outsider@test');
update public.music_player set cafe_playlist = '[]';
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin assert (select jsonb_array_length(cafe_playlist) from public.music_player) = 1, 'outsiders can’t change the café playlist'; end $$;
