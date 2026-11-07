-- Spain and Ireland (the country migration): a business made in Ireland starts on Irish time and rules,
-- with Grants and Tax hidden and unpaid breaks; one made by an older app (no country) is in Spain unless
-- its time zone is Dublin's; any other country is refused. Irish VAT (23%) fits where VAT rates are kept.

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.headers', '', false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

reset role;
insert into auth.users (email, raw_user_meta_data) values
  ('dublin@test', '{"full_name":"Aoife"}'), ('older-app@test', '{"full_name":"Older"}'), ('elsewhere@test', '{"full_name":"Elsewhere"}');

select pg_temp.act_as('dublin@test');
do $$
declare v_id int := public.create_business('The Daily Grind', 'cafe', null, null, 'IE');
begin
  assert (select country = 'IE' and timezone = 'Europe/Dublin' and locale = 'en-IE' from public.business where id = v_id), 'an Irish café, on Dublin time';
  assert (select break_after_hours = 4.5 and min_break_minutes = 15 and min_rest_hours = 11 and max_weekly_hours = 48 and vacation_days_per_year = 28
            from public.settings), 'Irish working-time rules and 4 weeks'' leave';
  assert (select hidden_pages = array['grants', 'tax'] from public.settings), 'Grants and Tax hidden (Spain''s for now)';
  assert (select string_agg(name || ':' || paid, ', ' order by minutes) from public.break_types) = 'Break 15 min (unpaid):false, Break 30 min (unpaid):false', 'unpaid breaks';
  assert (select vat_rate = 13.5 from public.pnl_settings), 'café food and drink at 13.5%';
  insert into public.stock_items (name, unit, vat_rate) values ('Bottled water', 'bottle', 23);
  assert (select vat_rate = 23 from public.stock_items where name = 'Bottled water'), 'Irish standard VAT fits';
end $$;

-- An app from before the question: Spain, unless its time zone is Dublin's.
select pg_temp.act_as('older-app@test');
do $$
declare v_id int := public.create_business(p_name => 'Bar Viejo', p_kind => 'pub', p_timezone => 'Europe/Madrid', p_referral => null);
begin
  assert (select country = 'ES' and timezone = 'Europe/Madrid' and locale = 'es-ES' from public.business where id = v_id), 'Spain, as before';
  assert (select break_after_hours = 6 and vacation_days_per_year = 30 from public.settings), 'Spanish rules';
  assert (select hidden_pages = array['coffees'] from public.settings), 'a pub''s pages only';
  assert (select string_agg(name, ', ') from public.break_types) = 'Rest 15 min (paid)', 'Spain''s paid rest';
end $$;

select pg_temp.act_as('elsewhere@test');
do $$
declare v_err text;
begin
  begin perform public.create_business('Somewhere Else', 'cafe', 'Europe/Paris', null, 'FR'); exception when others then v_err := sqlerrm; end;
  assert v_err like '%Spain and Ireland%', 'only Spain and Ireland: ' || coalesce(v_err, 'no error');
end $$;
reset role;
