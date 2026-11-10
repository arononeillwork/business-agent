-- Error alerts without a third-party service. What goes wrong in the app (its error screen, and errors the
-- browser sees: src/app/errorReports.ts), in the Worker (app.onError) and in the scheduled jobs is kept here,
-- one row per kind of error. The Worker groups them (shared/appErrors.ts: where it happened, and the message
-- with its numbers, ids and addresses taken out, as a fingerprint) and keeps each through record_app_error(),
-- which also tells The Business Agent HQ's admins (a notification, pushed to their phones by worker/push.ts)
-- about a new one, or one back after a quiet day (24 hours without it): once a day each at most, and five an
-- hour in all. HQ's Businesses page lists them under Errors (src/components/HqErrors.tsx).
--
-- The Business Agent's own, not any one business's, like the plans and prices: no business_scope
-- (zzzz_several_businesses.test.sql lists it with them), and not in an owner's export. Only the Worker's
-- service role writes it, through the functions here; only HQ's active admins read it. An error unseen for
-- 90 days goes (clear_old_app_errors(), nightly).

create table public.app_errors (
  fingerprint  text primary key check (fingerprint ~ '^[0-9a-f]{32}$'),
  -- Where it happened: "app", "worker POST /api/…", "cron: outbox".
  source       text not null check (char_length(source) between 1 and 120),
  -- The last one's own message (the fingerprint has it without what changes).
  message      text not null check (char_length(message) between 1 and 500),
  times        int not null default 1 check (times > 0),
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  last_stack   text check (char_length(last_stack) <= 4000),
  last_path    text check (char_length(last_path) <= 200),
  -- The last one's method and route (the Worker), or kind, build and browser (the app), and the version live.
  last_detail  jsonb not null default '{}'::jsonb check (jsonb_typeof(last_detail) = 'object'),
  -- Whose it was the last time, when someone was signed in.
  business_id  int references public.business (id) on delete set null,
  user_id      uuid references public.profiles (id) on delete set null,
  -- A notification is due (it's new, or back after a quiet day) and not sent yet; when one last was.
  alert_due    boolean not null default true,
  alerted_at   timestamptz
);
create index app_errors_last_seen_idx on public.app_errors (last_seen desc);
create index app_errors_first_seen_idx on public.app_errors (first_seen);
create index app_errors_alerted_idx on public.app_errors (alerted_at) where alerted_at is not null;
create index app_errors_business_idx on public.app_errors (business_id);
create index app_errors_user_idx on public.app_errors (user_id);

alter table public.app_errors enable row level security;
revoke all on public.app_errors from public, anon, authenticated;
-- HQ's active admins read it (the Businesses page), signed in as themselves.
grant select on public.app_errors to authenticated;
create policy hq_admins_read on public.app_errors for select to authenticated using ((select public.is_hq_admin()));
-- The functions below write it (they run as app_definer); the Worker calls them with the service role.
grant select, insert, update, delete on public.app_errors to app_definer;
create policy definer_all on public.app_errors for all to app_definer using (true) with check (true);
grant all on public.app_errors to service_role;

-- One error, from the Worker: counted on its kind's row (made the first time), with the last one's message,
-- stack, path, details and whose it was. True when HQ's admins were told about it: a new kind, or one back
-- after 24 hours without it, at most once a day each and five an hour in all (one held back by those is told
-- about with its next report once it may be). At most 300 new kinds an hour are kept: past that, a new one
-- is let go (an old one still counts).
create or replace function public.record_app_error(
  p_fingerprint text, p_source text, p_message text, p_stack text default null, p_path text default null,
  p_business int default null, p_user uuid default null, p_detail jsonb default '{}'::jsonb)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v public.app_errors;
  v_source text := left(btrim(coalesce(p_source, '')), 120);
  v_message text := left(btrim(coalesce(p_message, '')), 500);
  v_business int := p_business;
  v_user uuid := p_user;
  v_said text;
begin
  if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{32}$' then
    raise exception 'Not an error''s fingerprint';
  end if;
  if v_source = '' or v_message = '' then
    raise exception 'An error needs where it happened and its message';
  end if;
  if not exists (select 1 from public.app_errors where fingerprint = p_fingerprint)
     and (select count(*) from public.app_errors where first_seen > now() - interval '1 hour') >= 300 then
    return false;
  end if;

  -- Whose it was, as the Worker says (a business or person that has gone since: nobody's).
  for i in 1..2 loop
    begin
      insert into public.app_errors as e (fingerprint, source, message, last_stack, last_path, last_detail, business_id, user_id)
      values (p_fingerprint, v_source, v_message, left(nullif(btrim(p_stack), ''), 4000), left(nullif(btrim(p_path), ''), 200),
              case when jsonb_typeof(p_detail) = 'object' then p_detail else '{}'::jsonb end, v_business, v_user)
      on conflict (fingerprint) do update set
        times = e.times + 1,
        source = excluded.source,
        message = excluded.message,
        last_seen = now(),
        last_stack = excluded.last_stack,
        last_path = excluded.last_path,
        last_detail = excluded.last_detail,
        business_id = excluded.business_id,
        user_id = excluded.user_id,
        -- Back after a quiet day: due a notification again.
        alert_due = e.alert_due or e.last_seen <= now() - interval '24 hours'
      returning * into v;
      exit;
    exception when foreign_key_violation then
      v_business := null;
      v_user := null;
    end;
  end loop;

  if not v.alert_due or v.alerted_at > now() - interval '1 day' then
    return false;
  end if;
  -- One at a time from here, so two at once can't both take the hour's last notification.
  perform pg_advisory_xact_lock(hashtext('app_errors alerts'));
  if (select count(*) from public.app_errors where alerted_at > now() - interval '1 hour') >= 5 then
    return false;
  end if;
  update public.app_errors set alert_due = false, alerted_at = now() where fingerprint = p_fingerprint;
  v_said := regexp_replace(v.message, '\s+', ' ', 'g');
  v_said := case when char_length(v_said) > 100 then left(v_said, 99) || '…' else v_said end;
  -- shared/pushText.ts says these in each admin's language.
  perform public.notify_hq(
    case when v.times = 1 then 'New error: ' else 'An error is back: ' end || v_said,
    format('In %s. The details are on Businesses, under Errors.', v.source));
  return true;
end $$;
alter function public.record_app_error(text, text, text, text, text, int, uuid, jsonb) owner to app_definer;
revoke execute on function public.record_app_error(text, text, text, text, text, int, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_app_error(text, text, text, text, text, int, uuid, jsonb) to service_role;

-- Nightly (worker/index.ts): the kinds of error nobody has seen for 90 days. Returns how many went.
create or replace function public.clear_old_app_errors()
returns int
language plpgsql security definer set search_path = ''
as $$
declare v int;
begin
  delete from public.app_errors where last_seen < now() - interval '90 days';
  get diagnostics v = row_count;
  return v;
end $$;
alter function public.clear_old_app_errors() owner to app_definer;
revoke execute on function public.clear_old_app_errors() from public, anon, authenticated;
grant execute on function public.clear_old_app_errors() to service_role;

-- An owner's export (the close_account migration): as it was, without the error log, which is HQ's.
create or replace function public.export_tables()
returns table (name text, columns text[])
language sql stable set search_path = ''
as $$
  select c.relname::text,
         array(select a.attname::text from pg_attribute a
                where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
                  and a.attname <> all (public.export_hidden_columns())
                order by a.attnum)
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and (c.relname = 'business' or exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'business_id' and not a.attisdropped))
     and c.relname not in ('integration_secrets', 'music_accounts', 'push_subscriptions', 'square_pins', 'provider_cache', 'outbox', 'kiosk_attempts',
                           'app_errors')
   order by c.relname = 'business' desc, c.relname;
$$;
revoke execute on function public.export_tables() from public, anon, authenticated;
grant execute on function public.export_tables() to service_role, app_definer;
