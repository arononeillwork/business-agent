-- Newsletter sign-ups from the business's own website (Website & SEO → Newsletter sign-ups). Anyone
-- who signs up on the website is on Customers straight away: a lead from the website (or the
-- customer they already were), with a yes to marketing and the topics they ticked as tags
-- ("Learning English"), so Campaigns can send to just them. shared/newsletter.ts has the same rules.
--
-- Each business sets up its own: the topics its form offers (its own list, worded in Spanish and
-- English), whether it asks for a name or a phone, and a key for its website's server. The
-- Worker takes sign-ups at /api/site/<business>/signup (worker/newsletter.ts, docs/WEBSITE.md):
-- from the form the app hosts (a link, or the snippet pasted into any website), from a website's
-- own form, and lists brought in. Off, the address answers "not found", like the menu's.
--
-- Spain/GDPR: signing up is the yes to marketing. Every sign-up and unsubscribe is kept
-- (newsletter_events: which form, when, the topics, the language) as the record of that yes, and
-- goes when the person is deleted from Customers.

create table public.newsletter (
  id           int not null default 1 check (id = 1),
  enabled      boolean not null default false,
  -- The topics people tick: [{"key": "english", "label": "Learning English", "labels": {"es": "Aprender inglés"}}].
  -- key: what a website sends (stays put); label: the tag on Customers; labels: the form's wording in a language.
  interests    jsonb not null default '[]'::jsonb check (jsonb_typeof(interests) = 'array' and jsonb_array_length(interests) <= 12),
  ask_name     boolean not null default true,
  ask_phone    boolean not null default false,
  -- The form's own words; none: the app's ("Join our newsletter").
  heading      text check (char_length(heading) <= 80),
  intro        text check (char_length(intro) <= 300),
  -- The key the website's server sends sign-ups with: only its SHA-256 is kept, and its last 4 characters to recognise it.
  key_hash     text check (key_hash ~ '^[0-9a-f]{64}$'),
  key_hint     text check (char_length(key_hint) <= 8),
  key_made_at  timestamptz,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users on delete set null default auth.uid(),
  constraint newsletter_key check ((key_hash is null) = (key_made_at is null))
);
select public.add_business_scope('public.newsletter');
alter table public.newsletter add primary key (business_id);

-- Tidy the topics (spaces, blank wording) and check them: a key each, said once; a label each, said once (it's a tag).
create or replace function public.newsletter_rules() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_in    jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_key   text;
  v_label text;
  v_words jsonb;
  v_keys  text[] := '{}';
  v_tags  text[] := '{}';
begin
  for v_in in select x from jsonb_array_elements(new.interests) x loop
    if jsonb_typeof(v_in) <> 'object' then raise exception 'Each topic needs a name' using errcode = '22023'; end if;
    v_key := lower(btrim(coalesce(v_in->>'key', '')));
    v_label := btrim(coalesce(v_in->>'label', ''));
    if v_key !~ '^[a-z0-9][a-z0-9_-]{0,39}$' then raise exception 'A topic’s key is letters, numbers, - and _' using errcode = '22023'; end if;
    if char_length(v_label) not between 1 and 40 then raise exception 'Each topic needs a name of up to 40 characters' using errcode = '22023'; end if;
    if v_key = any(v_keys) then raise exception 'Two topics have the key %', v_key using errcode = '22023'; end if;
    if lower(v_label) = any(v_tags) then raise exception 'Two topics are called %', v_label using errcode = '22023'; end if;
    v_keys := v_keys || v_key;
    v_tags := v_tags || lower(v_label);
    -- The wording in each language, when given (Spanish and English).
    select coalesce(jsonb_object_agg(l, btrim(v_in->'labels'->>l)), '{}'::jsonb) into v_words
      from unnest(array['en', 'es']) l
     where jsonb_typeof(v_in->'labels') = 'object' and btrim(coalesce(v_in->'labels'->>l, '')) <> '';
    if exists (select 1 from jsonb_each_text(v_words) w where char_length(w.value) > 60) then
      raise exception 'A topic’s wording is up to 60 characters' using errcode = '22023';
    end if;
    v_out := v_out || jsonb_build_object('key', v_key, 'label', v_label, 'labels', v_words);
  end loop;
  new.interests := v_out;
  new.heading := nullif(btrim(new.heading), '');
  new.intro := nullif(btrim(new.intro), '');
  new.key_hint := case when new.key_hash is null then null else new.key_hint end;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
revoke execute on function public.newsletter_rules() from public, anon, authenticated;
create trigger newsletter_rules before insert or update on public.newsletter for each row execute function public.newsletter_rules();
create trigger audit_newsletter after insert or update or delete on public.newsletter for each row execute function public.audit_row();

alter table public.newsletter enable row level security;
revoke all on public.newsletter from anon;
create policy newsletter_admin on public.newsletter for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Every sign-up and unsubscribe: the record of each person's yes (and of taking it back).
create table public.newsletter_events (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers (id) on delete cascade,
  action       text not null check (action in ('signup', 'unsubscribe')),
  -- As given then (the person's email on Customers may change later).
  email        text not null check (char_length(email) <= 254),
  -- The topics' keys, as ticked.
  interests    text[] not null default '{}' check (cardinality(interests) <= 12),
  lang         text check (lang ~ '^[a-z]{2}$'),
  -- Where on the website ("footer", "first_visit_popup"), as the website says.
  place        text check (char_length(place) <= 60),
  -- form: the form the app hosts (its link, or pasted into a website); website: the website's own form;
  -- import: a list brought in.
  via          text not null check (via in ('form', 'website', 'import')),
  -- Who sent it, for the limit on sign-ups from one place (an HMAC of the address, never the address itself).
  ip_hash      text check (ip_hash ~ '^[0-9a-f]{64}$'),
  -- When they signed up (a list brought in says when; otherwise now).
  at           timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
select public.add_business_scope('public.newsletter_events');
create index newsletter_events_customer_idx on public.newsletter_events (customer_id);
create index newsletter_events_at_idx on public.newsletter_events (business_id, at desc);
create index newsletter_events_ip_idx on public.newsletter_events (business_id, ip_hash, created_at) where ip_hash is not null;

alter table public.newsletter_events enable row level security;
revoke all on public.newsletter_events from anon, authenticated;
grant select on public.newsletter_events to authenticated;
create policy newsletter_events_read on public.newsletter_events for select to authenticated using ((select public.is_admin()));

-- Someone signs up: on Customers once (found by email), with a yes to marketing and the topics as tags.
-- Someone already there keeps who they are (a customer stays one, where they came from stays) and
-- gains the topics; a name or phone fills only what's empty. Unsubscribed before, signing up again is
-- a new yes. The Worker calls it for one business (x-business-id); it skips row security, so every
-- query here names the business.
create or replace function public.newsletter_signup(
  p_email      text,
  p_first_name text default null,
  p_last_name  text default null,
  p_phone      text default null,
  p_interests  text[] default '{}',
  p_tags       text[] default '{}',
  p_lang       text default null,
  p_place      text default null,
  p_via        text default 'form',
  p_ip_hash    text default null,
  p_at         timestamptz default null
) returns uuid
language plpgsql set search_path = ''
as $$
declare
  v_business int := public.current_business_id();
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_phone    text := case when btrim(p_phone) ~ '^\+[0-9][0-9 ]{4,24}$' then btrim(p_phone) end;
  v_first    text := left(nullif(btrim(p_first_name), ''), 100);
  v_last     text := left(nullif(btrim(p_last_name), ''), 100);
  v_tags     text[] := coalesce(array(select distinct left(btrim(t), 40) from unnest(p_tags) t where btrim(t) <> ''), '{}');
  v_id       uuid;
begin
  if v_business is null then raise exception 'No business to sign up to' using errcode = '42501'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(v_email) > 254 then
    raise exception 'Enter a valid email' using errcode = '22023';
  end if;
  -- One at a time for an address, so two quick submits make one person.
  perform pg_advisory_xact_lock(hashtextextended('newsletter:' || v_business || ':' || v_email, 0));
  select id into v_id from public.customers
   where business_id = v_business and lower(email) = v_email
   order by created_at limit 1;
  if v_id is null then
    insert into public.customers (business_id, kind, source, first_name, last_name, email, phone, tags, marketing_consent)
    values (v_business, 'lead', 'website', v_first, v_last, v_email, v_phone, v_tags[1:20], true)
    returning id into v_id;
  else
    update public.customers c set
      tags = (c.tags || array(select t from unnest(v_tags) t where not t = any(c.tags)))[1:20],
      marketing_consent = true,
      first_name = coalesce(c.first_name, v_first),
      last_name = coalesce(c.last_name, case when c.first_name is null then v_last end),
      phone = coalesce(c.phone, v_phone)
    where c.id = v_id and c.business_id = v_business;
  end if;
  insert into public.newsletter_events (business_id, customer_id, action, email, interests, lang, place, via, ip_hash, at)
  values (v_business, v_id, 'signup', v_email,
          coalesce(array(select distinct x from unnest(p_interests) x where x is not null limit 12), '{}'),
          case when p_lang ~ '^[a-z]{2}$' then p_lang end, left(nullif(btrim(p_place), ''), 60),
          p_via, p_ip_hash, least(coalesce(p_at, now()), now()));
  return v_id;
end $$;
revoke execute on function public.newsletter_signup(text, text, text, text, text[], text[], text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.newsletter_signup(text, text, text, text, text[], text[], text, text, text, text, timestamptz) to service_role;

-- Someone unsubscribes on the website: no more marketing (they stay on Customers, and the record of
-- it is kept). False when they aren't on Customers.
create or replace function public.newsletter_unsubscribe(p_email text, p_via text default 'website') returns boolean
language plpgsql set search_path = ''
as $$
declare
  v_business int := public.current_business_id();
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_found    boolean := false;
  r          record;
begin
  if v_business is null then raise exception 'No business to unsubscribe from' using errcode = '42501'; end if;
  for r in select id from public.customers where business_id = v_business and lower(email) = v_email loop
    update public.customers set marketing_consent = false where id = r.id and business_id = v_business;
    insert into public.newsletter_events (business_id, customer_id, action, email, via)
    values (v_business, r.id, 'unsubscribe', v_email, p_via);
    v_found := true;
  end loop;
  return v_found;
end $$;
revoke execute on function public.newsletter_unsubscribe(text, text) from public, anon, authenticated;
grant execute on function public.newsletter_unsubscribe(text, text) to service_role;

-- Easy Beans' website (easybeanscoffee.com) asks for these topics; its server sends its sign-ups here.
insert into public.newsletter (business_id, enabled, interests, ask_name, ask_phone)
select id, true, '[
  {"key": "coffee",  "label": "Coffee tips",      "labels": {"en": "Coffee tips",      "es": "Trucos de café"}},
  {"key": "spanish", "label": "Learning Spanish", "labels": {"en": "Learning Spanish", "es": "Aprender español"}},
  {"key": "english", "label": "Learning English", "labels": {"en": "Learning English", "es": "Aprender inglés"}},
  {"key": "menu",    "label": "Menu updates",     "labels": {"en": "Menu updates",     "es": "Novedades"}},
  {"key": "events",  "label": "Events",           "labels": {"en": "Events",           "es": "Eventos"}},
  {"key": "offers",  "label": "Offers",           "labels": {"en": "Offers",           "es": "Ofertas"}}
]'::jsonb, false, true
from public.business where id = 1;
