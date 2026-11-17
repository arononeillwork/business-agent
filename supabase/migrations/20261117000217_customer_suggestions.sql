-- Customer suggestions (Sales section): the ideas customers give the business, kept for the team (never
-- shown to customers), mostly added through the business's AI assistant. Ideas that say the same thing are
-- dragged into one section; a section's counter is how many ideas are in it (shared/suggestions.ts).
-- Who: the team (admins and employees) reads, adds and sorts them, and names and removes sections (an idea
-- in a removed section goes back to "not sorted yet"); only admins delete an idea. Partners and the café
-- tablet see none.

create table public.suggestion_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users on delete set null default auth.uid()
);
select public.add_business_scope('public.suggestion_groups');
create index suggestion_groups_updated_by_idx on public.suggestion_groups (updated_by);

create table public.customer_suggestions (
  id          uuid primary key default gen_random_uuid(),
  text        text not null check (char_length(text) between 1 and 1000),
  -- Who suggested it, when known: "Lucía, a regular".
  customer    text check (char_length(customer) between 1 and 120),
  -- Where it was heard: "At the counter", "Google review".
  source      text check (char_length(source) between 1 and 80),
  heard_on    date not null default current_date,
  -- The section it's sorted into; none while it's not sorted yet.
  group_id    uuid references public.suggestion_groups on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users on delete set null default auth.uid()
);
select public.add_business_scope('public.customer_suggestions');
create index customer_suggestions_group_id_idx on public.customer_suggestions (group_id);
create index customer_suggestions_updated_by_idx on public.customer_suggestions (updated_by);

-- Tidy what's typed (spaces, a blank is none) and stamp who changed it. With the caller's rights, filtered
-- by the row's business for the Worker.
create or replace function public.suggestion_group_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  if new.name = '' then
    raise exception 'Give the section a name' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
create trigger suggestion_groups_rules before insert or update on public.suggestion_groups for each row execute function public.suggestion_group_rules();
create trigger audit_suggestion_groups after insert or update or delete on public.suggestion_groups for each row execute function public.audit_row();

-- The same tidying for an idea; its section is one of the same business's.
create or replace function public.customer_suggestion_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.text := btrim(regexp_replace(new.text, '\s+', ' ', 'g'));
  new.customer := nullif(btrim(regexp_replace(new.customer, '\s+', ' ', 'g')), '');
  new.source := nullif(btrim(regexp_replace(new.source, '\s+', ' ', 'g')), '');
  if new.text = '' then
    raise exception 'Write the idea' using errcode = '22023';
  end if;
  if new.group_id is not null and not exists (select 1 from public.suggestion_groups g
       where g.id = new.group_id and g.business_id = new.business_id) then
    raise exception 'That section isn''t here any more' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
create trigger customer_suggestions_rules before insert or update on public.customer_suggestions for each row execute function public.customer_suggestion_rules();
create trigger audit_customer_suggestions after insert or update or delete on public.customer_suggestions for each row execute function public.audit_row();

alter table public.suggestion_groups enable row level security;
revoke all on public.suggestion_groups from anon;
create policy suggestion_groups_team on public.suggestion_groups for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

alter table public.customer_suggestions enable row level security;
revoke all on public.customer_suggestions from anon;
create policy customer_suggestions_read on public.customer_suggestions for select to authenticated using ((select public.is_staff()));
create policy customer_suggestions_add on public.customer_suggestions for insert to authenticated with check ((select public.is_staff()));
create policy customer_suggestions_sort on public.customer_suggestions for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy customer_suggestions_delete on public.customer_suggestions for delete to authenticated using ((select public.is_admin()));
