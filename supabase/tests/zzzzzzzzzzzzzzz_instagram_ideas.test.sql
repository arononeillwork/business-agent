-- Ideas from the Instagram Ideas chat (the instagram_ideas migration): only the Worker keeps them, once
-- each; the team reads them; an admin takes one off the page, and nothing else about it changes; the
-- Ideas chat is named by a plain Instagram username. People from the tests before it: maria (admin),
-- julio (employee). Nothing made here stays.

begin;

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

create function pg_temp.as_worker() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', 'service_role', false);
  perform set_config('request.headers', json_build_object('x-business-id', (select min(id) from public.business)::text)::text, false);
  set role service_role;
end $$;

create function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_err text;
begin
  begin execute p_sql; exception when others then v_err := sqlerrm; end;
  if v_err is null then raise exception 'Expected error like "%" but statement succeeded: %', p_like, p_sql; end if;
  if v_err not ilike '%' || p_like || '%' then raise exception 'Expected error like "%", got "%"', p_like, v_err; end if;
end $$;

-- The Worker keeps two ideas from the chat; the same message can't be kept twice.
select pg_temp.as_worker();
insert into public.instagram_ideas (message_id, kind, username, media_url, permalink, note, shared_at) values
  ('mid-1', 'reel', 'maria.ideas', 'https://lookaside.fbsbx.test/1.jpg', 'https://www.instagram.com/reel/DfIdea01/', 'For the summer menu', now() - interval '1 hour'),
  ('mid-2', 'post', 'easy.beans.coffee', null, null, null, now());
select pg_temp.expect_error($q$insert into public.instagram_ideas (message_id, kind, username, shared_at) values ('mid-1', 'post', 'x', now())$q$, 'instagram_ideas_message');
select pg_temp.expect_error($q$insert into public.instagram_ideas (message_id, kind, username, shared_at) values ('mid-3', 'story', 'x', now())$q$, 'instagram_ideas_kind_check');

-- The team reads them, and can't add, change or delete one.
select pg_temp.act_as('julio@test');
do $$ begin
  assert (select count(*) from public.instagram_ideas) = 2, 'the team sees the ideas';
  assert (select not hidden and not media_kept and media_tries = 0 from public.instagram_ideas where message_id = 'mid-1'), 'kept as it came';
  update public.instagram_ideas set hidden = true where message_id = 'mid-1';
  assert (select not hidden from public.instagram_ideas where message_id = 'mid-1'), 'an employee can''t take one off the page';
  update public.settings set idea_chat = 'julio.ideas' where id = 1;
  assert (select idea_chat is null from public.settings where id = 1), 'nor name the Ideas chat';
end $$;
select pg_temp.expect_error($q$delete from public.instagram_ideas where message_id = 'mid-1'$q$, 'permission denied');
select pg_temp.expect_error($q$insert into public.instagram_ideas (message_id, kind, username, shared_at) values ('mid-4', 'post', 'x', now())$q$, 'permission denied');

-- An admin takes one off the page, and changes nothing else about it.
select pg_temp.act_as('maria@test');
update public.instagram_ideas set hidden = true where message_id = 'mid-1';
select pg_temp.expect_error($q$update public.instagram_ideas set note = 'changed' where message_id = 'mid-2'$q$, 'permission denied');
select pg_temp.expect_error($q$delete from public.instagram_ideas where message_id = 'mid-2'$q$, 'permission denied');
do $$ begin
  assert (select hidden from public.instagram_ideas where message_id = 'mid-1'), 'taken off the page';
end $$;

-- The Ideas chat: a plain Instagram username, set by an admin.
update public.settings set idea_chat = 'maria.ideas' where id = 1;
select pg_temp.expect_error($q$update public.settings set idea_chat = '@Maria Ideas' where id = 1$q$, 'settings_idea_chat_check');
do $$ begin
  assert (select idea_chat = 'maria.ideas' from public.settings where id = 1), 'an admin names the Ideas chat';
end $$;

reset role;
rollback;
