-- The in-app assistant's monthly allowance. It answers with The Business Agent's own Anthropic key, so
-- each plan includes a number of questions a calendar month for the whole business (assistantPerMonth
-- in shared/plans.ts; plans.test.ts checks this file still matches it). Business: 500, Pro: 200,
-- Starter: 50, Free: 10. The Worker counts a question before it asks Claude and gives it back if Claude
-- couldn't answer (worker/assistant.ts); the Billing page shows how many are used.

-- 1. What each plan includes. null: no limit.
alter table public.plan_limits add column assistant_per_month int check (assistant_per_month is null or assistant_per_month >= 0);
update public.plan_limits l set assistant_per_month = v.n from (values
  ('free', 10),
  ('starter', 50),
  ('pro', 200),
  ('business', 500)
) as v (plan, n) where l.plan = v.plan;

-- 2. Questions asked, each business by month (the first day of the month, UTC).
create table public.assistant_usage (
  month       date not null check (month = date_trunc('month', month)::date),
  questions   int not null default 0 check (questions >= 0),
  updated_at  timestamptz not null default now()
);
select public.add_business_scope('public.assistant_usage');
alter table public.assistant_usage add primary key (business_id, month);
alter table public.assistant_usage enable row level security;
revoke all on public.assistant_usage from anon, authenticated;
-- The business's admins and staff may see the count (the Billing page); only the Worker changes it.
grant select on public.assistant_usage to authenticated;
create policy assistant_usage_read on public.assistant_usage for select to authenticated using (true);

-- 3. One question: counted if the plan has room left this month (p_change 1), or given back (-1) when
--    Claude couldn't answer it. Only the Worker calls it, for the business it names. Returns
--    { allowed, used, limit }.
create or replace function public.assistant_question(p_change int default 1) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_business int := public.current_business_id();
  v_month    date := date_trunc('month', now() at time zone 'utc')::date;
  v_limit    int;
  v_used     int;
  v_counted  boolean;
begin
  if v_business is null then raise exception 'No business'; end if;
  if p_change not in (1, -1) then raise exception 'Count a question (1) or give one back (-1)'; end if;
  select assistant_per_month into v_limit from public.plan_limits where plan = public.current_plan();
  insert into public.assistant_usage (business_id, month) values (v_business, v_month)
    on conflict (business_id, month) do nothing;
  update public.assistant_usage set questions = greatest(questions + p_change, 0), updated_at = now()
   where business_id = v_business and month = v_month
     and (p_change < 0 or v_limit is null or questions < v_limit)
  returning questions into v_used;
  v_counted := found;
  if not v_counted then
    select questions into v_used from public.assistant_usage where business_id = v_business and month = v_month;
  end if;
  return jsonb_build_object('allowed', v_counted, 'used', v_used, 'limit', v_limit);
end $$;
alter function public.assistant_question(int) owner to app_definer;
revoke execute on function public.assistant_question(int) from public, anon, authenticated;
grant execute on function public.assistant_question(int) to service_role;

-- 4. The plan's limits and what's used: the assistant's questions this month too.
create or replace function public.plan_status() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'plan', public.current_plan(),
    'limits', (select to_jsonb(l) - 'plan' from public.plan_limits l where l.plan = public.current_plan()),
    'usage', jsonb_build_object(
      'people', (select count(*) from public.profiles where active and role in ('admin', 'employee')),
      'social_accounts', (select count(*) from public.integrations where status = 'connected' and provider in ('instagram', 'facebook', 'tiktok', 'linkedin')),
      'posts_this_month', public.posts_this_month(now()),
      'assistant_this_month', coalesce((select questions from public.assistant_usage
                                         where business_id = public.current_business_id()
                                           and month = date_trunc('month', now() at time zone 'utc')::date), 0)))
  where auth.uid() is null or exists (select 1 from public.profiles where id = auth.uid() and active);
$$;
