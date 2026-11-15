-- Newsletter sign-ups on Leads & enquiries. Whoever signs up on the website (the form the app hosts, or
-- the website's own form) now also has an enquiry there, "Newsletter sign-up", from the website, with
-- the topics they ticked kept on it (as worded on the form: "Learning English"). This holds for someone
-- already on Customers too (a customer from Square, say): they stay as they were, and the sign-up shows
-- on Leads & enquiries all the same. Signing up again while that enquiry is still open adds any new
-- topics to it instead of making another. A list brought in (via 'import') makes no enquiries: those
-- are people from before, not people asking now.
--
-- From Leads & enquiries an admin can move a person to Customers (the app makes them a customer and
-- takes the enquiry off the list); their topics stay on Customers as tags, and the sign-up itself stays
-- in newsletter_events.

alter table public.enquiries
  add column interests text[] not null default '{}' check (cardinality(interests) <= 20);

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
  v_enquiry  uuid;
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
  -- On Leads & enquiries: one open "Newsletter sign-up" per person, gaining the topics each time.
  if p_via <> 'import' then
    select id into v_enquiry from public.enquiries
     where business_id = v_business and customer_id = v_id and title = 'Newsletter sign-up' and channel = 'website'
       and stage in ('new', 'contacted', 'quoted')
     order by received_at desc limit 1;
    if v_enquiry is null then
      insert into public.enquiries (business_id, customer_id, title, channel, stage, interests)
      values (v_business, v_id, 'Newsletter sign-up', 'website', 'new', v_tags[1:20]);
    else
      update public.enquiries e set
        interests = (e.interests || array(select t from unnest(v_tags) t where not t = any(e.interests)))[1:20]
      where e.id = v_enquiry and e.business_id = v_business;
    end if;
  end if;
  return v_id;
end $$;
