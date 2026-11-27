-- The suggestion box (worker/suggestionBox.ts, shared/suggestionBox.ts): customers scan the Suggestion box
-- QR code and send the business an idea without signing in. Each one goes into customer_suggestions (the
-- Suggestions page, not sorted yet, heard "Suggestion box"), saved by the Worker for that business.
--
-- suggestion_box_sends: when ideas came, and from which address as an HMAC (never the address itself), for
-- the limits on how many an hour (five from one address, sixty a business). The Worker lets go of what's
-- older than a day. Nobody signed in reads it: only the Worker, for one business.

create table public.suggestion_box_sends (
  id          uuid primary key default gen_random_uuid(),
  ip_hash     text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at  timestamptz not null default now()
);
select public.add_business_scope('public.suggestion_box_sends');
create index suggestion_box_sends_ip_idx on public.suggestion_box_sends (business_id, ip_hash, created_at);
create index suggestion_box_sends_at_idx on public.suggestion_box_sends (business_id, created_at);

alter table public.suggestion_box_sends enable row level security;
revoke all on public.suggestion_box_sends from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Easy Beans (business 1): the Suggestion box code, after its others
-- ---------------------------------------------------------------------------
-- On the tables, opening Easy Beans' suggestion box at the app's address. Other businesses are offered
-- it on the QR codes page (shared/qrCodes.ts qrSuggestions). Not added twice, and without business 1
-- nothing at all.
insert into public.qr_codes (business_id, name, kind, url, wifi_security, used_where, caption, sort)
select 1, 'Suggestion box', 'link', 'https://businesssagent.com/api/site/1/suggest', 'WPA', 'On the tables', 'Got an idea for us? Scan to tell us',
       coalesce((select max(sort) from public.qr_codes where business_id = 1), 0) + 1
 where exists (select 1 from public.business where id = 1)
   and not exists (select 1 from public.qr_codes x where x.business_id = 1
                    and (lower(x.name) = 'suggestion box' or x.url = 'https://businesssagent.com/api/site/1/suggest'));
