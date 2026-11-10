-- The amounts the database says when it refuses something, the way the business's country writes them:
-- "The kitty has €12.50" in Ireland, "The kitty has €12,50" in Spain (they all said "€12.50"). The
-- kitty's (the staff_kitty migration, and the delete_business migration's kitty_entry_rules), a rep's
-- credit or commission (the sales_reps migration's settle_reward) and the AI music's pay-per-use limit
-- (the social_music migration). The `offer_prices_by_country` migration's offer_amount() writes them,
-- now with thousands grouped as each country does ("€1,234.50", "€1.234,50"). Only replaces functions:
-- the rules are the same, only the words are.

-- 1. offer_amount(): as the `offer_prices_by_country` migration's, with thousands grouped.
create or replace function public.offer_amount(p numeric, p_business int default null) returns text
language sql stable set search_path = ''
as $$
  select '€' || case when (select b.country from public.business b where b.id = coalesce(p_business, public.current_business_id())) = 'IE'
                     then to_char(round(p, 2), 'FM999,999,990.00')
                     else translate(to_char(round(p, 2), 'FM999,999,990.00'), ',.', '.,') end
$$;

-- 2. The kitty: what's in it, when an entry or a goal would take it below what's been spent from it.
create or replace function public.kitty_entry_rules() returns trigger
language plpgsql set search_path = ''
as $$
declare v_was numeric := case when tg_op = 'INSERT' then 0 else old.amount end;
begin
  -- Nothing takes the kitty below what's been bought with it already.
  if tg_op = 'DELETE' then
    if public.business_being_deleted(old.business_id) then return old; end if;
    if old.amount > 0 and public.kitty_balance() - old.amount < 0 then
      raise exception 'That money has been spent: the kitty has %', public.offer_amount(greatest(public.kitty_balance(), 0), old.business_id);
    end if;
    return old;
  end if;
  new.note := nullif(btrim(new.note), '');
  if new.kind <> 'profit' then new.month := null; new.percent := null; end if;
  if new.kind = 'profit' and new.month >= date_trunc('month', now() at time zone public.business_tz())::date then
    raise exception 'A month''s profit goes in once the month is over';
  end if;
  if new.amount < v_was and public.kitty_balance() - v_was + new.amount < 0 then
    raise exception 'The kitty has %', public.offer_amount(greatest(public.kitty_balance() - v_was, 0), new.business_id);
  end if;
  if tg_op = 'UPDATE' then new.created_by := old.created_by; new.created_at := old.created_at; end if;
  return new;
end $$;

create or replace function public.kitty_goal_rules() returns trigger
language plpgsql set search_path = ''
as $$
declare v_left numeric;
begin
  new.name := btrim(new.name);
  new.link := nullif(btrim(new.link), '');
  new.notes := nullif(btrim(new.notes), '');
  -- Bought: the kitty has to have it (what's in it, not counting this goal's own spend before).
  if new.spent is not null and (tg_op = 'INSERT' or new.spent is distinct from old.spent) then
    v_left := public.kitty_balance() + case when tg_op = 'UPDATE' then coalesce(old.spent, 0) else 0 end;
    if new.spent > v_left then
      raise exception 'The kitty has %: put more in first', public.offer_amount(greatest(v_left, 0), new.business_id);
    end if;
  end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- 3. A rep's credit used at the till, or commission paid: no more than they have.
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
    raise exception '% has % %', v_rep.name, public.offer_amount(v_balance),
      case when v_rep.kind = 'customer' then 'of credit' else 'owed' end;
  end if;
  insert into public.rep_rewards (rep_id, kind, label, amount, status, note, decided_by, decided_at)
  values (p_rep_id, case when v_rep.kind = 'customer' then 'redeem' else 'payout' end,
          case when v_rep.kind = 'customer' then 'Used at the till' else 'Commission paid' end,
          -round(p_amount, 2), 'approved', nullif(btrim(p_note), ''), auth.uid(), now());
  return v_balance - round(p_amount, 2);
end $$;
alter function public.settle_reward(uuid, numeric, text) owner to app_definer;

-- 4. AI music's pay-per-use limit: the quote's reason when a track would go over it, and the limit's own bounds.
create or replace function public.ai_music_quote(p_seconds real default 30) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_plan     text := public.current_plan();
  v_ppu      public.pay_per_use;
  v_b        public.billing;
  v_inc      int;
  v_month    record;
  v_uses     int := greatest(1, ceil(greatest(p_seconds, 3) / 60.0))::int;
  v_free_left int;
  v_free     int;
  v_price    int;
  v_can_pay  boolean;
  v_reason   text;
begin
  select * into v_ppu from public.pay_per_use where id = 'ai_music';
  select * into v_b from public.billing where id = 1;
  select * into v_month from public._ai_music_month();
  v_inc := (v_ppu.included->>v_plan)::int;
  v_free_left := greatest(0, coalesce(v_inc, 0) + coalesce(v_b.ai_music_extra_free, 0) - v_month.free_used);
  v_free := least(v_uses, v_free_left);
  v_price := (v_uses - v_free) * v_ppu.price_cents;
  -- Charged on the subscription's bill: only a paid-up subscription can take it.
  v_can_pay := v_b.status in ('active', 'trialing') and v_b.stripe_customer_id is not null;
  v_reason := case
    when v_inc is null then 'AI music tracks need a paid plan. Choose one on the Billing page.'
    when v_price > 0 and v_b.status = 'comped' then 'This month''s free AI track is used. More next month.'
    when v_price > 0 and not v_can_pay then 'AI music tracks are added to your monthly bill, and there isn''t one to add to. Check the Billing page.'
    when v_price > 0 and v_month.spent_cents + v_price > v_b.ai_music_limit_cents then
      format('That would go over this month''s limit of %s for pay per use. Raise it on the Billing page.', public.offer_amount(v_b.ai_music_limit_cents / 100.0))
  end;
  return jsonb_build_object(
    'allowed', v_inc is not null, 'plan', v_plan, 'uses', v_uses, 'free', v_free, 'free_left', v_free_left,
    'included', coalesce(v_inc, 0), 'unit_cents', v_ppu.price_cents, 'price_cents', v_price,
    'spent_cents', v_month.spent_cents, 'limit_cents', v_b.ai_music_limit_cents, 'reason', v_reason);
end;
$$;
alter function public.ai_music_quote(real) owner to app_definer;

create or replace function public.set_ai_music_limit(p_cents int) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can change billing'; end if;
  if p_cents is null or p_cents < 0 or p_cents > 100000 then
    -- Whole euros: "between €0 and €1,000" in Ireland, "between €0 and €1.000" in Spain.
    raise exception 'The limit must be between % and %', regexp_replace(public.offer_amount(0), '[.,]00$', ''), regexp_replace(public.offer_amount(1000), '[.,]00$', '');
  end if;
  update public.billing set ai_music_limit_cents = p_cents, updated_at = now() where id = 1;
end;
$$;
alter function public.set_ai_music_limit(int) owner to app_definer;
