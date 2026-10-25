-- The plan helpers from migration 36 are for signed-in people and the Worker only (they showed
-- usage such as posts this month to anyone with the public key).
revoke execute on function public.current_plan() from public, anon;
revoke execute on function public.plan_allows(text) from public, anon;
revoke execute on function public.plan_needed(text) from public, anon;
revoke execute on function public.posts_this_month(timestamptz, uuid) from public, anon;
grant execute on function public.current_plan() to authenticated, service_role;
grant execute on function public.plan_allows(text) to authenticated, service_role;
grant execute on function public.plan_needed(text) to authenticated, service_role;
grant execute on function public.posts_this_month(timestamptz, uuid) to authenticated, service_role;
