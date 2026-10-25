-- Reviews and the website check: admins only; reviews kept once each with sane stars; new
-- reviews can be notified. Reuses the people of the tests before it: maria (admin), julio (employee).

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

-- 1. The Worker (service role) keeps reviews it sees, each once, and tells admins -------------
insert into public.reviews (id, rating, text, reviewer, created_at, language)
  values ('accounts/1/locations/2/reviews/a', 5, 'El mejor café de San Pedro', 'Lucía', '2026-09-10T10:00:00Z', 'es'),
         ('accounts/1/locations/2/reviews/b', 2, 'Slow service', 'Tom', '2026-09-20T10:00:00Z', 'en');
insert into public.reviews (id, rating, reviewer, created_at)
  values ('accounts/1/locations/2/reviews/a', 5, 'Lucía', '2026-09-10T10:00:00Z') on conflict do nothing;
do $$ begin
  assert (select count(*) from public.reviews) = 2, 'each review once';
  assert (select source = 'google' and reply is null from public.reviews where id like '%/a'), 'defaults';
end $$;
select pg_temp.expect_error($q$insert into public.reviews (id, rating, created_at) values ('x', 6, now())$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.reviews (id, rating, created_at, language) values ('y', 4, now(), 'fr')$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.reviews (id, rating, created_at, source) values ('z', 4, now(), 'yelp')$q$, 'check constraint');
insert into public.notifications (profile_id, title, link, kind, data)
  select id, 'New 2★ review from Tom', '/reviews', 'review', '{"review": "accounts/1/locations/2/reviews/b"}' from public.profiles where email = 'maria@test';
do $$ begin
  assert exists (select 1 from public.notifications where kind = 'review'), 'review notifications are allowed';
end $$;
select pg_temp.expect_error($q$insert into public.notifications (profile_id, title, kind) select id, 'x', 'gossip' from public.profiles limit 1$q$, 'check constraint');

-- 2. Admins read and reply; the check result is theirs too -------------------------------------
select pg_temp.act_as('maria@test');
do $$ begin
  assert (select count(*) from public.reviews) = 2, 'admins see reviews';
  update public.reviews set reply = 'Sorry Tom, we''d love to make it up to you', replied_at = now() where id like '%/b';
  assert (select reply is not null from public.reviews where id like '%/b'), 'admins reply';
  update public.website_checks set url = 'https://www.easybeanscoffee.com/', report = '{"items": []}', checked_at = now();
  assert (select url is not null from public.website_checks), 'admins keep the check';
end $$;
select pg_temp.expect_error($q$update public.website_checks set report = '[]'$q$, 'check constraint');
select pg_temp.expect_error($q$insert into public.website_checks (id) values (2)$q$, 'check constraint');
do $$ begin
  assert exists (select 1 from public.audit_log where table_name = 'reviews' and action = 'update'), 'replies audited';
end $$;

-- 3. Staff see nothing and change nothing --------------------------------------------------------
select pg_temp.act_as('julio@test');
do $$ declare n int; begin
  assert (select count(*) from public.reviews) = 0, 'employees see no reviews';
  assert (select count(*) from public.website_checks) = 0, 'employees see no website check';
  update public.reviews set reply = 'x'; get diagnostics n = row_count;
  assert n = 0, 'employees change nothing';
end $$;
select pg_temp.expect_error($q$insert into public.reviews (id, rating, created_at) values ('sneaky', 5, now())$q$, 'row-level security');

reset role;
select set_config('request.jwt.claim.sub', '', false);
