-- Tables added after the core migration were still granted to anon by Supabase's default
-- privileges. Row security already hid every row; this also hides them from the API schema.
revoke all on public.expenses, public.integrations, public.outbox, public.time_off from anon;
