-- Campaigns: one message (an email, a text or a WhatsApp) to the customers and leads who said yes to
-- marketing, picked by type, tag and where they came from (audience). Planned for a day, admins hear
-- in the bell when it's time to send it (campaign_reminders(), nightly); marked sent, it keeps how
-- many it went to. Sending straight from the app comes with an email marketing service (Brevo or
-- Mailchimp). Who: admins.

create table public.campaigns (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 120),
  channel       text not null default 'email' check (channel in ('email', 'sms', 'whatsapp')),
  -- Emails only.
  subject       text check (char_length(subject) <= 200),
  body          text not null default '' check (char_length(body) <= 10000),
  -- {kinds: [customer|lead], tags: [...], sources: [...]}; an empty list means anyone.
  audience      jsonb not null default '{"kinds": [], "tags": [], "sources": []}'::jsonb check (jsonb_typeof(audience) = 'object'),
  status        text not null default 'draft' check (status in ('draft', 'scheduled', 'sent')),
  scheduled_at  timestamptz,
  sent_at       timestamptz,
  recipients    int check (recipients >= 0),
  notes         text check (char_length(notes) <= 2000),
  -- The planned day admins were last reminded of.
  reminded_for  timestamptz,
  created_by    uuid references auth.users on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint campaigns_planned check (status <> 'scheduled' or scheduled_at is not null)
);

create or replace function public.campaign_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.subject := case when new.channel = 'email' then nullif(btrim(new.subject), '') end;
  new.notes := nullif(btrim(new.notes), '');
  if new.status = 'sent' then
    new.sent_at := coalesce(new.sent_at, now());
  else
    new.sent_at := null; new.recipients := null;
  end if;
  if tg_op = 'UPDATE' and new.scheduled_at is distinct from old.scheduled_at then new.reminded_for := null; end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; new.created_by := old.created_by; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger campaigns_rules before insert or update on public.campaigns for each row execute function public.campaign_rules();
create trigger audit_campaigns after insert or update or delete on public.campaigns for each row execute function public.audit_row();

alter table public.campaigns enable row level security;
revoke all on public.campaigns from anon;
create policy campaigns_admin on public.campaigns for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Every night (the Worker): planned campaigns whose day has come, once each, in every active admin's
-- bell. Returns how many campaigns were reminded about.
create or replace function public.campaign_reminders() returns int
language plpgsql security definer set search_path = ''
as $$
declare v record; n int := 0;
begin
  for v in
    select * from public.campaigns
     where status = 'scheduled' and (scheduled_at at time zone public.business_tz())::date <= (now() at time zone public.business_tz())::date
       and reminded_for is distinct from scheduled_at
  loop
    insert into public.notifications (profile_id, title, body, link)
    select p.id, 'Time to send: ' || v.name, coalesce(v.subject, left(v.body, 120)), '/campaigns'
      from public.profiles p where p.role = 'admin' and p.active;
    update public.campaigns set reminded_for = v.scheduled_at where id = v.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.campaign_reminders() from public, anon, authenticated;
