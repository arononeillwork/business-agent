-- Tips: what customers left over a period (cash and card, tip_pools) shared out among the team
-- (tip_shares), by the minutes each person worked (from timecards) or equally. save_tip_pool() saves
-- a pool with its shares at once, checking they add up to the tips; shared out, each person hears
-- in the bell what's theirs. Who: admins with pay access; a payroll gestoría reads; everyone sees
-- their own share once a pool is shared out (not while it's a draft).

create table public.tip_pools (
  id          uuid primary key default gen_random_uuid(),
  starts_on   date not null check (starts_on between '2000-01-01' and '2101-01-01'),
  ends_on     date not null check (ends_on between '2000-01-01' and '2101-01-01'),
  cash        numeric(10, 2) not null default 0 check (cash >= 0),
  card        numeric(10, 2) not null default 0 check (card >= 0),
  split       text not null default 'hours' check (split in ('hours', 'equal')),
  status      text not null default 'draft' check (status in ('draft', 'shared', 'paid')),
  notes       text check (char_length(notes) <= 1000),
  created_by  uuid references auth.users on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint tip_pools_dates check (ends_on >= starts_on and ends_on - starts_on <= 62)
);

create table public.tip_shares (
  pool_id     uuid not null references public.tip_pools on delete cascade,
  profile_id  uuid not null references public.profiles on delete cascade,
  minutes     int not null default 0 check (minutes >= 0),
  amount      numeric(10, 2) not null check (amount >= 0),
  primary key (pool_id, profile_id)
);
create index tip_shares_profile_idx on public.tip_shares (profile_id);

create trigger tip_pools_touch before update on public.tip_pools for each row execute function public.touch_updated();
create trigger audit_tip_pools after insert or update or delete on public.tip_pools for each row execute function public.audit_row();
create trigger audit_tip_shares after insert or update or delete on public.tip_shares for each row execute function public.audit_row();

-- A pool someone in it may see: shared out or paid (not a draft). Definer, so the policies below don't loop.
create or replace function public.tip_pool_out(p_pool uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.tip_pools where id = p_pool and status <> 'draft') $$;
revoke execute on function public.tip_pool_out(uuid) from public, anon;
grant execute on function public.tip_pool_out(uuid) to authenticated;

alter table public.tip_pools enable row level security;
alter table public.tip_shares enable row level security;
revoke all on public.tip_pools, public.tip_shares from anon;
create policy tip_pools_read on public.tip_pools for select to authenticated
  using ((select public.can_see_pay()) or (select public.partner_can('payroll'))
         or (status <> 'draft' and exists (select 1 from public.tip_shares s where s.pool_id = id and s.profile_id = (select auth.uid()))));
create policy tip_pools_pay on public.tip_pools for all to authenticated
  using ((select public.can_see_pay())) with check ((select public.can_see_pay()));
create policy tip_shares_read on public.tip_shares for select to authenticated
  using ((select public.can_see_pay()) or (select public.partner_can('payroll'))
         or (profile_id = (select auth.uid()) and public.tip_pool_out(pool_id)));
create policy tip_shares_pay on public.tip_shares for all to authenticated
  using ((select public.can_see_pay())) with check ((select public.can_see_pay()));

-- Save a pool (no id: a new one) and its shares, which replace the ones it had. Once it's not a
-- draft the shares must add up to the tips, to the cent. Shared out for the first time: each person
-- in it hears what's theirs. Returns the pool's id.
create or replace function public.save_tip_pool(p_pool jsonb, p_shares jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := nullif(p_pool ->> 'id', '')::uuid;
  v_was text;
  v_pool public.tip_pools;
  v_sum numeric;
begin
  if not public.can_see_pay() then raise exception 'Only admins with pay access share out tips'; end if;
  if jsonb_typeof(p_shares) <> 'array' then raise exception 'The shares are a list'; end if;
  if v_id is not null then
    select status into v_was from public.tip_pools where id = v_id;
    if not found then raise exception 'That pool of tips is gone'; end if;
    update public.tip_pools set starts_on = (p_pool ->> 'starts_on')::date, ends_on = (p_pool ->> 'ends_on')::date,
           cash = coalesce((p_pool ->> 'cash')::numeric, 0), card = coalesce((p_pool ->> 'card')::numeric, 0),
           split = coalesce(p_pool ->> 'split', 'hours'), status = coalesce(p_pool ->> 'status', 'draft'), notes = nullif(btrim(p_pool ->> 'notes'), '')
     where id = v_id returning * into v_pool;
  else
    insert into public.tip_pools (starts_on, ends_on, cash, card, split, status, notes)
    values ((p_pool ->> 'starts_on')::date, (p_pool ->> 'ends_on')::date, coalesce((p_pool ->> 'cash')::numeric, 0),
            coalesce((p_pool ->> 'card')::numeric, 0), coalesce(p_pool ->> 'split', 'hours'), coalesce(p_pool ->> 'status', 'draft'),
            nullif(btrim(p_pool ->> 'notes'), ''))
    returning * into v_pool;
  end if;
  delete from public.tip_shares where pool_id = v_pool.id;
  insert into public.tip_shares (pool_id, profile_id, minutes, amount)
  select v_pool.id, (s ->> 'profile_id')::uuid, coalesce((s ->> 'minutes')::int, 0), (s ->> 'amount')::numeric
    from jsonb_array_elements(p_shares) s;
  select coalesce(sum(amount), 0) into v_sum from public.tip_shares where pool_id = v_pool.id;
  if v_pool.status <> 'draft' and v_sum <> v_pool.cash + v_pool.card then
    raise exception 'The shares add up to % but the tips are %', v_sum, v_pool.cash + v_pool.card;
  end if;
  if v_pool.status <> 'draft' and coalesce(v_was, 'draft') = 'draft' then
    insert into public.notifications (profile_id, title, body, link)
    select s.profile_id, 'Your tips: ' || to_char(s.amount, 'FM999990.00') || ' €',
           to_char(v_pool.starts_on, 'DD/MM') || '–' || to_char(v_pool.ends_on, 'DD/MM/YYYY'), '/tips'
      from public.tip_shares s join public.profiles p on p.id = s.profile_id and p.active
     where s.pool_id = v_pool.id and s.amount > 0;
  end if;
  return v_pool.id;
end $$;
revoke execute on function public.save_tip_pool(jsonb, jsonb) from public, anon;
grant execute on function public.save_tip_pool(jsonb, jsonb) to authenticated;
