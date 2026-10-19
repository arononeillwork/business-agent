-- Performance (Supabase advisor): evaluate auth.uid() once per query, not once per row, and index
-- the foreign keys the app joins on. Same rules as before.
alter policy profiles_read on public.profiles using (public.is_staff() or id = (select auth.uid()));
alter policy profiles_update_self on public.profiles using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter policy pay_rates_read on public.pay_rates using (profile_id = (select auth.uid()) or public.can_see_pay());
alter policy time_entries_read on public.time_entries using (profile_id = (select auth.uid()) or public.is_admin());
alter policy breaks_read on public.breaks using (exists (select 1 from public.time_entries t
  where t.id = time_entry_id and (t.profile_id = (select auth.uid()) or public.is_admin())));
alter policy time_entry_changes_read on public.time_entry_changes using (exists (select 1 from public.time_entries t
  where t.id = time_entry_id and (t.profile_id = (select auth.uid()) or public.is_admin())));
alter policy corrections_read on public.correction_requests using (profile_id = (select auth.uid()) or public.is_admin());
alter policy time_off_read on public.time_off
  using (profile_id = (select auth.uid()) or public.is_admin() or (status = 'approved' and public.is_staff()));

create index if not exists time_entries_shift_idx on public.time_entries (shift_id);
create index if not exists time_entries_position_idx on public.time_entries (position_id);
create index if not exists shifts_position_idx on public.shifts (position_id);
create index if not exists corrections_entry_idx on public.correction_requests (time_entry_id);
create index if not exists corrections_profile_idx on public.correction_requests (profile_id);
create index if not exists breaks_type_idx on public.breaks (break_type_id);
