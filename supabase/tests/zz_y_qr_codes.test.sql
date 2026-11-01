-- QR codes (the `qr_codes` migration): Easy Beans starts with its menu, competition and Wi-Fi codes in
-- the owner's order, the Wi-Fi waiting for its network; the team reads them, admins change them, the
-- café tablet sees none, and another business sees none of them (nor they its own).
-- People from the tests before it: maria (admin), julio (employee); qr-tablet is new here.

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

create function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_err text;
begin
  begin execute p_sql; exception when others then v_err := sqlerrm; end;
  if v_err is null then raise exception 'Expected error like "%" but statement succeeded: %', p_like, p_sql; end if;
  if v_err not ilike '%' || p_like || '%' then raise exception 'Expected error like "%", got "%"', p_like, v_err; end if;
end $$;

reset role; select set_config('request.jwt.claim.sub', '', false);
insert into auth.users (email, raw_user_meta_data, invited_at) values ('qr-tablet@test', '{"full_name":"Tablet"}', now());
update public.profiles set role = 'kiosk' where email = 'qr-tablet@test';

-- 1. Easy Beans' three codes, in order: the menu on the tables, the competition on the café screen,
--    and the Wi-Fi on the counter with no network or password yet.
select pg_temp.act_as('julio@test');
do $$ begin
  assert (select array_agg(name || ':' || kind || ':' || coalesce(used_where, '-') order by sort) from public.qr_codes)
    = array['Menu:link:On the tables', 'Competition:link:On the café screen', 'Wi-Fi:wifi:On the counter'], 'the three codes';
  assert (select url from public.qr_codes where name = 'Menu') = 'https://easybeanscoffee.com/menu', 'the menu link';
  assert (select url from public.qr_codes where name = 'Competition') = 'https://easybeanscoffee.com/competition', 'the competition link';
  assert (select wifi_ssid is null and wifi_password is null and wifi_security = 'WPA' and not wifi_hidden from public.qr_codes where name = 'Wi-Fi'),
    'the Wi-Fi waits for its network';
end $$;

-- 2. An employee reads them and changes none of them.
select pg_temp.expect_error($q$insert into public.qr_codes (name, url) values ('Instagram', 'https://instagram.com/easy.beans.coffee')$q$, 'row-level security');
do $$
declare n int;
begin
  update public.qr_codes set name = 'Renamed';
  get diagnostics n = row_count;
  assert n = 0, 'renames none';
  delete from public.qr_codes;
  get diagnostics n = row_count;
  assert n = 0, 'removes none';
  assert (select count(*) from public.qr_codes) = 3, 'all three still there';
end $$;

-- 3. The café tablet sees none.
select pg_temp.act_as('qr-tablet@test');
do $$ begin
  assert (select count(*) from public.qr_codes) = 0, 'the tablet sees no codes';
end $$;

-- 4. An admin fills in the Wi-Fi (the password exactly as typed), adds a link (tidied, stamped),
--    puts it first, and the rules hold.
select pg_temp.act_as('maria@test');
do $$
declare v public.qr_codes;
begin
  update public.qr_codes set wifi_ssid = '  EasyBeans-Guest ', wifi_password = ' flat white ' where name = 'Wi-Fi' returning * into v;
  assert v.wifi_ssid = 'EasyBeans-Guest' and v.wifi_password = ' flat white ', 'the network tidied, the password kept';
  insert into public.qr_codes (name, kind, url, used_where, caption, dark_colour, light_colour, logo, sort)
  values ('  Instagram ', 'link', ' https://instagram.com/easy.beans.coffee ', '  ', ' Follow us ', '#2B2522', '#FFF8F0', true, 0)
  returning * into v;
  assert v.name = 'Instagram' and v.url = 'https://instagram.com/easy.beans.coffee' and v.used_where is null and v.caption = 'Follow us', 'tidied';
  assert v.updated_by = auth.uid() and v.business_id = 1, 'stamped, and Easy Beans''';
  assert (select array_agg(name order by sort) from public.qr_codes) = array['Instagram', 'Menu', 'Competition', 'Wi-Fi'], 'first';
  update public.qr_codes set sort = 9 where name = 'Instagram';
  assert (select array_agg(name order by sort) from public.qr_codes) = array['Menu', 'Competition', 'Wi-Fi', 'Instagram'], 'now last';
  insert into public.qr_codes (name, kind, content) values ('Table 4', 'text', ' Table 4 ');
  insert into public.qr_codes (name, kind, wifi_ssid, wifi_security, wifi_hidden) values ('Staff Wi-Fi', 'wifi', 'Señor café', 'nopass', true);
end $$;
select pg_temp.expect_error($q$insert into public.qr_codes (name) values ('menu')$q$, 'qr_codes_name_key');
select pg_temp.expect_error($q$insert into public.qr_codes (name, url) values ('Bad link', 'javascript:alert(1)')$q$, 'qr_codes_url_check');
select pg_temp.expect_error($q$insert into public.qr_codes (name, url) values ('No dot', 'https://localhost')$q$, 'qr_codes_url_check');
select pg_temp.expect_error($q$insert into public.qr_codes (name, kind) values ('Barcode', 'ean13')$q$, 'qr_codes_kind_check');
select pg_temp.expect_error($q$insert into public.qr_codes (name, kind, wifi_security) values ('Old', 'wifi', 'WPA4')$q$, 'qr_codes_wifi_security_check');
-- 17 ñ are 34 bytes: more than a network's name holds.
select pg_temp.expect_error($q$insert into public.qr_codes (name, kind, wifi_ssid) values ('Long', 'wifi', repeat('ñ', 17))$q$, 'qr_codes_wifi_ssid_check');
select pg_temp.expect_error($q$insert into public.qr_codes (name, dark_colour) values ('Grey', 'grey')$q$, 'qr_codes_dark_colour_check');
select pg_temp.expect_error($q$insert into public.qr_codes (name) values ('   ')$q$, 'qr_codes_name_check');
do $$ begin
  delete from public.qr_codes where name in ('Instagram', 'Table 4', 'Staff Wi-Fi');
  assert (select count(*) from public.qr_codes) = 3, 'removed';
  update public.qr_codes set wifi_ssid = '', wifi_password = '' where name = 'Wi-Fi';
  assert (select wifi_ssid is null and wifi_password is null from public.qr_codes where name = 'Wi-Fi'), 'emptied back to waiting';
end $$;

-- 5. Another business sees none of them, keeps a "Menu" of its own, and Easy Beans doesn't see it.
--    (Made and undone in one transaction, by its own number, so the businesses later tests make keep theirs.)
reset role; select set_config('request.jwt.claim.sub', '', false);
begin;
select set_config('app.business_id', '91', true);
insert into public.business (id, name, timezone, opening_hours) values (91, 'Bar Noventa y Uno', 'Europe/Madrid', '{}');
insert into public.settings default values;
insert into public.business_admin_notes default values;
insert into public.billing default values;
select set_config('app.business_id', '', true);
insert into auth.users (email, raw_user_meta_data, invited_at) values ('qr-other@test', '{"full_name": "Otra", "role": "admin", "business_id": "91"}', now());
select pg_temp.act_as('qr-other@test');
do $$ begin
  assert public.current_business_id() = 91 and public.is_admin(), 'the other business''s admin';
  assert (select count(*) from public.qr_codes) = 0, 'sees none of Easy Beans'' codes';
  update public.qr_codes set name = 'Mine' where name = 'Menu';
  insert into public.qr_codes (name, url) values ('Menu', 'https://bar91.example.com/carta');
  assert (select business_id from public.qr_codes where name = 'Menu') = 91, 'its own Menu';
end $$;
select pg_temp.act_as('maria@test');
do $$ begin
  assert (select count(*) from public.qr_codes) = 3, 'Easy Beans sees only its own';
  assert (select url from public.qr_codes where name = 'Menu') = 'https://easybeanscoffee.com/menu', 'and its Menu unchanged';
end $$;
rollback;

reset role; select set_config('request.jwt.claim.sub', '', false);
delete from auth.users where email like 'qr-%@test';
