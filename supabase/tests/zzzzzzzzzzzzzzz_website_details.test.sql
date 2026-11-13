-- The business's details on its website (the website_details migration): off until the business turns it
-- on; WhatsApp kept as phones are, TikTok as a plain username; the seeds only touch Easy Beans. Nothing
-- made here stays.

begin;

create function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_err text;
begin
  begin execute p_sql; exception when others then v_err := sqlerrm; end;
  if v_err is null then raise exception 'Expected error like "%" but statement succeeded: %', p_like, p_sql; end if;
  if v_err not ilike '%' || p_like || '%' then raise exception 'Expected error like "%", got "%"', p_like, v_err; end if;
end $$;

reset role;
select set_config('app.business_id', '1', false);
do $$ begin
  assert (select not website_details from public.settings where business_id = 1), 'off for a business that isn''t Easy Beans';
  assert (select whatsapp is null and tiktok is null from public.business where id = 1), 'nothing filled in for another business';
end $$;
update public.business set whatsapp = '+34 600 111 222', tiktok = 'test.cafe' where id = 1;
select pg_temp.expect_error($q$update public.business set whatsapp = '600 111 222' where id = 1$q$, 'business_whatsapp_check');
select pg_temp.expect_error($q$update public.business set tiktok = '@Test Café' where id = 1$q$, 'business_tiktok_check');
update public.settings set website_details = true where business_id = 1;
do $$ begin
  assert (select website_details from public.settings where business_id = 1), 'an admin turns it on';
end $$;

rollback;
