-- The café's tax number (Spanish CIF/NIF/NIE, stored as typed: letters and digits, upper case).
alter table public.business add column tax_id varchar(20)
  check (tax_id is null or tax_id ~ '^[A-Z0-9]{5,20}$');

-- How each person prefers to be contacted. Text, email and WhatsApp work now; call, Slack and
-- Telegram are listed as coming soon in the app. Set by the person or an admin.
alter table public.profiles add column contact_method varchar(20)
  check (contact_method is null or contact_method in ('sms', 'email', 'whatsapp', 'call', 'slack', 'telegram'));
grant update (contact_method) on public.profiles to authenticated;
