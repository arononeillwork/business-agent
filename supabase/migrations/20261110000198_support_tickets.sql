-- Support tickets. Someone in a business tells The Business Agent about a problem, a question or an idea
-- from Help (src/components/HelpDialog.tsx: Report a problem), or from the "Something went wrong" screen
-- (src/app/ErrorBoundary.tsx: Tell us what you were doing, linked to that error's row in app_errors by its
-- fingerprint). The page they were on, the app's version and their browser come with it. They follow it
-- under Help → Your requests; HQ's admins answer on the Businesses page, under Support
-- (src/components/HqSupport.tsx). Nothing makes a ticket by itself: errors stay grouped under Errors.
--
-- Limits (create_support_ticket(); shared/supportTickets.ts says the same for the app and the demo): five a
-- person in 24 hours, at least 10 characters (at most 2,000), and the same text from the same person within
-- 24 hours is the ticket they already sent, not a second one.
--
-- Telling HQ without filling an inbox: no email. "Something isn't working" notifies HQ's admins (a
-- notification, pushed to their phones: notify_hq()) at most once every 15 minutes, saying how many came in
-- since the last time (alert_support_tickets(): straight away when none went in the last 15 minutes, else by
-- the Worker's minute job once they have). Questions and ideas only wait in the list. The person who sent one
-- gets a notification when HQ replies, or closes it.
--
-- The Business Agent's own, like the error log (the app_errors migration): HQ's admins read every business's,
-- so no business_scope (zzzz_several_businesses.test.sql lists it with app_errors). Only the functions here
-- write it. The person who sent one reads their own; HQ's active admins read them all; nobody else, not even
-- their business's admins. For that reason they stay out of an owner's export: it has rows about each person
-- (their profile, hours, the app's notifications to them), but not what they wrote to The Business Agent. They
-- go with their business (on delete cascade, and step 1 of deleting a closed business takes every row with
-- its business_id) and with their person.

create table public.support_tickets (
  id                bigint generated always as identity primary key,
  business_id       int not null references public.business (id) on delete cascade,
  user_id           uuid not null references public.profiles (id) on delete cascade,
  kind              text not null check (kind in ('not_working', 'question', 'idea')),
  message           text not null check (char_length(message) between 10 and 2000),
  -- Where they were (a path only, as the app keeps it: no query string, secret links as :token), the app's
  -- build and the browser.
  page              text check (char_length(page) between 1 and 200),
  app_version       text check (char_length(app_version) between 1 and 64),
  browser           text check (char_length(browser) between 1 and 300),
  -- Sent from the error screen: the error's row in app_errors (which may have gone since: kinds unseen for
  -- 90 days are cleared).
  error_fingerprint text check (error_fingerprint ~ '^[0-9a-f]{32}$'),
  -- open, being looked at (looking), answered, closed.
  status            text not null default 'open' check (status in ('open', 'looking', 'answered', 'closed')),
  reply             text check (char_length(reply) between 1 and 4000),
  replied_at        timestamptz,
  replied_by        uuid references public.profiles (id) on delete set null,
  -- "Something isn't working" not told to HQ yet; when it was.
  alert_due         boolean not null default false,
  alerted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index support_tickets_business_idx on public.support_tickets (business_id);
create index support_tickets_user_idx on public.support_tickets (user_id, created_at desc);
create index support_tickets_replied_by_idx on public.support_tickets (replied_by);
create index support_tickets_created_idx on public.support_tickets (created_at desc);
create index support_tickets_due_idx on public.support_tickets (created_at) where alert_due;
create index support_tickets_alerted_idx on public.support_tickets (alerted_at) where alerted_at is not null;

alter table public.support_tickets enable row level security;
revoke all on public.support_tickets from public, anon, authenticated;
-- Read signed in as themselves: their own (Help → Your requests), or all of them for HQ's active admins.
grant select on public.support_tickets to authenticated;
create policy own_read on public.support_tickets for select to authenticated using (user_id = (select auth.uid()));
create policy hq_admins_read on public.support_tickets for select to authenticated using ((select public.is_hq_admin()));
-- The functions below write it (they run as app_definer).
grant select, insert, update, delete on public.support_tickets to app_definer;
create policy definer_all on public.support_tickets for all to app_definer using (true) with check (true);
grant all on public.support_tickets to service_role;

-- ---------------------------------------------------------------------------
-- 1. Telling HQ's admins about problem reports: one notification every 15 minutes at most
-- ---------------------------------------------------------------------------
-- The "Something isn't working" reports not told about yet, in one notification ("3 new problem reports",
-- with the latest one's words), unless one went in the last 15 minutes. Returns how many it told about.
-- Called when one comes in, and every minute by the Worker for any held back. shared/pushText.ts says it in
-- each admin's language.
create or replace function public.alert_support_tickets()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_n int;
  v_latest text;
begin
  -- One at a time, so two reports at once can't both send one.
  perform pg_advisory_xact_lock(hashtext('support_tickets alerts'));
  if exists (select 1 from public.support_tickets where alerted_at > now() - interval '15 minutes') then
    return 0;
  end if;
  select count(*)::int into v_n from public.support_tickets where alert_due;
  if v_n = 0 then
    return 0;
  end if;
  select regexp_replace(btrim(message), '\s+', ' ', 'g') into v_latest
    from public.support_tickets where alert_due order by created_at desc, id desc limit 1;
  v_latest := case when char_length(v_latest) > 100 then left(v_latest, 99) || '…' else v_latest end;
  update public.support_tickets set alert_due = false, alerted_at = now() where alert_due;
  perform public.notify_hq(
    case when v_n = 1 then '1 new problem report' else format('%s new problem reports', v_n) end,
    format('Latest: “%s”. On Businesses, under Support.', v_latest),
    '/hq/businesses#support');
  return v_n;
end $$;
alter function public.alert_support_tickets() owner to app_definer;
revoke execute on function public.alert_support_tickets() from public, anon, authenticated;
grant execute on function public.alert_support_tickets() to service_role;

-- ---------------------------------------------------------------------------
-- 2. Sending one (Help, or the error screen), signed in as themselves
-- ---------------------------------------------------------------------------
-- Returns {"id": …, "duplicate": false}, or the one they already sent with the same text in the last 24
-- hours ({"duplicate": true}).
create or replace function public.create_support_ticket(
  p_kind text, p_message text, p_page text default null, p_version text default null, p_browser text default null,
  p_error text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_business int := public.current_business_id();
  v_message text := btrim(coalesce(p_message, ''));
  v_page text := left(nullif(btrim(coalesce(p_page, '')), ''), 200);
  v_id bigint;
begin
  if v_me is null or v_business is null
     or not exists (select 1 from public.profiles where id = v_me and business_id = v_business and active) then
    raise exception 'Sign in to send us a request';
  end if;
  if p_kind is null or p_kind not in ('not_working', 'question', 'idea') then
    raise exception 'Say whether something isn''t working, or it''s a question or an idea';
  end if;
  if char_length(v_message) < 10 then
    raise exception 'Say a little more: at least 10 characters';
  end if;
  if char_length(v_message) > 2000 then
    raise exception 'Keep it to 2,000 characters';
  end if;
  if p_error is not null and p_error !~ '^[0-9a-f]{32}$' then
    raise exception 'Not an error''s fingerprint';
  end if;

  -- One at a time for each person, so two sent at once count as two (or as the same one).
  perform pg_advisory_xact_lock(hashtext('support_tickets ' || v_me::text));
  -- The same words (whatever the spaces and capitals) in the last 24 hours: that one.
  select id into v_id from public.support_tickets
   where user_id = v_me and created_at > now() - interval '24 hours'
     and lower(regexp_replace(btrim(message), '\s+', ' ', 'g')) = lower(regexp_replace(v_message, '\s+', ' ', 'g'))
   order by created_at desc limit 1;
  if v_id is not null then
    return jsonb_build_object('id', v_id, 'duplicate', true);
  end if;
  if (select count(*) from public.support_tickets where user_id = v_me and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'You’ve sent us 5 requests today, the most there can be in a day. Send more tomorrow, or write to us by email.';
  end if;

  insert into public.support_tickets (business_id, user_id, kind, message, page, app_version, browser, error_fingerprint, alert_due)
  values (v_business, v_me, p_kind, v_message, case when v_page like '/%' then v_page end,
          left(nullif(btrim(coalesce(p_version, '')), ''), 64), left(nullif(btrim(coalesce(p_browser, '')), ''), 300),
          case when p_kind = 'not_working' then p_error end, p_kind = 'not_working')
  returning id into v_id;
  if p_kind = 'not_working' then
    perform public.alert_support_tickets();
  end if;
  return jsonb_build_object('id', v_id, 'duplicate', false);
end $$;
alter function public.create_support_ticket(text, text, text, text, text, text) owner to app_definer;
revoke execute on function public.create_support_ticket(text, text, text, text, text, text) from public, anon;
grant execute on function public.create_support_ticket(text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. HQ's admins: the list, and answering
-- ---------------------------------------------------------------------------
-- Every business's tickets with the business's name and who sent it (their name and email), open ones first,
-- then the newest. Reads other businesses' names and people, so it stays with postgres, like hq_closures();
-- anyone but HQ's active admins gets none.
create or replace function public.hq_support_tickets()
returns table (id bigint, business_id int, business_name text, user_id uuid, person text, email text, kind text, message text,
               page text, app_version text, browser text, error_fingerprint text, status text, reply text, replied_at timestamptz,
               replied_by_name text, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.business_id, b.name, s.user_id, p.full_name, p.email, s.kind, s.message, s.page, s.app_version, s.browser,
         s.error_fingerprint, s.status, s.reply, s.replied_at, r.full_name, s.created_at, s.updated_at
    from public.support_tickets s
    join public.business b on b.id = s.business_id
    left join public.profiles p on p.id = s.user_id
    left join public.profiles r on r.id = s.replied_by
   where public.is_hq_admin()
   order by case s.status when 'open' then 0 when 'looking' then 1 when 'answered' then 2 else 3 end, s.created_at desc, s.id desc
   limit 500;
$$;
revoke execute on function public.hq_support_tickets() from public, anon;
grant execute on function public.hq_support_tickets() to authenticated;

-- A ticket's status (open, looking, answered, closed) and HQ's reply (null or blank: the one it has stays).
-- The person who sent it gets a notification for a new reply, or when it's closed; "Being looked at" tells
-- nobody. Marked answered without any reply is refused. The notification is their business's row, so
-- for that one insert this acts for their business (app.business_id), then puts back what was set.
create or replace function public.hq_answer_support_ticket(p_id bigint, p_status text, p_reply text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.support_tickets;
  v_reply text := nullif(btrim(coalesce(p_reply, '')), '');
  v_new_reply boolean;
  v_set text;
  v_said text;
begin
  if not public.is_hq_admin() then
    raise exception 'Only The Business Agent HQ''s admins can do that';
  end if;
  if p_status is null or p_status not in ('open', 'looking', 'answered', 'closed') then
    raise exception 'Status must be open, looking, answered or closed';
  end if;
  if char_length(v_reply) > 4000 then
    raise exception 'Keep the reply to 4,000 characters';
  end if;
  select * into v from public.support_tickets where id = p_id for update;
  if v.id is null then
    raise exception 'No such request';
  end if;
  if p_status = 'answered' and coalesce(v_reply, v.reply) is null then
    raise exception 'Write a reply before marking it answered';
  end if;
  v_new_reply := v_reply is not null and v_reply is distinct from v.reply;
  update public.support_tickets set
    status = p_status,
    reply = coalesce(v_reply, reply),
    replied_at = case when v_new_reply then now() else replied_at end,
    replied_by = case when v_new_reply then auth.uid() else replied_by end,
    updated_at = now()
   where id = p_id;

  if v_new_reply or (p_status = 'closed' and v.status <> 'closed') then
    v_said := regexp_replace(case when v_new_reply then v_reply else v.message end, '\s+', ' ', 'g');
    v_said := case when char_length(v_said) > 140 then left(v_said, 139) || '…' else v_said end;
    v_set := current_setting('app.business_id', true);
    perform set_config('app.business_id', v.business_id::text, true);
    -- shared/pushText.ts says these in the person's language (the reply stays as HQ wrote it).
    insert into public.notifications (business_id, profile_id, title, body, link)
    values (v.business_id, v.user_id,
            case when v_new_reply then 'The Business Agent answered your request' else 'Your request is closed' end,
            case when v_new_reply then v_said else format('You wrote: “%s”', v_said) end,
            '/?help=requests');
    perform set_config('app.business_id', coalesce(v_set, ''), true);
  end if;
end $$;
alter function public.hq_answer_support_ticket(bigint, text, text) owner to app_definer;
revoke execute on function public.hq_answer_support_ticket(bigint, text, text) from public, anon;
grant execute on function public.hq_answer_support_ticket(bigint, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. An owner's export (the close_account migration): as it was, without the tickets
-- ---------------------------------------------------------------------------
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
                           'app_errors', 'support_tickets')
   order by c.relname = 'business' desc, c.relname;
$$;
revoke execute on function public.export_tables() from public, anon, authenticated;
grant execute on function public.export_tables() to service_role, app_definer;
