-- Steeper steps of reach for big accounts: a story or shout-out from someone who reaches 10,000
-- people is worth ×5 (was ×3), from 50,000 ×10 (was ×5). Under 1,000 it stays ×1, from 1,000 ×2.
-- Customers' credit is kept small to start with (50 cents a story), so the money goes to the people
-- who reach the most. shared/reps.ts (REACH_TIERS) says the same. Rewards already logged keep the
-- multiplier they had.
create or replace function public.reach_multiplier(p_reach bigint) returns numeric
language sql immutable set search_path = ''
as $$
  select (case when coalesce(p_reach, 0) >= 50000 then 10 when p_reach >= 10000 then 5 when p_reach >= 1000 then 2 else 1 end)::numeric;
$$;
