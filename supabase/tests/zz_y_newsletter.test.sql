-- Newsletter sign-ups (the newsletter migration): Easy Beans starts with its website's topics; only admins
-- see and change the set-up and the sign-ups; a sign-up (the Worker, for one business) puts the person on
-- Customers once, with a yes to marketing and the topics as tags, keeping who someone already was; an
-- unsubscribe takes the yes back; another business's sign-ups are its own. Its own people and rows,
-- removed at the end.

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

-- The Worker: the service role, for one business.
create function pg_temp.as_worker(p_business int) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('app.business_id', p_business::text, false);
  set role service_role;
end $$;

create function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_err text;
begin
  begin execute p_sql; exception when others then v_err := sqlerrm; end;
  if v_err is null then raise exception 'Expected error like "%" but statement succeeded: %', p_like, p_sql; end if;
  if v_err not ilike '%' || p_like || '%' then raise exception 'Expected error like "%", got "%"', p_like, v_err; end if;
end $$;

reset role; select set_config('request.jwt.claim.sub', '', false);
insert into auth.users (email, raw_user_meta_data, invited_at) values
  ('nl-owner@test', '{"full_name": "Olga"}', now()),
  ('nl-ana@test', '{"full_name": "Ana"}', now());
update public.profiles set role = 'admin' where email = 'nl-owner@test';
update public.profiles set role = 'employee' where email = 'nl-ana@test';

-- 1. Easy Beans: on, its website's six topics (keys as the website sends them), email and phone.
select pg_temp.act_as('nl-owner@test');
do $$ begin
  assert (select enabled and not ask_name and ask_phone and key_hash is null from public.newsletter), 'on, asking for a phone';
  assert (select array_agg(x->>'key' order by o) from public.newsletter, jsonb_array_elements(interests) with ordinality as t(x, o))
         = array['coffee', 'spanish', 'english', 'menu', 'events', 'offers'], 'the website''s topics, in its order';
  assert (select x->'labels'->>'es' from public.newsletter, jsonb_array_elements(interests) x where x->>'key' = 'english') = 'Aprender inglés', 'worded in Spanish';
end $$;

-- 2. The owner changes the topics: tidied; a key and a name said once each; a key is plain.
update public.newsletter set interests = '[{"key": " Yoga ", "label": "  Yoga mornings ", "labels": {"es": " Yoga por la mañana ", "en": "", "fr": "Yoga"}},
                                           {"key": "kids", "label": "Kids club"}]';
do $$ begin
  assert (select interests from public.newsletter) = '[{"key": "yoga", "label": "Yoga mornings", "labels": {"es": "Yoga por la mañana"}},
                                                      {"key": "kids", "label": "Kids club", "labels": {}}]'::jsonb, 'tidied';
end $$;
select pg_temp.expect_error($q$update public.newsletter set interests = '[{"key": "a", "label": "A"}, {"key": "a", "label": "B"}]'$q$, 'Two topics have the key a');
select pg_temp.expect_error($q$update public.newsletter set interests = '[{"key": "a", "label": "Offers"}, {"key": "b", "label": "offers "}]'$q$, 'Two topics are called');
select pg_temp.expect_error($q$update public.newsletter set interests = '[{"key": "a b", "label": "A"}]'$q$, 'A topic’s key');
select pg_temp.expect_error($q$update public.newsletter set interests = '[{"key": "a", "label": " "}]'$q$, 'Each topic needs a name');
select pg_temp.expect_error($q$update public.newsletter set interests = '["Yoga"]'$q$, 'Each topic needs a name');
select pg_temp.expect_error($q$update public.newsletter set interests = (select jsonb_agg(jsonb_build_object('key', 'k' || i, 'label', 'L' || i)) from generate_series(1, 13) i)$q$,
  'newsletter_interests_check');
select pg_temp.expect_error($q$update public.newsletter set key_hash = repeat('a', 64)$q$, 'newsletter_key');

-- 3. An employee sees neither the set-up nor the sign-ups, and can't sign anyone up.
select pg_temp.act_as('nl-ana@test');
do $$ begin
  assert not exists (select 1 from public.newsletter), 'no set-up';
  update public.newsletter set enabled = false;
end $$;
select pg_temp.expect_error($q$select public.newsletter_signup('x@example.com')$q$, 'permission denied');
select pg_temp.act_as('nl-owner@test');
do $$ begin assert (select enabled from public.newsletter), 'still on'; end $$;
select pg_temp.expect_error($q$select public.newsletter_signup('x@example.com')$q$, 'permission denied');
select pg_temp.expect_error($q$insert into public.newsletter_events (customer_id, action, email, via) select id, 'signup', 'x@example.com', 'form' from public.customers limit 1$q$,
  'permission denied');

-- 4. Someone new signs up on the website: a lead from the website, yes to marketing, the topics as tags.
select pg_temp.as_worker(1);
select set_config('test.lucia', public.newsletter_signup('  NL-Lucia@Example.COM ', 'Lucía', null, '+34 600 111 222', '{english,offers}', '{Learning English,Offers}',
  'es', 'first_visit_popup', 'website', repeat('a', 64), null)::text, false);
do $$ begin
  assert (select kind = 'lead' and source = 'website' and marketing_consent and consent_at is not null and email = 'nl-lucia@example.com'
            and first_name = 'Lucía' and phone = '+34 600 111 222' and tags = array['Learning English', 'Offers']
            from public.customers where id = current_setting('test.lucia')::uuid), 'on Customers';
  assert (select action = 'signup' and via = 'website' and interests = array['english', 'offers'] and lang = 'es' and place = 'first_visit_popup'
            and email = 'nl-lucia@example.com' and at <= now()
            from public.newsletter_events where customer_id = current_setting('test.lucia')::uuid), 'the record of her yes';
end $$;

-- 5. Again, with other topics and another name: still one person, the topics added, the name kept.
do $$ begin
  assert public.newsletter_signup('nl-lucia@example.com', 'Lu', 'García', null, '{coffee,english}', '{Coffee tips,Learning English}', 'en', null, 'form', null, null)
         = current_setting('test.lucia')::uuid, 'the same person';
  assert (select count(*) from public.customers where lower(email) = 'nl-lucia@example.com') = 1, 'once';
  assert (select first_name = 'Lucía' and last_name is null and tags = array['Coffee tips', 'Learning English', 'Offers']
            from public.customers where id = current_setting('test.lucia')::uuid), 'topics added, her name kept';
  assert (select count(*) from public.newsletter_events where customer_id = current_setting('test.lucia')::uuid) = 2, 'both kept';
end $$;

-- 6. Someone already on Customers (from Square, a customer) stays who they were and gains the yes and the topics.
reset role;
select set_config('app.business_id', '1', false);
insert into public.customers (kind, source, first_name, email, tags) values ('customer', 'square', 'Pablo', 'nl-pablo@example.com', '{Regular}');
select pg_temp.as_worker(1);
do $$ begin
  perform public.newsletter_signup('NL-PABLO@example.com', 'Paco', 'Ruiz', 'not a phone', '{events}', '{Events}', 'xx-y', null, 'form', null, null);
  assert (select kind = 'customer' and source = 'square' and marketing_consent and first_name = 'Pablo' and last_name is null and phone is null
            and tags = array['Events', 'Regular'] from public.customers where email = 'nl-pablo@example.com'), 'a customer still, from Square';
  assert (select lang is null from public.newsletter_events where email = 'nl-pablo@example.com'), 'a language that isn''t one is left out';
end $$;

-- 7. A list brought in says when they signed up (never in the future); an email that isn't one is refused.
do $$ declare v uuid; begin
  v := public.newsletter_signup('nl-old@example.com', null, null, null, '{}', '{}', null, null, 'import', null, '2026-10-17 10:00+00');
  assert (select at = '2026-10-17 10:00+00' and via = 'import' from public.newsletter_events where customer_id = v), 'when they signed up';
  v := public.newsletter_signup('nl-future@example.com', null, null, null, '{}', '{}', null, null, 'import', null, now() + interval '3 days');
  assert (select at <= now() from public.newsletter_events where customer_id = v), 'not in the future';
end $$;
select pg_temp.expect_error($q$select public.newsletter_signup('not-an-email')$q$, 'Enter a valid email');
select pg_temp.expect_error($q$select public.newsletter_signup('')$q$, 'Enter a valid email');

-- 8. Twenty tags at most: someone who has twenty keeps theirs.
reset role;
insert into public.customers (email, tags) select 'nl-full@example.com', array_agg('Tag ' || lpad(i::text, 2, '0')) from generate_series(1, 20) i;
select pg_temp.as_worker(1);
do $$ begin
  perform public.newsletter_signup('nl-full@example.com', null, null, null, '{events}', '{Events}', null, null, 'form', null, null);
  assert (select cardinality(tags) = 20 and not 'Events' = any(tags) and marketing_consent from public.customers where email = 'nl-full@example.com'), 'twenty, and signed up';
end $$;

-- 9. Unsubscribing takes the yes back (and is kept); signing up again is a new yes. Someone not there: false.
do $$ begin
  assert public.newsletter_unsubscribe(' NL-Lucia@example.com '), 'unsubscribed';
  assert (select not marketing_consent and consent_at is null from public.customers where id = current_setting('test.lucia')::uuid), 'no more marketing';
  assert (select via = 'website' from public.newsletter_events where customer_id = current_setting('test.lucia')::uuid and action = 'unsubscribe'), 'kept';
  assert not public.newsletter_unsubscribe('nl-nobody@example.com'), 'nobody to unsubscribe';
  perform public.newsletter_signup('nl-lucia@example.com', null, null, null, '{}', '{}', null, null, 'form', null, null);
  assert (select marketing_consent from public.customers where id = current_setting('test.lucia')::uuid), 'a new yes';
end $$;

-- 10. The owner sees the sign-ups; deleting someone from Customers takes their record with them.
select pg_temp.act_as('nl-owner@test');
do $$ begin
  assert (select count(*) from public.newsletter_events where email = 'nl-lucia@example.com') = 4, 'the owner sees them';
  delete from public.customers where email = 'nl-pablo@example.com';
  assert not exists (select 1 from public.newsletter_events where email = 'nl-pablo@example.com'), 'gone with them';
end $$;
select pg_temp.act_as('nl-ana@test');
do $$ begin assert not exists (select 1 from public.newsletter_events), 'an employee sees none'; end $$;

-- 11. Another business's sign-ups are its own: the same email is someone else there, and Easy Beans' Lucía is untouched.
-- (Made and undone in one transaction, by its own number, so the businesses later tests make keep theirs.)
reset role; select set_config('request.jwt.claim.sub', '', false);
begin;
select set_config('app.business_id', '91', true);
insert into public.business (id, name, timezone, opening_hours) values (91, 'Bar Noventa y Uno', 'Europe/Madrid', '{}');
insert into public.settings default values;
insert into public.business_admin_notes default values;
insert into public.billing default values;
select set_config('app.business_id', '91', false);
set local role service_role;
do $$ declare v uuid; begin
  v := public.newsletter_signup('nl-lucia@example.com', null, null, null, '{yoga}', '{Yoga}', null, null, 'form', null, null);
  assert v <> current_setting('test.lucia')::uuid, 'someone else there';
  assert (select business_id = 91 and tags = array['Yoga'] from public.customers where id = v), 'Bar Noventa y Uno''s';
  assert (select business_id = 91 from public.newsletter_events where customer_id = v), 'and the record';
  assert public.newsletter_unsubscribe('nl-lucia@example.com'), 'unsubscribed there';
end $$;
reset role;
do $$ begin
  assert (select marketing_consent and not 'Yoga' = any(tags) from public.customers where id = current_setting('test.lucia')::uuid), 'Easy Beans'' Lucía untouched';
end $$;
rollback;

-- Tidy up: this test's people and rows; Easy Beans' set-up as it started.
reset role; select set_config('request.jwt.claim.sub', '', false); select set_config('app.business_id', '', false);
delete from public.customers where business_id = 1 and email in ('nl-lucia@example.com', 'nl-old@example.com', 'nl-future@example.com', 'nl-full@example.com');
update public.newsletter set interests = '[
  {"key": "coffee",  "label": "Coffee tips",      "labels": {"en": "Coffee tips",      "es": "Trucos de café"}},
  {"key": "spanish", "label": "Learning Spanish", "labels": {"en": "Learning Spanish", "es": "Aprender español"}},
  {"key": "english", "label": "Learning English", "labels": {"en": "Learning English", "es": "Aprender inglés"}},
  {"key": "menu",    "label": "Menu updates",     "labels": {"en": "Menu updates",     "es": "Novedades"}},
  {"key": "events",  "label": "Events",           "labels": {"en": "Events",           "es": "Eventos"}},
  {"key": "offers",  "label": "Offers",           "labels": {"en": "Offers",           "es": "Ofertas"}}
]' where business_id = 1;
delete from auth.users where email like 'nl-%@test';
