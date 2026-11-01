-- QR codes (Business section; the owner calls them barcodes): the business's codes, each a link (the
-- menu on the tables, the competition on the café screen), a Wi-Fi network (scan to join) or some
-- text, with where it's used, the line printed under it, its colours and whether the logo goes in the
-- middle. The app draws them (shared/qrCodes.ts) and downloads them as a PNG or an SVG, or prints
-- them. A code can wait for what it says (a Wi-Fi network nobody has typed in yet): the page asks for
-- it and offers no download until it's there.
-- Who: the whole team reads them and downloads them; admins add, change, order and remove them.
-- Partners and the café tablet see none.

create table public.qr_codes (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 60),
  kind           text not null default 'link' check (kind in ('link', 'wifi', 'text')),
  -- A link: the web address it opens.
  url            text check (url ~* '^https?://[^\s/]+\.\S+$' and char_length(url) <= 2000),
  -- Text: what the phone shows when it's scanned.
  content        text check (char_length(content) <= 1000),
  -- Wi-Fi: the network's name (at most 32 bytes), its password, how it's locked (WPA covers WPA2 and
  -- WPA3; nopass: an open network) and whether it's hidden.
  wifi_ssid      text check (octet_length(wifi_ssid) <= 32),
  wifi_password  text check (char_length(wifi_password) <= 64),
  wifi_security  text not null default 'WPA' check (wifi_security in ('WPA', 'WEP', 'nopass')),
  wifi_hidden    boolean not null default false,
  -- Where it's used: "On the tables".
  used_where     text check (char_length(used_where) <= 80),
  -- The line printed under it ("Scan for the menu"); null: the usual one for its kind.
  caption        text check (char_length(caption) <= 80),
  -- Its colour and its background; null: the brand's dark colour, and white.
  dark_colour    text check (dark_colour ~ '^#[0-9A-Fa-f]{6}$'),
  light_colour   text check (light_colour ~ '^#[0-9A-Fa-f]{6}$'),
  -- The brand's logo in the middle (drawn with more error correction, so it still scans).
  logo           boolean not null default false,
  sort           int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users on delete set null default auth.uid()
);
select public.add_business_scope('public.qr_codes');
create unique index qr_codes_name_key on public.qr_codes (business_id, lower(name));

-- Tidy what's typed (a Wi-Fi password is kept exactly as typed: spaces count).
create or replace function public.qr_code_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.url := nullif(btrim(new.url), '');
  new.content := nullif(btrim(new.content), '');
  new.wifi_ssid := nullif(btrim(new.wifi_ssid), '');
  new.wifi_password := nullif(new.wifi_password, '');
  new.used_where := nullif(btrim(new.used_where), '');
  new.caption := nullif(btrim(new.caption), '');
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
create trigger qr_codes_rules before insert or update on public.qr_codes for each row execute function public.qr_code_rules();
create trigger audit_qr_codes after insert or update or delete on public.qr_codes for each row execute function public.audit_row();

alter table public.qr_codes enable row level security;
revoke all on public.qr_codes from anon;
create policy qr_codes_read on public.qr_codes for select to authenticated using ((select public.is_staff()));
create policy qr_codes_admin on public.qr_codes for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Easy Beans (business 1): its three codes, in the owner's order
-- ---------------------------------------------------------------------------
-- The menu on the tables, the competition on the café screen (the code on the competition page the
-- TV shows), and the Wi-Fi on the counter, whose name and password aren't known yet: the page asks
-- for them. Nothing is added twice, and without business 1 nothing at all.
insert into public.qr_codes (business_id, name, kind, url, wifi_security, used_where, caption, sort)
select 1, c.name, c.kind, c.url, 'WPA', c.used_where, c.caption, c.sort
  from (values ('Menu', 'link', 'https://easybeanscoffee.com/menu', 'On the tables', 'Scan for the menu', 1),
               ('Competition', 'link', 'https://easybeanscoffee.com/competition', 'On the café screen', 'Scan to enter the competition', 2),
               ('Wi-Fi', 'wifi', null, 'On the counter', 'Scan to join the Wi-Fi', 3)) c(name, kind, url, used_where, caption, sort)
 where exists (select 1 from public.business where id = 1)
   and not exists (select 1 from public.qr_codes x where x.business_id = 1 and lower(x.name) = lower(c.name));
