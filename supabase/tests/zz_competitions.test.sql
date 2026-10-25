-- Competitions: tidied, admins only, each person enters once, and the draw picks the winners and
-- reserves at random from the valid entries, once.
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

-- 1. An admin sets one up; what's typed is tidied and what the draw sets can't be typed ----------
select pg_temp.act_as('maria@test');
do $$
declare v_id uuid;
begin
  insert into public.competitions (name, kind, channels, status, starts_on, ends_on, draw_on, prize, prize_value, how_to_enter, rules, caption, drawn_at, entry_count)
    values ('  Navidad giveaway ', 'instagram_giveaway', array['instagram', 'in_cafe', 'instagram'], 'live', current_date - 3, current_date + 10, current_date + 11,
            ' A hamper ', 45, array[' Follow us ', '', 'Like the post'], '{"min_age": 16}', '  ', now(), 99)
    returning id into v_id;
  assert (select name = 'Navidad giveaway' and prize = 'A hamper' and caption is null and updated_by = auth.uid()
            and channels = array['in_cafe', 'instagram'] and how_to_enter = array['Follow us', 'Like the post']
            and drawn_at is null and entry_count is null
            and (rules->>'min_age')::int = 16 and (rules->>'spain_only')::boolean and not (rules->>'marketing_signup')::boolean
          from public.competitions where id = v_id), 'tidied, the usual rules filled in, the draw''s fields left empty';
  perform set_config('test.comp', v_id::text, false);
end $$;
select pg_temp.expect_error($q$insert into public.competitions (name, kind) values ('X', 'lottery')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.competitions (name, channels) values ('X', array['myspace'])$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.competitions (name, starts_on, ends_on) values ('X', '2026-05-02', '2026-05-01')$q$, 'competitions_dates');
select pg_temp.expect_error($q$insert into public.competitions (name, ends_on, draw_on) values ('X', '2026-05-02', '2026-05-01')$q$, 'competitions_dates');
select pg_temp.expect_error($q$update public.competitions set status = 'drawn' where id = current_setting('test.comp')::uuid$q$, 'Draw the winners first');
select pg_temp.expect_error(format($q$select public.draw_competition(%L)$q$, current_setting('test.comp')), 'no entries');

-- 2. Entries: tidied, each person once (by username or email) ----------------------------------
do $$
declare v_id uuid := current_setting('test.comp')::uuid; i int;
begin
  insert into public.competition_entries (competition_id, handle, source, rank) values (v_id, ' @Ana.Lopez ', 'instagram_paste', 1);
  insert into public.competition_entries (competition_id, name, email, phone) values (v_id, '  Pepe   García ', ' Pepe@Example.com ', ' +34 600  000 001 ');
  assert (select handle = 'ana.lopez' and rank is null from public.competition_entries where competition_id = v_id and source = 'instagram_paste'), 'the @ and capitals gone; no rank before the draw';
  assert (select name = 'Pepe García' and email = 'pepe@example.com' and phone = '+34 600 000 001' from public.competition_entries where email is not null), 'tidied';
  for i in 1..8 loop
    insert into public.competition_entries (competition_id, handle, source) values (v_id, 'fan' || i, 'instagram_paste');
  end loop;
  update public.competition_entries set valid = false, note = 'Duplicate account' where competition_id = v_id and handle = 'fan8';
end $$;
select pg_temp.expect_error(format($q$insert into public.competition_entries (competition_id, handle) values (%L, 'ANA.LOPEZ')$q$, current_setting('test.comp')), 'competition_entries_handle_key');
select pg_temp.expect_error(format($q$insert into public.competition_entries (competition_id, email) values (%L, 'PEPE@example.com')$q$, current_setting('test.comp')), 'competition_entries_email_key');
select pg_temp.expect_error(format($q$insert into public.competition_entries (competition_id, note) values (%L, 'Nobody')$q$, current_setting('test.comp')), 'competition_entries_someone');
select pg_temp.expect_error(format($q$insert into public.competition_entries (competition_id, handle) values (%L, 'not a handle!')$q$, current_setting('test.comp')), 'check constraint');

-- 3. The draw: one winner and two reserves from the nine valid entries, once --------------------
do $$
declare v_id uuid := current_setting('test.comp')::uuid;
begin
  assert public.draw_competition(v_id) = 3, 'one winner and two reserves';
  assert (select status = 'drawn' and drawn_at is not null and drawn_by = auth.uid() and entry_count = 9 from public.competitions where id = v_id), 'recorded';
  assert (select array_agg(rank order by rank) = array[1, 2, 3] from public.competition_entries where competition_id = v_id and rank is not null), 'ranked 1 to 3';
  assert not exists (select 1 from public.competition_entries where competition_id = v_id and not valid and rank is not null), 'never an invalid entry';
  -- What the draw set stays as it was.
  update public.competitions set drawn_at = null, entry_count = 0, status = 'live' where id = v_id;
  assert (select status = 'drawn' and drawn_at is not null and entry_count = 9 from public.competitions where id = v_id), 'the draw can''t be undone';
  update public.competition_entries set rank = 1 where competition_id = v_id and rank is null;
  assert (select count(*) from public.competition_entries where competition_id = v_id and rank is not null) = 3, 'ranks only from the draw';
  update public.competitions set prize_given_at = now(), status = 'closed' where id = v_id;
  assert (select status = 'closed' from public.competitions where id = v_id), 'closed once the prize is given';
end $$;
select pg_temp.expect_error(format($q$select public.draw_competition(%L)$q$, current_setting('test.comp')), 'already been drawn');
select pg_temp.expect_error(format($q$insert into public.competition_entries (competition_id, handle) values (%L, 'latecomer')$q$, current_setting('test.comp')), 'no more entries');

-- 4. Random: over many draws of three entries, each one wins sometimes ---------------------------
do $$
declare v_id uuid; i int; v_wins text[] := '{}';
begin
  for i in 1..40 loop
    insert into public.competitions (name, winners, reserves) values ('Draw ' || i, 1, 0) returning id into v_id;
    insert into public.competition_entries (competition_id, handle) values (v_id, 'one'), (v_id, 'two'), (v_id, 'three');
    perform public.draw_competition(v_id);
    v_wins := v_wins || (select handle from public.competition_entries where competition_id = v_id and rank = 1);
  end loop;
  assert (select count(distinct x) from unnest(v_wins) x) = 3, 'every entry can win';
  assert (select count(*) from public.competition_entries e join public.competitions c on c.id = e.competition_id
           where c.name like 'Draw %' and e.rank is not null) = 40, 'one winner each';
end $$;

-- 5. Employees see none and change none; deleting one takes its entries ------------------------
select pg_temp.act_as('julio@test');
do $$ declare n int; begin
  assert (select count(*) from public.competitions) = 0, 'employees see no competitions';
  assert (select count(*) from public.competition_entries) = 0, 'nor their entries';
  update public.competitions set prize = 'Mine'; get diagnostics n = row_count;
  assert n = 0, 'and change none';
end $$;
select pg_temp.expect_error($q$insert into public.competitions (name) values ('Sneaky')$q$, 'row-level security');
select pg_temp.expect_error(format($q$select public.draw_competition(%L)$q$, current_setting('test.comp')), 'No such competition');

select pg_temp.act_as('maria@test');
do $$ begin
  delete from public.competitions where name like 'Draw %';
  assert not exists (select 1 from public.competition_entries e where not exists (select 1 from public.competitions c where c.id = e.competition_id)), 'entries go with it';
  assert (select count(*) from public.competition_entries) = 10, 'the others stay';
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
