-- Expenses & mileage: what someone on the team spent for the business, or drove for it in their own
-- car, sent for an admin with pay access to approve and pay back. Mileage is the kilometres (twice
-- there and back) times the rate a kilometre, worked out here; the business's rate is on settings
-- (€0.26, what Spain lets it pay back without tax). The receipt is a tax document (Tax › Expenses).
-- Not the running costs (expenses, Finances). Who: everyone sends their own and changes them while
-- they wait; admins with pay access see and decide all of them; a gestoría with finances access reads.
-- Admins with pay access hear in the bell when one comes in, and the person when it's decided.

alter table public.settings add column mileage_rate numeric(5, 3) not null default 0.26 check (mileage_rate between 0 and 5);

create table public.expense_claims (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null default auth.uid() references public.profiles on delete cascade,
  kind           text not null default 'expense' check (kind in ('expense', 'mileage')),
  spent_on       date not null default current_date check (spent_on between '2000-01-01' and '2101-01-01'),
  description    text not null check (char_length(description) between 1 and 200),
  category       text check (char_length(category) <= 60),
  amount         numeric(10, 2) not null default 0 check (amount between 0 and 100000),
  km             numeric(8, 1) check (km > 0 and km <= 10000),
  rate_per_km    numeric(5, 3) check (rate_per_km between 0 and 5),
  return_trip    boolean not null default false,
  from_place     text check (char_length(from_place) <= 120),
  to_place       text check (char_length(to_place) <= 120),
  status         text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected', 'paid')),
  decided_by     uuid references auth.users on delete set null,
  decided_at     timestamptz,
  decision_note  text check (char_length(decision_note) <= 500),
  paid_on        date,
  document_id    uuid references public.tax_documents on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint expense_claims_mileage check (kind <> 'mileage' or km is not null)
);
create index expense_claims_profile_idx on public.expense_claims (profile_id, spent_on desc);

create or replace function public.claim_rules() returns trigger
language plpgsql set search_path = ''
as $$
declare v_pay boolean := public.can_see_pay();
begin
  new.description := btrim(new.description);
  new.category := nullif(btrim(new.category), '');
  new.from_place := nullif(btrim(new.from_place), '');
  new.to_place := nullif(btrim(new.to_place), '');
  new.decision_note := nullif(btrim(new.decision_note), '');
  if new.kind = 'mileage' then
    if new.km is null then raise exception 'Enter the kilometres'; end if;
    new.rate_per_km := coalesce(new.rate_per_km, (select mileage_rate from public.settings where id = 1), 0.26);
    new.amount := round(new.km * (case when new.return_trip then 2 else 1 end) * new.rate_per_km, 2);
  else
    new.km := null; new.rate_per_km := null; new.return_trip := false; new.from_place := null; new.to_place := null;
  end if;
  -- Without pay access (signed in): only your own, sent to approve, and only while it waits.
  if auth.uid() is not null and not v_pay then
    if tg_op = 'UPDATE' and old.status <> 'submitted' then raise exception 'This claim was already decided: ask an admin to change it'; end if;
    new.profile_id := case when tg_op = 'UPDATE' then old.profile_id else auth.uid() end;
    new.status := 'submitted';
    new.document_id := case when tg_op = 'UPDATE' then old.document_id end;
    new.decision_note := case when tg_op = 'UPDATE' then old.decision_note end;
  end if;
  -- Who decided and when; paid gets a day (today unless given).
  -- (Approved, then paid back: still the approval's.)
  if new.status = 'submitted' then
    new.decided_by := null; new.decided_at := null;
  elsif tg_op = 'INSERT' or (new.status is distinct from old.status and not (old.status = 'approved' and new.status = 'paid')) then
    new.decided_by := auth.uid(); new.decided_at := now();
  else
    new.decided_by := old.decided_by; new.decided_at := old.decided_at;
  end if;
  new.paid_on := case when new.status = 'paid' then coalesce(new.paid_on, current_date) end;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger expense_claims_rules before insert or update on public.expense_claims for each row execute function public.claim_rules();
create trigger audit_expense_claims after insert or update or delete on public.expense_claims for each row execute function public.audit_row();

-- The bell: admins with pay access when someone sends one; the person when theirs is decided or paid.
create or replace function public.claim_notify() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_who text := (select full_name from public.profiles where id = new.profile_id);
begin
  if tg_op = 'INSERT' and new.status = 'submitted' then
    insert into public.notifications (profile_id, title, body, link)
    select p.id, 'Expense to approve: ' || v_who || ', ' || to_char(new.amount, 'FM999990.00') || ' €', new.description, '/expenses'
      from public.profiles p where p.role = 'admin' and p.active and p.can_see_pay and p.id <> new.profile_id;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and new.status <> 'submitted' and new.profile_id is distinct from auth.uid() then
    insert into public.notifications (profile_id, title, body, link)
    values (new.profile_id,
            case new.status when 'approved' then 'Expense approved: ' when 'paid' then 'Expense paid back: ' else 'Expense turned down: ' end || new.description,
            coalesce(new.decision_note, to_char(new.amount, 'FM999990.00') || ' €'), '/expenses');
  end if;
  return null;
end $$;
revoke execute on function public.claim_notify() from public, anon, authenticated;
create trigger expense_claims_notify after insert or update of status on public.expense_claims for each row execute function public.claim_notify();

alter table public.expense_claims enable row level security;
revoke all on public.expense_claims from anon;
create policy expense_claims_read on public.expense_claims for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.can_see_pay()) or (select public.partner_can('finances')));
create policy expense_claims_add on public.expense_claims for insert to authenticated
  with check ((select public.is_staff()) and (profile_id = (select auth.uid()) or (select public.can_see_pay())));
create policy expense_claims_change on public.expense_claims for update to authenticated
  using ((profile_id = (select auth.uid()) and status = 'submitted') or (select public.can_see_pay()))
  with check (profile_id = (select auth.uid()) or (select public.can_see_pay()));
create policy expense_claims_remove on public.expense_claims for delete to authenticated
  using ((profile_id = (select auth.uid()) and status = 'submitted') or (select public.can_see_pay()));
