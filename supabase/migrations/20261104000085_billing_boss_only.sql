-- Billing is the boss's: an admin with pay access (the `team_roles` migration), not a shop manager.
-- The Worker's billing routes check the same; the plan in force stays readable by everyone
-- through plan_status(), which feature locks need.
drop policy billing_admin_read on public.billing;
create policy billing_boss_read on public.billing for select to authenticated using ((select public.can_see_pay()));
