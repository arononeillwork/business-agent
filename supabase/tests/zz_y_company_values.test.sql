-- Company values: Easy Beans starts with the owners' own values and the words nobody says, in English and
-- Spanish; the team reads them, admins change them, and partners and the café tablet see none.
-- People from the tests before it: maria (admin), julio (employee); cv-tablet is new here.

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
insert into auth.users (email, raw_user_meta_data, invited_at) values ('cv-tablet@test', '{"full_name":"Tablet"}', now());
update public.profiles set role = 'kiosk' where email = 'cv-tablet@test';

-- 1. Easy Beans' own: six values (the first with its point) and two words, in both languages.
select pg_temp.act_as('julio@test');
do $$ begin
  assert (select count(*) from public.company_values where kind = 'value' and parent_id is null) = 6, 'six values';
  assert (select text_en from public.company_values where kind = 'value' and parent_id is null order by sort limit 1)
    = 'Good energy in the café only: leave bad energy away from the café.', 'good energy first';
  assert (select p.text_es from public.company_values p join public.company_values v on v.id = p.parent_id where v.sort = 1 and v.kind = 'value')
    = 'Siempre hay alguien que está teniendo un día peor que tú.', 'with its point';
  assert (select array_agg(text_en order by sort) from public.company_values where kind = 'word') = array['Horrible', 'Stupido'], 'the words';
  assert not exists (select 1 from public.company_values where text_en is null or text_es is null), 'both languages';
end $$;

-- 2. An employee changes none of it.
select pg_temp.expect_error($q$insert into public.company_values (kind, text_en) values ('word', 'Fine')$q$, 'row-level security');
do $$ begin
  update public.company_values set text_en = 'Changed';
  delete from public.company_values;
  assert (select count(*) from public.company_values where text_en = 'Changed') = 0, 'unchanged';
  assert (select count(*) from public.company_values) = 9, 'nothing deleted';
end $$;

-- 3. An admin adds a value (tidied) with a point under it, and a word; a point goes under a value, and
--    words have none.
select pg_temp.act_as('maria@test');
do $$
declare v_value public.company_values; v_point public.company_values;
begin
  insert into public.company_values (kind, text_en, text_es, sort) values ('value', '  Leave the bar cleaner than you found it  ', ' ', 7) returning * into v_value;
  assert v_value.text_en = 'Leave the bar cleaner than you found it' and v_value.text_es is null and v_value.updated_by = auth.uid(), 'tidied and stamped';
  insert into public.company_values (kind, parent_id, text_es) values ('value', v_value.id, 'También la terraza') returning * into v_point;
  assert v_point.text_en is null, 'Spanish only';
  insert into public.company_values (kind, text_en, text_es, sort) values ('word', 'Whatever', 'Lo que sea', 3);
end $$;
select pg_temp.expect_error($q$insert into public.company_values (kind, text_en) values ('value', ' ')$q$, 'in English or Spanish');
select pg_temp.expect_error($q$insert into public.company_values (kind, text_en) values ('rule', 'Be kind')$q$, 'company_values_kind_check');
select pg_temp.expect_error($q$insert into public.company_values (kind, parent_id, text_en) select 'word', id, 'Nope' from public.company_values where text_en = 'Whatever'$q$, 'under one of the values');
select pg_temp.expect_error($q$insert into public.company_values (kind, parent_id, text_en) select 'value', id, 'Deeper' from public.company_values where text_es = 'También la terraza'$q$, 'under one of the values');
select pg_temp.expect_error($q$update public.company_values set parent_id = (select id from public.company_values where text_en = 'No cursing allowed (for Aron mainly).') where text_en = 'Leave the bar cleaner than you found it'$q$, 'can''t be a point itself');
select pg_temp.expect_error($q$insert into public.company_values (kind, text_en) values ('word', repeat('x', 301))$q$, 'company_values_text_en_check');

-- 4. Taking a value off takes its points with it.
do $$ begin
  delete from public.company_values where text_en = 'Leave the bar cleaner than you found it';
  assert not exists (select 1 from public.company_values where text_es = 'También la terraza'), 'its point went with it';
  delete from public.company_values where text_en = 'Whatever';
  assert (select count(*) from public.company_values) = 9, 'back to Easy Beans'' own';
end $$;

-- 5. The café tablet sees none of it.
select pg_temp.act_as('cv-tablet@test');
do $$ begin
  assert (select count(*) from public.company_values) = 0, 'no values';
end $$;

reset role; select set_config('request.jwt.claim.sub', '', false);
delete from auth.users where email = 'cv-tablet@test';
