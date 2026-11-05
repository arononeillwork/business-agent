-- Coffees' links to their roaster's website (the `coffee_links` migration): kept trimmed, emptied to
-- nothing, and only a web address. Admins change them as they change coffees; the team can't.
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

select pg_temp.act_as('maria@test');
do $$
declare v_id uuid;
begin
  insert into public.coffees (name, roaster, link) values ('Link Test Brasil', 'Puchero', '  https://somospuchero.com/producto/brasil/  ')
    returning id into v_id;
  assert (select link = 'https://somospuchero.com/producto/brasil/' from public.coffees where id = v_id), 'link trimmed';
  update public.coffees set link = '  ' where id = v_id;
  assert (select link is null from public.coffees where id = v_id), 'emptied';
end $$;
select pg_temp.expect_error($q$update public.coffees set link = 'somospuchero.com' where name = 'Link Test Brasil'$q$, 'check constraint');
select pg_temp.expect_error($q$update public.coffees set link = 'javascript:alert(1)' where name = 'Link Test Brasil'$q$, 'check constraint');

-- The team reads it, but can't change it.
select pg_temp.act_as('julio@test');
update public.coffees set link = 'https://example.com/' where name = 'Link Test Brasil';
reset role;
do $$ begin
  assert (select link is null from public.coffees where name = 'Link Test Brasil'), 'the team can''t change a coffee''s link';
end $$;
delete from public.coffees where name = 'Link Test Brasil';
