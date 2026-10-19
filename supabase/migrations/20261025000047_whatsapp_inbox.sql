-- WhatsApp chats on the Messages page. Meta never lets an app read WhatsApp messages back, so the
-- Worker saves each one as its webhook delivers it (and the café's own messages as they're sent).
-- They're kept for as long as an admin chooses under My account → Data retention (3 months unless
-- changed); older ones, with their photos and voice notes, are deleted for good.

-- 1. How long to keep them, in days: 1 month, 3 months, 6 months, 1 year or 2 years.
alter table public.settings add column whatsapp_retention_days int not null default 90
  check (whatsapp_retention_days in (30, 90, 180, 365, 730));

-- 2. Every message, either way. wa_id is the other person's number, digits only (as WhatsApp gives it).
create table public.whatsapp_messages (
  id             bigint generated always as identity primary key,
  wa_message_id  text not null unique,
  wa_id          text not null check (wa_id ~ '^[0-9]{6,20}$'),
  -- Their WhatsApp profile name (or the team member's name, for the café's alerts to staff).
  name           text check (char_length(name) <= 200),
  from_me        boolean not null,
  kind           text not null default 'text' check (kind in ('text', 'image', 'video', 'audio', 'file', 'location', 'other')),
  body           text not null default '' check (char_length(body) <= 4096),
  -- A map link for a location.
  link           text,
  -- Photos, videos, voice notes and files: Meta's id, then where the Worker saved it (storage
  -- bucket whatsapp-media), or why it couldn't.
  media_id       text,
  media_type     text,
  media_path     text,
  media_error    text,
  -- The customer's reaction to this message (an emoji).
  reaction       text,
  -- The café's messages: sent, delivered, read or failed (from WhatsApp's receipts).
  status         text check (status in ('sent', 'delivered', 'read', 'failed')),
  error          text,
  at             timestamptz not null default now(),
  created_at     timestamptz not null default now()
);
create index whatsapp_messages_chat_idx on public.whatsapp_messages (wa_id, at desc);
create index whatsapp_messages_at_idx on public.whatsapp_messages (at);
alter table public.whatsapp_messages enable row level security;
revoke all on public.whatsapp_messages from anon;
-- Admins read them (the Worker serves the Messages page); only the Worker writes.
create policy whatsapp_messages_admin on public.whatsapp_messages for select to authenticated using ((select public.is_admin()));
revoke insert, update, delete on public.whatsapp_messages from authenticated;

-- 3. Delete what's older than the chosen time. Returns each deleted message's saved file (null
--    when it had none) so the Worker can delete the files too. Run nightly and whenever the time changes.
create or replace function public.purge_whatsapp_messages() returns setof text
language sql security definer set search_path = ''
as $$
  delete from public.whatsapp_messages
  where at < now() - make_interval(days => coalesce((select whatsapp_retention_days from public.settings where id = 1), 90))
  returning media_path
$$;
revoke execute on function public.purge_whatsapp_messages() from public, anon, authenticated;
grant execute on function public.purge_whatsapp_messages() to service_role;
