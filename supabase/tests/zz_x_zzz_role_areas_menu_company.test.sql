-- Role areas: the menu and the company's details (the `role_areas_menu_company` migration): a role can
-- hide them, as the brand and expenses, they're only shown or not, and the areas from before still keep
-- to their levels. Its own people and rows, removed at the end.

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
insert into auth.users (email, raw_user_meta_data, invited_at) values ('bm-admin@test', '{"full_name": "Admin"}', now());
update public.profiles set role = 'admin' where email = 'bm-admin@test';

select pg_temp.act_as('bm-admin@test');
insert into public.job_roles (name, permissions) values
  ('BM barista', '{"business": "read", "company": "none", "brand": "none", "menu": "none", "expenses": "none", "dashboards": "none", "todo": "own"}');
do $$ begin
  assert (select permissions = '{"business": "read", "company": "none", "brand": "none", "menu": "none", "expenses": "none", "dashboards": "none", "todo": "own"}'::jsonb
            from public.job_roles where name = 'BM barista'), 'each can be hidden';
end $$;
update public.job_roles set permissions = '{"company": "update", "brand": "own", "menu": "update", "expenses": "update", "ai": "update", "rota": "none", "stock": "own"}'
 where name = 'BM barista';
do $$ begin
  assert (select permissions = '{"company": "read", "brand": "read", "menu": "read", "expenses": "read", "ai": "read", "rota": "read", "stock": "read"}'::jsonb
            from public.job_roles where name = 'BM barista'), 'they''re only shown or not; the others keep to their levels';
end $$;
select pg_temp.expect_error($q$update public.job_roles set permissions = '{"invoices": "none"}' where name = 'BM barista'$q$, 'Each area is none, own, read or update');

-- Tidy up.
reset role; select set_config('request.jwt.claim.sub', '', false);
delete from public.job_roles where name = 'BM barista';
delete from auth.users where email = 'bm-admin@test';
