-- Leads & enquiries: what someone asked for (cakes for a baby shower, the terrace for a birthday,
-- coffee for an office), where it came in, how far it's got and when to follow it up. Each belongs to
-- a person on the Customers page; one won makes them a customer. A quote made for one moves it on
-- (migration 67). Admins hear in the bell on the day to follow one up (enquiry_follow_ups(), nightly).
-- Who: admins.

create table public.enquiries (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.customers on delete cascade,
  -- What they asked for, in a line.
  title         text not null check (char_length(title) between 1 and 160),
  channel       text not null default 'other'
                check (channel in ('whatsapp', 'instagram', 'email', 'phone', 'website', 'walk_in', 'other')),
  stage         text not null default 'new' check (stage in ('new', 'contacted', 'quoted', 'won', 'lost')),
  -- What it could be worth, IVA included (a guess until there's a quote).
  value         numeric(10, 2) check (value >= 0),
  -- The day it's for (the party, the first delivery).
  wanted_on     date check (wanted_on between '2000-01-01' and '2101-01-01'),
  follow_up_on  date check (follow_up_on between '2000-01-01' and '2101-01-01'),
  assigned_to   uuid references public.profiles on delete set null,
  lost_reason   text check (char_length(lost_reason) <= 300),
  notes         text check (char_length(notes) <= 2000),
  received_at   timestamptz not null default now(),
  -- When it was won or lost (set here).
  closed_at     timestamptz,
  -- The follow-up day admins were last reminded of (once per day set).
  reminded_for  date,
  created_by    uuid references auth.users on delete set null default auth.uid(),
  updated_at    timestamptz not null default now()
);
create index enquiries_customer_idx on public.enquiries (customer_id);
create index enquiries_follow_up_idx on public.enquiries (follow_up_on) where stage in ('new', 'contacted', 'quoted');

create or replace function public.enquiry_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  new.lost_reason := nullif(btrim(new.lost_reason), '');
  new.notes := nullif(btrim(new.notes), '');
  -- Won or lost: when it closed (kept while it stays so); open again: not closed, no reason.
  if new.stage in ('won', 'lost') then
    new.closed_at := case when tg_op = 'UPDATE' and old.stage = new.stage then old.closed_at else now() end;
  else
    new.closed_at := null;
  end if;
  if new.stage <> 'lost' then new.lost_reason := null; end if;
  -- A new follow-up day: remind again on it.
  if tg_op = 'UPDATE' and new.follow_up_on is distinct from old.follow_up_on then new.reminded_for := null; end if;
  if tg_op = 'UPDATE' then new.created_by := old.created_by; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger enquiries_rules before insert or update on public.enquiries for each row execute function public.enquiry_rules();
create trigger audit_enquiries after insert or update or delete on public.enquiries for each row execute function public.audit_row();

-- Won: the person is a customer now (Customers page).
create or replace function public.enquiry_won() returns trigger
language plpgsql set search_path = ''
as $$
begin
  update public.customers set kind = 'customer' where id = new.customer_id and kind = 'lead';
  return null;
end $$;
create trigger enquiries_won after insert or update of stage on public.enquiries
  for each row when (new.stage = 'won') execute function public.enquiry_won();

alter table public.enquiries enable row level security;
revoke all on public.enquiries from anon;
create policy enquiries_admin on public.enquiries for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Every night (the Worker): the open enquiries whose follow-up day has come, once per day set, in the
-- bell of the admin it's assigned to (every active admin when it's nobody's, or theirs has left).
-- Returns how many enquiries were reminded about.
create or replace function public.enquiry_follow_ups() returns int
language plpgsql security definer set search_path = ''
as $$
declare v record; n int := 0;
begin
  for v in
    select e.*, coalesce(nullif(concat_ws(' ', c.first_name, c.last_name), ''), c.company, c.email, c.phone) as who
      from public.enquiries e join public.customers c on c.id = e.customer_id
     where e.stage in ('new', 'contacted', 'quoted') and e.follow_up_on <= current_date
       and e.reminded_for is distinct from e.follow_up_on
  loop
    insert into public.notifications (profile_id, title, body, link)
    select p.id, 'Follow up: ' || v.title, v.who, '/leads'
      from public.profiles p
     where p.role = 'admin' and p.active
       and (p.id = v.assigned_to or not exists (select 1 from public.profiles a where a.id = v.assigned_to and a.role = 'admin' and a.active));
    update public.enquiries set reminded_for = v.follow_up_on where id = v.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.enquiry_follow_ups() from public, anon, authenticated;
