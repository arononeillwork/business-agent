-- Tighten grants flagged by the Supabase security advisor.
revoke all on public.time_entry_totals from anon;
revoke execute on function public._resolve_actor(uuid), public._surface() from authenticated;
-- kiosk_attempts deliberately has no policies: only SECURITY DEFINER functions touch it.
comment on table public.kiosk_attempts is 'PIN attempts for lockout. No policies by design; only kiosk_punch() reads/writes.';
