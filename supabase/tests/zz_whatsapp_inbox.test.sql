-- WhatsApp chats and Data retention (migration 47): admins read, only the Worker writes, and the
-- purge deletes by the chosen time. Reuses time_tracking.test.sql's people: maria (admin), julio (employee).

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

reset role;
select set_config('request.jwt.claim.sub', '', false);

-- 1. Kept for 3 months unless changed; only the offered times ------------------------------------
do $$ begin
  assert (select whatsapp_retention_days from public.settings where id = 1) = 90, 'default 3 months';
end $$;
select pg_temp.expect_error('update public.settings set whatsapp_retention_days = 7 where id = 1', 'whatsapp_retention_days');

-- 2. The Worker saves messages (one per WhatsApp id); numbers are digits only ---------------------
insert into public.whatsapp_messages (wa_message_id, wa_id, name, from_me, body, media_path, at) values
  ('wamid.new', '34611222333', 'Sofía', false, 'Hola', null, now() - interval '10 days'),
  ('wamid.mid', '34611222333', 'Sofía', false, '', '2026-08-01/34611222333/2.jpg', now() - interval '45 days'),
  ('wamid.old', '34611222333', 'Sofía', true, 'Gracias', null, now() - interval '100 days');
select pg_temp.expect_error($$insert into public.whatsapp_messages (wa_message_id, wa_id, from_me) values ('wamid.new', '34611222333', false)$$, 'duplicate');
select pg_temp.expect_error($$insert into public.whatsapp_messages (wa_message_id, wa_id, from_me) values ('wamid.x', '+34 611', false)$$, 'wa_id');
select pg_temp.expect_error($$insert into public.whatsapp_messages (wa_message_id, wa_id, from_me, kind) values ('wamid.y', '34611222333', false, 'sticker')$$, 'kind');

-- 3. Admins read; employees don't; nobody signed in writes -----------------------------------------
select pg_temp.act_as('maria@test');
do $$ begin
  assert (select count(*) from public.whatsapp_messages) = 3, 'admin reads every message';
end $$;
select pg_temp.expect_error($$insert into public.whatsapp_messages (wa_message_id, wa_id, from_me) values ('wamid.z', '34611222333', true)$$, 'permission denied');
select pg_temp.expect_error($$delete from public.whatsapp_messages$$, 'permission denied');
select pg_temp.expect_error($$select public.purge_whatsapp_messages()$$, 'permission denied');
-- An admin changes the time (the Worker then purges).
update public.settings set whatsapp_retention_days = 30 where id = 1;
select pg_temp.act_as('julio@test');
do $$ begin
  assert (select count(*) from public.whatsapp_messages) = 0, 'employees see none';
end $$;

-- 4. The purge deletes what's older than the chosen time, and returns their files ------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$
declare v_paths text[];
begin
  select array_agg(p order by p nulls last) into v_paths from public.purge_whatsapp_messages() p;
  assert array_length(v_paths, 1) = 2, 'two older than 30 days';
  assert v_paths[1] = '2026-08-01/34611222333/2.jpg' and v_paths[2] is null, 'their files, null when none';
  assert (select array_agg(wa_message_id) from public.whatsapp_messages) = '{wamid.new}', 'the newest stays';
end $$;
update public.settings set whatsapp_retention_days = 90 where id = 1;
delete from public.whatsapp_messages;
