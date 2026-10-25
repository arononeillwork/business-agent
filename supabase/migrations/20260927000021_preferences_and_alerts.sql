-- 1. Appearance and accessibility, per person (theme, text size, contrast, font, motion).
--    Everyone can read and change their own; the app applies it on every device they use.
alter table public.profiles add column preferences jsonb not null default '{}'::jsonb
  check (jsonb_typeof(preferences) = 'object');
grant select (preferences) on public.profiles to authenticated;
grant update (preferences) on public.profiles to authenticated;

-- 2. In-app notifications (the bell in the app). Each person reads and clears their own.
create table public.notifications (
  id          bigserial primary key,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  title       text not null,
  body        text,
  link        text,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index notifications_profile_idx on public.notifications (profile_id, created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon;
create policy notifications_own on public.notifications for select to authenticated using (profile_id = (select auth.uid()));
create policy notifications_mark on public.notifications for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
revoke insert, update, delete on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- 3. Event alerts: the bell on a calendar event or sports fixture. When it's due, every active
--    admin gets a notification (and a WhatsApp message once WhatsApp is set up and they opted in).
create table public.event_alerts (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('calendar', 'sports')),
  ref_id      text not null,
  title       text not null,
  starts_at   timestamptz not null,
  remind_at   timestamptz not null,
  link        text,
  created_by  uuid references auth.users default auth.uid(),
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  unique (kind, ref_id)
);
create index event_alerts_due_idx on public.event_alerts (remind_at) where sent_at is null;
alter table public.event_alerts enable row level security;
revoke all on public.event_alerts from anon;
create policy event_alerts_read on public.event_alerts for select to authenticated using (public.is_staff());
revoke insert, update, delete on public.event_alerts from authenticated;

-- Admins switch an event's alert on or off. Reminder: the day before at 10:00 (Madrid) for
-- all-day items, 3 hours before for anything with a start time; never in the past.
create or replace function public.set_event_alert(p_kind text, p_ref_id text, p_on boolean)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_title text; v_start timestamptz; v_all_day boolean := false; v_link text; v_remind timestamptz;
  v_tz text := public.business_tz();
begin
  if not public.is_admin() then raise exception 'Only an admin can set event alerts'; end if;
  if not p_on then
    delete from public.event_alerts where kind = p_kind and ref_id = p_ref_id;
    return false;
  end if;
  if p_kind = 'calendar' then
    select e.title, coalesce(e.starts_at, (e.starts_on::timestamp at time zone v_tz)), e.starts_at is null
      into v_title, v_start, v_all_day
      from public.calendar_events e where e.id::text = p_ref_id;
    v_link := '/calendar';
  elsif p_kind = 'sports' then
    select s.title, s.starts_at, s.time_tbc into v_title, v_start, v_all_day from public.sports_events s where s.id = p_ref_id;
    v_link := '/sports';
  else
    raise exception 'Unknown kind of event';
  end if;
  if v_title is null then raise exception 'That event no longer exists'; end if;
  v_remind := case when v_all_day
    then (((v_start at time zone v_tz)::date - 1)::timestamp + time '10:00') at time zone v_tz
    else v_start - interval '3 hours' end;
  v_remind := greatest(v_remind, now());
  insert into public.event_alerts (kind, ref_id, title, starts_at, remind_at, link)
    values (p_kind, p_ref_id, v_title, v_start, v_remind, v_link)
    on conflict (kind, ref_id) do update set title = excluded.title, starts_at = excluded.starts_at,
      remind_at = excluded.remind_at, sent_at = null;
  return true;
end;
$$;
revoke execute on function public.set_event_alert(text, text, boolean) from public, anon;
grant execute on function public.set_event_alert(text, text, boolean) to authenticated;

-- Cron (every minute): deliver due alerts to every active admin.
create or replace function public.deliver_event_alerts()
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  a record; v_count int := 0; v_tz text := public.business_tz();
  v_when text;
begin
  for a in select * from public.event_alerts where sent_at is null and remind_at <= now() order by remind_at limit 50 for update skip locked loop
    v_when := to_char(a.starts_at at time zone v_tz, 'Dy DD Mon, HH24:MI');
    insert into public.notifications (profile_id, title, body, link)
      select p.id, a.title, 'Coming up ' || v_when || '. You asked to be reminded.', a.link
        from public.profiles p where p.role = 'admin' and p.active;
    update public.event_alerts set sent_at = now() where id = a.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.deliver_event_alerts() from public, anon, authenticated;

-- 4. Brand guidelines: the logo, the colours (primary, secondary, accents) and the fonts. The
--    whole team (and partners) can see them; admins change them.
create table public.brand (
  id            int primary key default 1 check (id = 1),
  logo          text check (logo is null or length(logo) < 700000),   -- data: URL (PNG/SVG/JPEG)
  logo_mark     text check (logo_mark is null or length(logo_mark) < 700000),
  colours       jsonb not null default '[]'::jsonb check (jsonb_typeof(colours) = 'array'),
  heading_font  text not null default 'Poppins',
  body_font     text not null default 'Figtree',
  notes         text,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users default auth.uid()
);
alter table public.brand enable row level security;
revoke all on public.brand from anon;
create policy brand_read on public.brand for select to authenticated using (public.is_staff() or public.is_partner());
create policy brand_write on public.brand for update to authenticated using (public.is_admin()) with check (public.is_admin());
revoke insert, delete on public.brand from authenticated;
create trigger audit_brand after update on public.brand for each row execute function public.audit_row();

insert into public.brand (id, colours, heading_font, body_font, notes) values (1, '[
  {"name": "Rose Pink", "hex": "#F79BA4", "role": "primary", "use": "Buttons, highlights, the logo circle"},
  {"name": "Grey Limewash", "hex": "#C6C2BB", "role": "secondary", "use": "Surfaces and panels, used generously"},
  {"name": "Rose Wash", "hex": "#F3DED3", "role": "accent", "use": "Soft panels behind copy"},
  {"name": "Ube Lilac", "hex": "#B7A3D8", "role": "accent", "use": "Ube drinks, seasonal moments"},
  {"name": "Matcha Green", "hex": "#6B8E4E", "role": "accent", "use": "Wellbeing, sourcing, all-good cues"},
  {"name": "Cream", "hex": "#FBF8F4", "role": "base", "use": "Preferred background"}
]'::jsonb, 'Poppins', 'Figtree', 'Rose Pink leads; one accent at a time. Never recolour, stretch or redraw the logo.')
on conflict (id) do nothing;

-- Appearance settings are each person's own: nobody else, admins included, changes them.
create or replace function public.guard_own_preferences()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and new.preferences is distinct from old.preferences and old.id <> auth.uid() then
    raise exception 'Only the person themselves can change their appearance settings';
  end if;
  return new;
end;
$$;
create trigger profiles_own_preferences before update of preferences on public.profiles
  for each row execute function public.guard_own_preferences();
revoke execute on function public.guard_own_preferences() from public, anon, authenticated;
