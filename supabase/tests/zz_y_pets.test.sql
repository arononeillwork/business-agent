-- Pets: everyone on the team adds their own (tidied, a photo only as a small data: URL), sees
-- everyone's and changes only their own; admins look after anyone's. A pet stays its person's, and the
-- café tablet sees none.
-- People from the tests before it: maria (admin), julio (employee); ana is new here.

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
insert into auth.users (email, raw_user_meta_data, invited_at) values ('pets-ana@test', '{"full_name": "Ana"}', now());

-- 1. Julio adds his dog, with a photo; the names are tidied.
select pg_temp.act_as('julio@test');
do $$ declare v public.pets; begin
  insert into public.pets (profile_id, name, breed, photo) values (auth.uid(), '  Fudge  ', '  ', 'data:image/jpeg;base64,/9j/4AAQ')
    returning * into v;
  assert v.name = 'Fudge' and v.breed is null and v.kind = 'dog', 'tidied, a dog unless said otherwise';
  update public.pets set name = 'Fudge the dog', profile_id = (select id from public.profiles where email = 'maria@test') where id = v.id
    returning * into v;
  assert v.name = 'Fudge the dog' and v.profile_id = auth.uid(), 'renamed, and still his';
end $$;
select pg_temp.expect_error($q$insert into public.pets (profile_id, name, photo) values (auth.uid(), 'Rex', 'https://example.com/rex.jpg')$q$, 'pets_photo_check');
select pg_temp.expect_error($q$insert into public.pets (profile_id, name, photo) values (auth.uid(), 'Rex', 'data:text/html;base64,PHA+')$q$, 'pets_photo_check');
select pg_temp.expect_error($q$insert into public.pets (profile_id, name) values (auth.uid(), '   ')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.pets (profile_id, name, kind) values (auth.uid(), 'Polly', 'parrot')$q$, 'check constraint');

-- 2. Ana sees Julio's dog, adds her own cat, and can't add one for Julio or change or remove his.
select pg_temp.act_as('pets-ana@test');
insert into public.pets (profile_id, name, kind) values (auth.uid(), 'Miso', 'cat');
select pg_temp.expect_error($q$insert into public.pets (profile_id, name) values ((select id from public.profiles where email = 'julio@test'), 'Not mine')$q$, 'row-level security');
do $$ begin
  assert (select count(*) from public.pets where name = 'Fudge the dog') = 1, 'the team sees everyone''s pets';
  update public.pets set name = 'Renamed' where name = 'Fudge the dog';
  delete from public.pets where name = 'Fudge the dog';
  assert (select count(*) from public.pets where name = 'Fudge the dog') = 1, 'but changes only their own';
end $$;

-- 3. An admin looks after anyone's, but only for someone on the team.
select pg_temp.act_as('maria@test');
do $$ begin
  insert into public.pets (profile_id, name, sort) values ((select id from public.profiles where email = 'julio@test'), 'Cooper', 2);
  assert (select count(*) from public.pets p join public.profiles o on o.id = p.profile_id where o.email = 'julio@test') = 2, 'Julio has two dogs now';
  update public.pets set breed = 'Tabby' where name = 'Miso';
  assert (select breed from public.pets where name = 'Miso') = 'Tabby', 'an admin changes anyone''s';
end $$;
reset role; select set_config('request.jwt.claim.sub', '', false);
update public.profiles set role = 'kiosk' where email = 'pets-ana@test';
select pg_temp.act_as('maria@test');
select pg_temp.expect_error($q$insert into public.pets (profile_id, name) values ((select id from public.profiles where email = 'pets-ana@test'), 'Tablet dog')$q$, 'someone on the team');

-- 4. The café tablet sees none.
select pg_temp.act_as('pets-ana@test');
do $$ begin
  assert (select count(*) from public.pets) = 0, 'the tablet sees no pets';
end $$;

-- 5. Removing their own; a person who leaves takes their pets with them.
select pg_temp.act_as('julio@test');
do $$ begin
  delete from public.pets where name = 'Cooper';
  assert not exists (select 1 from public.pets where name = 'Cooper'), 'removed';
end $$;
reset role; select set_config('request.jwt.claim.sub', '', false);
delete from auth.users where email = 'pets-ana@test';
do $$ begin
  assert not exists (select 1 from public.pets where name = 'Miso'), 'gone with their person';
end $$;
delete from public.pets where profile_id = (select id from public.profiles where email = 'julio@test');
