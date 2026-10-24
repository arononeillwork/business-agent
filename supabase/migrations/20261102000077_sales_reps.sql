-- Sales reps & rewards: the people who sell the café for it. Someone on the team, an ambassador
-- from outside (a friend of the café, a hotel concierge, a yoga studio) or a customer who spreads
-- the word, each with their own code for their business cards. What they bring in earns a reward
-- from the café's own list (a story reposted, a new customer with their card, an event booked):
-- commission paid out to reps, credit to spend in the café for customers.
-- Who: the team sees every rep and customers' credit, logs rewards and lets customers spend their
-- credit at the till; admins manage reps and the list, approve what needs it and pay commission
-- out. Someone on the team who is a rep sees their own commission; nobody approves their own.

-- 1. What the business cards offer the new customer ("10% off your first drink").
create table public.rep_settings (
  id             int primary key default 1 check (id = 1),
  welcome_offer  text check (char_length(welcome_offer) <= 120),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users on delete set null default auth.uid()
);
insert into public.rep_settings (id) values (1) on conflict do nothing;

-- 2. The reps.
create table public.sales_reps (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 120),
  -- team: someone on the team (profile_id); ambassador: someone outside who sells for the café;
  -- customer: a customer who spreads the word. Team and ambassadors earn commission, customers credit.
  kind         text not null default 'customer' check (kind in ('team', 'ambassador', 'customer')),
  profile_id   uuid references public.profiles on delete set null,
  customer_id  uuid references public.customers on delete set null,
  -- On their business cards: a new customer shows it at the till. Made from the name when not given.
  code         text not null unique check (code ~ '^[A-Z0-9]{3,12}$'),
  -- Without the @: their stories and posts about the café are matched to them by it.
  instagram    text check (instagram ~ '^[a-z0-9._]{1,30}$'),
  phone        text check (char_length(phone) <= 40),
  email        text check (char_length(email) <= 200),
  notes        text check (char_length(notes) <= 2000),
  active       boolean not null default true,
  created_by   uuid references auth.users on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index sales_reps_profile_idx on public.sales_reps (profile_id) where profile_id is not null;
create unique index sales_reps_instagram_idx on public.sales_reps (instagram) where instagram is not null;

-- A code from a name: its first word in capitals (accents dropped, 6 letters at most) and two
-- digits, unique ("LUCIA27"). Security definer so a code nobody on the team can see is never reused.
create or replace function public.new_rep_code(p_name text) returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_word text := left(regexp_replace(translate(upper(split_part(btrim(coalesce(p_name, '')), ' ', 1)),
                   'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇ', 'AAAAEEEEIIIIOOOOUUUUNC'), '[^A-Z0-9]', '', 'g'), 6);
  v_code text;
begin
  if char_length(v_word) < 2 then v_word := 'EB'; end if;
  for i in 1..200 loop
    v_code := case when i <= 100 then v_word || lpad(floor(random() * 100)::int::text, 2, '0')
                   else v_word || lpad(floor(random() * 1000)::int::text, 3, '0') end;
    if not exists (select 1 from public.sales_reps where code = v_code) then return v_code; end if;
  end loop;
  raise exception 'No code is free for %', v_word;
end $$;
revoke execute on function public.new_rep_code(text) from public, anon;
grant execute on function public.new_rep_code(text) to authenticated;

create or replace function public.sales_rep_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.instagram := nullif(lower(regexp_replace(btrim(coalesce(new.instagram, '')), '^@', '')), '');
  new.phone := nullif(btrim(new.phone), '');
  new.email := nullif(lower(btrim(new.email)), '');
  new.notes := nullif(btrim(new.notes), '');
  new.code := nullif(upper(regexp_replace(coalesce(new.code, ''), '\s', '', 'g')), '');
  if new.code is null then new.code := public.new_rep_code(new.name); end if;
  -- Someone on the team is a team rep; a team rep is someone on the team. Someone who leaves the
  -- team keeps their code and what they're owed, as an ambassador.
  if new.profile_id is not null then new.kind := 'team';
  elsif tg_op = 'UPDATE' and old.profile_id is not null and new.kind = 'team' then new.kind := 'ambassador';
  elsif new.kind = 'team' then raise exception 'Choose who on the team it is';
  end if;
  if tg_op = 'UPDATE' then new.created_by := old.created_by; new.created_at := old.created_at; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger sales_reps_rules before insert or update on public.sales_reps for each row execute function public.sales_rep_rules();
create trigger audit_sales_reps after insert or update or delete on public.sales_reps for each row execute function public.audit_row();

-- 3. What earns a reward, and how much.
create table public.reward_rules (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(name) between 1 and 80),
  -- customers: earned as credit by customers; reps: earned as commission by the team and
  -- ambassadors; everyone: both.
  who             text not null default 'everyone' check (who in ('everyone', 'customers', 'reps')),
  -- fixed: `amount` euros each time; percent: `amount` % of the sale it brought in.
  basis           text not null default 'fixed' check (basis in ('fixed', 'percent')),
  amount          numeric(8, 2) not null check (amount > 0 and amount <= 10000),
  -- An admin approves it before it counts; otherwise it counts as soon as it's logged.
  needs_approval  boolean not null default false,
  -- The most times one person earns it in a calendar month (null: no limit).
  monthly_limit   int check (monthly_limit between 1 and 100),
  sort            int not null default 0,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint reward_rules_percent check (basis = 'fixed' or amount <= 100)
);

create or replace function public.reward_rule_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger reward_rules_rules before insert or update on public.reward_rules for each row execute function public.reward_rule_rules();
create trigger audit_reward_rules after insert or update or delete on public.reward_rules for each row execute function public.audit_row();

-- 4. Every reward earned, credit spent and commission paid: a ledger. A rep's balance is what's
--    approved, added up (what they can spend in the café, or are owed).
create table public.rep_rewards (
  id           uuid primary key default gen_random_uuid(),
  rep_id       uuid not null references public.sales_reps on delete cascade,
  -- earn: a reward earned; redeem: credit spent in the café; payout: commission paid out.
  kind         text not null default 'earn' check (kind in ('earn', 'redeem', 'payout')),
  rule_id      uuid references public.reward_rules on delete set null,
  -- What it was for, as it was called then ("Reposted our story", "Used at the till").
  label        text not null check (char_length(label) between 1 and 120),
  -- The sale it brought in, for a reward that's a percentage of it.
  sale_amount  numeric(10, 2) check (sale_amount > 0),
  -- Euros: earned (+), spent or paid out (−).
  amount       numeric(10, 2) not null,
  status       text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  -- The story or post, an invoice…
  proof_url    text check (proof_url ~* '^https?://\S+$'),
  -- The Instagram mention it rewarded: each one is rewarded once.
  mention_id   text unique references public.instagram_mentions on delete set null,
  note         text check (char_length(note) <= 500),
  occurred_on  date not null default current_date,
  logged_by    uuid references auth.users on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  decided_by   uuid references auth.users on delete set null,
  decided_at   timestamptz,
  constraint rep_rewards_sign check ((kind = 'earn' and amount > 0) or (kind <> 'earn' and amount < 0)),
  constraint rep_rewards_settled check (kind = 'earn' or status = 'approved')
);
create index rep_rewards_rep_idx on public.rep_rewards (rep_id, occurred_on desc);
create index rep_rewards_pending_idx on public.rep_rewards (created_at) where status = 'pending';
create trigger audit_rep_rewards after insert or update or delete on public.rep_rewards for each row execute function public.audit_row();

-- What a rep has to spend or is owed: everything approved.
create or replace function public.rep_balance(p_rep_id uuid) returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(amount), 0) from public.rep_rewards where rep_id = p_rep_id and status = 'approved';
$$;
revoke execute on function public.rep_balance(uuid) from public, anon, authenticated;

alter table public.rep_settings enable row level security;
alter table public.sales_reps enable row level security;
alter table public.reward_rules enable row level security;
alter table public.rep_rewards enable row level security;
revoke all on public.rep_settings, public.sales_reps, public.reward_rules, public.rep_rewards from anon;

create policy rep_settings_read on public.rep_settings for select to authenticated using ((select public.is_staff()));
create policy rep_settings_admin on public.rep_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- The team adds customers who spread the word (at the till); admins everyone, and change them.
create policy sales_reps_read on public.sales_reps for select to authenticated using ((select public.is_staff()));
create policy sales_reps_add_customer on public.sales_reps for insert to authenticated
  with check ((select public.is_staff()) and kind = 'customer' and profile_id is null);
create policy sales_reps_admin on public.sales_reps for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy reward_rules_read on public.reward_rules for select to authenticated using ((select public.is_staff()));
create policy reward_rules_admin on public.reward_rules for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Customers' credit is for the whole team to see (it's spent at the till); commission is the
-- admins' and the rep's own. Written only through the functions below; admins can delete a mistake.
create policy rep_rewards_read on public.rep_rewards for select to authenticated using (
  (select public.is_admin()) or ((select public.is_staff()) and exists (
    select 1 from public.sales_reps r where r.id = rep_id and (r.kind = 'customer' or r.profile_id = (select auth.uid())))));
create policy rep_rewards_admin_delete on public.rep_rewards for delete to authenticated using ((select public.is_admin()));

-- 5. Log a reward for a rep, from the list. Its amount comes from the list (a percentage of the
--    sale for a percentage); it counts straight away unless the reward needs an admin's approval,
--    or the person logging it is the rep. Admins hear about the ones waiting.
--    Returns its id, whether it counts now ('approved') or waits ('pending'), and its amount.
create or replace function public.log_reward(p_rep_id uuid, p_rule_id uuid, p_sale_amount numeric default null,
  p_note text default null, p_proof_url text default null, p_mention_id text default null, p_occurred_on date default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_rep    public.sales_reps;
  v_rule   public.reward_rules;
  v_on     date := coalesce(p_occurred_on, (now() at time zone public.business_tz())::date);
  v_amount numeric;
  v_status text;
  v_id     uuid;
  v_used   int;
begin
  if not public.is_staff() then raise exception 'Only the team can log rewards'; end if;
  select * into v_rep from public.sales_reps where id = p_rep_id;
  if v_rep.id is null then raise exception 'Rep not found'; end if;
  if not v_rep.active then raise exception '% is no longer a rep', v_rep.name; end if;
  select * into v_rule from public.reward_rules where id = p_rule_id;
  if v_rule.id is null or not v_rule.active then raise exception 'That reward isn''t on the list'; end if;
  if v_rule.who = 'customers' and v_rep.kind <> 'customer' then raise exception '% is a reward for customers', v_rule.name; end if;
  if v_rule.who = 'reps' and v_rep.kind = 'customer' then raise exception '% is a reward for reps', v_rule.name; end if;
  if v_on > (now() at time zone public.business_tz())::date then raise exception 'It can''t be for a day still to come'; end if;
  if v_rule.basis = 'percent' then
    if p_sale_amount is null or p_sale_amount <= 0 then raise exception 'Give the amount of the sale'; end if;
    v_amount := round(p_sale_amount * v_rule.amount / 100, 2);
    if v_amount <= 0 then raise exception 'The sale is too small for a reward'; end if;
  else
    v_amount := v_rule.amount;
  end if;
  if v_rule.monthly_limit is not null then
    select count(*) into v_used from public.rep_rewards
     where rep_id = p_rep_id and rule_id = p_rule_id and kind = 'earn' and status <> 'rejected'
       and date_trunc('month', occurred_on) = date_trunc('month', v_on);
    if v_used >= v_rule.monthly_limit then
      raise exception '% has had "%" % times this month, the most there is', v_rep.name, v_rule.name, v_used;
    end if;
  end if;
  v_status := case when v_rep.profile_id = auth.uid() then 'pending'
                   when public.is_admin() or not v_rule.needs_approval then 'approved' else 'pending' end;
  insert into public.rep_rewards (rep_id, kind, rule_id, label, sale_amount, amount, status, proof_url, mention_id, note, occurred_on,
                                  decided_by, decided_at)
  values (p_rep_id, 'earn', p_rule_id, v_rule.name, case when v_rule.basis = 'percent' then p_sale_amount end, v_amount, v_status,
          nullif(btrim(p_proof_url), ''), p_mention_id, nullif(btrim(p_note), ''), v_on,
          case when v_status = 'approved' then auth.uid() end, case when v_status = 'approved' then now() end)
  returning id into v_id;
  if v_status = 'pending' then
    insert into public.notifications (profile_id, title, body, link)
    select a.id, v_rule.name || ' for ' || v_rep.name || ': €' || to_char(v_amount, 'FM999990.00') || ' to approve',
           concat_ws(' · ', (select full_name from public.profiles where id = auth.uid()), nullif(btrim(p_note), '')), '/sales-reps'
      from public.profiles a where a.role = 'admin' and a.active and a.id <> auth.uid();
  end if;
  return jsonb_build_object('id', v_id, 'status', v_status, 'amount', v_amount);
end $$;
revoke execute on function public.log_reward(uuid, uuid, numeric, text, text, text, date) from public, anon;
grant execute on function public.log_reward(uuid, uuid, numeric, text, text, text, date) to authenticated;

-- Admins: approve (optionally for another amount) or turn down a reward that's waiting. Nobody
-- approves their own.
create or replace function public.decide_reward(p_id uuid, p_approve boolean, p_amount numeric default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v public.rep_rewards;
begin
  if not public.is_admin() then raise exception 'Only an admin can approve rewards'; end if;
  select * into v from public.rep_rewards where id = p_id;
  if v.id is null or v.status <> 'pending' then raise exception 'This reward is no longer waiting'; end if;
  if p_approve and exists (select 1 from public.sales_reps where id = v.rep_id and profile_id = auth.uid()) then
    raise exception 'Someone else approves your own rewards';
  end if;
  if p_amount is not null and p_amount <= 0 then raise exception 'Give an amount above 0'; end if;
  update public.rep_rewards
     set status = case when p_approve then 'approved' else 'rejected' end,
         amount = case when p_approve and p_amount is not null then round(p_amount, 2) else amount end,
         decided_by = auth.uid(), decided_at = now()
   where id = p_id;
end $$;
revoke execute on function public.decide_reward(uuid, boolean, numeric) from public, anon;
grant execute on function public.decide_reward(uuid, boolean, numeric) to authenticated;

-- A customer spends credit at the till (the team), or a rep is paid their commission (admins).
-- Never more than the balance. Returns what's left.
create or replace function public.settle_reward(p_rep_id uuid, p_amount numeric, p_note text default null)
returns numeric
language plpgsql security definer set search_path = ''
as $$
declare
  v_rep     public.sales_reps;
  v_balance numeric;
begin
  if not public.is_staff() then raise exception 'Only the team can do that'; end if;
  select * into v_rep from public.sales_reps where id = p_rep_id;
  if v_rep.id is null then raise exception 'Rep not found'; end if;
  if v_rep.kind <> 'customer' and not public.is_admin() then raise exception 'Only an admin can pay commission'; end if;
  if v_rep.profile_id = auth.uid() then raise exception 'Someone else pays out your own commission'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Give an amount above 0'; end if;
  -- One at a time per rep, so two tills can't spend the same credit.
  perform 1 from public.sales_reps where id = p_rep_id for update;
  v_balance := public.rep_balance(p_rep_id);
  if round(p_amount, 2) > v_balance then
    raise exception '% has €% %', v_rep.name, to_char(v_balance, 'FM999990.00'),
      case when v_rep.kind = 'customer' then 'of credit' else 'owed' end;
  end if;
  insert into public.rep_rewards (rep_id, kind, label, amount, status, note, decided_by, decided_at)
  values (p_rep_id, case when v_rep.kind = 'customer' then 'redeem' else 'payout' end,
          case when v_rep.kind = 'customer' then 'Used at the till' else 'Commission paid' end,
          -round(p_amount, 2), 'approved', nullif(btrim(p_note), ''), auth.uid(), now());
  return v_balance - round(p_amount, 2);
end $$;
revoke execute on function public.settle_reward(uuid, numeric, text) from public, anon;
grant execute on function public.settle_reward(uuid, numeric, text) to authenticated;
