-- The assistant's monthly allowance (the `assistant_allowance` migration) and the sign-up check's
-- leftovers (the `signup_check` migration). Runs after zzzz_several_businesses: two businesses, the
-- first on Business (complimentary), the second on Free.

reset role;
select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false), set_config('request.headers', '', false);

do $$
begin
  assert (select assistant_per_month from public.plan_limits where plan = 'free') = 10, 'Free: 10 questions a month';
  assert (select assistant_per_month from public.plan_limits where plan = 'business') = 500, 'Business: 500';
  assert not has_function_privilege('authenticated', 'public.assistant_question(int)', 'execute'), 'only the Worker counts';
  assert not has_function_privilege('anon', 'public.assistant_question(int)', 'execute'), 'not signed out either';
  assert has_function_privilege('service_role', 'public.assistant_question(int)', 'execute'), 'the Worker can';
end $$;

-- As the Worker, for the second business (Free): ten questions, then no more until one is given back.
set role service_role;
select set_config('request.jwt.claim.role', 'service_role', false), set_config('request.headers', '{"x-business-id": "2"}', false);
do $$
declare v jsonb;
begin
  assert public.current_plan() = 'free', 'the second business is on Free';
  for i in 1..10 loop
    v := public.assistant_question();
    assert (v ->> 'allowed')::boolean and (v ->> 'used')::int = i, format('question %s counted: %s', i, v);
  end loop;
  v := public.assistant_question();
  assert not (v ->> 'allowed')::boolean and (v ->> 'used')::int = 10 and (v ->> 'limit')::int = 10, format('the eleventh is refused: %s', v);
  v := public.assistant_question(-1);
  assert (v ->> 'used')::int = 9, format('one given back: %s', v);
  v := public.assistant_question();
  assert (v ->> 'allowed')::boolean and (v ->> 'used')::int = 10, format('so one more fits: %s', v);
  assert (public.plan_status() -> 'usage' ->> 'assistant_this_month')::int = 10, 'the Billing page sees ten used';
  assert (public.plan_status() -> 'limits' ->> 'assistant_per_month')::int = 10, 'of ten';
end $$;

-- The first business has its own count.
select set_config('request.headers', '{"x-business-id": "1"}', false);
do $$
declare v jsonb := public.assistant_question();
begin
  assert (v ->> 'allowed')::boolean and (v ->> 'used')::int = 1 and (v ->> 'limit')::int = 500, format('business 1 counts apart: %s', v);
end $$;
reset role;
select set_config('request.jwt.claim.role', '', false), set_config('request.headers', '', false);

-- Each business sees only its own count.
do $$
begin
  assert (select count(*) from public.assistant_usage) = 2, 'two counts in all';
  assert (select array_agg(business_id order by business_id) from public.assistant_usage) = array[1, 2], 'one per business';
end $$;
delete from public.assistant_usage;

-- A new account keeps its name but not the check's answer or the invite's mark.
insert into auth.users (email, raw_user_meta_data) values
  ('signup-check@test', '{"full_name": "Sign Up", "captcha": "turnstile-answer", "invite": "worker-mark"}');
do $$
begin
  assert (select raw_user_meta_data from auth.users where email = 'signup-check@test') = '{"full_name": "Sign Up"}'::jsonb, 'only the name is kept';
end $$;
delete from auth.users where email = 'signup-check@test';
