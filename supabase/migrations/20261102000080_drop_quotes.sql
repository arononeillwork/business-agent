-- Quotes & estimates is gone from the app (its page and code were deleted), so its table goes too,
-- with the rules that numbered and totalled each quote and the trigger that moved its enquiry on.
-- Its triggers, policy and index go with the table. Leads keeps its Quoted stage, set by hand.

drop table if exists public.quotes;
drop function if exists public.quote_rules();
drop function if exists public.quote_moves_enquiry();
