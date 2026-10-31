-- Sales reps: reach, crews, the owner's OK and each rep's own page.
--
-- Reach: a rep's accounts (Instagram, TikTok, YouTube, Facebook) with their followers, and the
-- people they see in person (a gym's members, a studio's clients, a WhatsApp group), added up. A
-- reward on the list can grow with reach: ×2 from 1,000 people, ×3 from 10,000, ×5 from 50,000.
-- Crews: a coach with twenty fighters, a studio with its teachers. The leader earns a share of what
-- their crew earns (10% to start), as a line of its own.
-- The owner's OK: anyone on the team can add someone now (not only customers); someone an employee
-- adds, or a rep adds to their crew from their page, waits for an admin before what they earn counts.
-- Their own page: a private link (/rep/<link>) where a rep sees what they've earned, their reach
-- and their crew, tells the café what they shared, and adds people to their crew.

-- 1. Reach, crews and the OK, on each rep ----------------------------------------------------------
alter table public.sales_reps
  add column tiktok text check (tiktok ~ '^[a-z0-9._]{1,30}$'),
  add column youtube text check (youtube ~ '^[a-z0-9._-]{1,30}$'),
  add column facebook text check (char_length(facebook) between 1 and 100),
  add column instagram_followers int check (instagram_followers between 0 and 1000000000),
  add column tiktok_followers int check (tiktok_followers between 0 and 1000000000),
  add column youtube_followers int check (youtube_followers between 0 and 1000000000),
  add column facebook_followers int check (facebook_followers between 0 and 1000000000),
  -- People they reach in person: a gym's members, a studio's clients, a WhatsApp group.
  add column community int check (community between 0 and 10000000),
  -- Their profile photo, from Instagram when it shares it (its links last a few days).
  add column picture_url text check (picture_url ~* '^https://\S+$' and char_length(picture_url) <= 2000),
  -- When Instagram last told us their followers.
  add column followers_checked_at timestamptz,
  add column reach bigint generated always as (coalesce(instagram_followers, 0)::bigint + coalesce(tiktok_followers, 0)
    + coalesce(youtube_followers, 0) + coalesce(facebook_followers, 0) + coalesce(community, 0)) stored,
  -- The crew they're in: its leader earns a share of what they earn. One level: a leader is in no crew.
  add column leader_id uuid references public.sales_reps on delete set null,
  -- Someone an employee adds, or a rep adds to their crew, waits for an admin's OK.
  add column approved boolean not null default true;
create index sales_reps_leader_idx on public.sales_reps (leader_id);
create index sales_reps_waiting_idx on public.sales_reps (created_at) where not approved;

create or replace function public.sales_rep_rules() returns trigger
language plpgsql set search_path = ''
as $$
declare v_leader public.sales_reps;
begin
  new.name := btrim(new.name);
  new.instagram := nullif(lower(regexp_replace(btrim(coalesce(new.instagram, '')), '^@', '')), '');
  new.tiktok := nullif(lower(regexp_replace(btrim(coalesce(new.tiktok, '')), '^@', '')), '');
  new.youtube := nullif(lower(regexp_replace(btrim(coalesce(new.youtube, '')), '^@', '')), '');
  new.facebook := nullif(btrim(new.facebook), '');
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
  -- A crew has one leader, who is in no crew themselves.
  if new.leader_id is not null then
    if new.leader_id = new.id then raise exception '% can''t be in their own crew', new.name; end if;
    select * into v_leader from public.sales_reps where id = new.leader_id;
    if v_leader.leader_id is not null then
      raise exception '% is in someone else''s crew, so they can''t lead one', v_leader.name;
    end if;
    if tg_op = 'UPDATE' and exists (select 1 from public.sales_reps where leader_id = new.id) then
      raise exception '% leads a crew, so they can''t join one', new.name;
    end if;
  end if;
  -- Someone on the team who isn't an admin suggests; an admin says yes (decide_rep). The Worker
  -- (a rep's page) says itself that its people wait.
  if tg_op = 'INSERT' and auth.uid() is not null and not public.is_admin() then new.approved := false; end if;
  if tg_op = 'UPDATE' then new.created_by := old.created_by; new.created_at := old.created_at; end if;
  new.updated_at := now();
  return new;
end $$;

-- Admins hear about each person waiting for their OK.
create or replace function public.sales_rep_suggested() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_by     text := (select full_name from public.profiles where id = auth.uid());
  v_leader text := (select name from public.sales_reps where id = new.leader_id);
begin
  if new.approved then return null; end if;
  insert into public.notifications (profile_id, title, body, link)
  select a.id,
         case when v_by is not null then v_by || ' added ' || new.name || ' as a rep: waiting for your OK'
              when v_leader is not null then v_leader || ' added ' || new.name || ' to their crew: waiting for your OK'
              else new.name || ' is waiting for your OK as a rep' end,
         concat_ws(' · ', case when v_leader is not null and v_by is not null then 'In ' || v_leader || '’s crew' end,
                   case when new.reach > 0 then 'Reaches ' || to_char(new.reach, 'FM999,999,999,990') || ' people' end, new.notes),
         '/sales-reps'
    from public.profiles a where a.role = 'admin' and a.active and a.id is distinct from auth.uid();
  return null;
end $$;
alter function public.sales_rep_suggested() owner to app_definer;
revoke execute on function public.sales_rep_suggested() from public, anon, authenticated;
create trigger sales_reps_suggested after insert on public.sales_reps for each row execute function public.sales_rep_suggested();

-- Anyone on the team adds someone (a customer, an ambassador, or themselves); it waits for an admin
-- unless they are one (above). Changing someone stays the admins'.
drop policy sales_reps_add_customer on public.sales_reps;
create policy sales_reps_suggest on public.sales_reps for insert to authenticated
  with check ((select public.is_staff()) and (profile_id is null or profile_id = (select auth.uid())));

-- 2. The café's settings: the crew's share, rewards growing with reach, and its message to its reps
alter table public.rep_settings
  -- What a crew's leader earns of what their crew earns, in %.
  add column crew_share numeric(5, 2) not null default 10 check (crew_share between 0 and 50),
  -- Rewards marked "grows with reach" are bigger for people who reach more.
  add column boost_by_reach boolean not null default true,
  -- The café's own words at the top of each rep's page (a thank-you, why it matters).
  add column pitch text check (char_length(pitch) <= 600);

-- 3. Rewards that grow with reach ------------------------------------------------------------------
alter table public.reward_rules
  add column scales_with_reach boolean not null default false,
  add constraint reward_rules_reach_fixed check (not scales_with_reach or basis = 'fixed');
-- A story or a post reaches the sharer's followers: the more they have, the more it's worth.
update public.reward_rules set scales_with_reach = true
 where basis = 'fixed' and name ~* '(stor|post|reel|histori|publica)';

-- How much bigger a reward is for someone who reaches more people: ×1 under 1,000, ×2 from 1,000,
-- ×3 from 10,000, ×5 from 50,000 (shared/reps.ts says the same).
create or replace function public.reach_multiplier(p_reach bigint) returns numeric
language sql immutable set search_path = ''
as $$
  select (case when coalesce(p_reach, 0) >= 50000 then 5 when p_reach >= 10000 then 3 when p_reach >= 1000 then 2 else 1 end)::numeric;
$$;

-- 4. The ledger: the multiplier a reward had, and a leader's crew bonus ----------------------------
alter table public.rep_rewards
  -- The crew member's reward this is the leader's share of; taken off again with it.
  add column bonus_for uuid references public.rep_rewards on delete cascade,
  -- ×2, ×3 or ×5 for the rep's reach, when the reward grows with it.
  add column multiplier numeric(4, 2) check (multiplier > 1);
create unique index rep_rewards_bonus_for_idx on public.rep_rewards (bonus_for);

-- A crew's leader earns their share of a crew member's reward once it counts. Waits for someone
-- else when the leader is the one approving it.
create or replace function public.pay_crew_bonus(p_reward_id uuid) returns void
language plpgsql set search_path = ''
as $$
declare
  r        public.rep_rewards;
  v_rep    public.sales_reps;
  v_leader public.sales_reps;
  v_amount numeric;
  v_status text;
begin
  select * into r from public.rep_rewards where id = p_reward_id;
  if r.id is null or r.kind <> 'earn' or r.status <> 'approved' or r.bonus_for is not null then return; end if;
  select * into v_rep from public.sales_reps where id = r.rep_id;
  if v_rep.leader_id is null then return; end if;
  select * into v_leader from public.sales_reps where id = v_rep.leader_id;
  if v_leader.id is null or not v_leader.active or not v_leader.approved then return; end if;
  v_amount := round(r.amount * coalesce((select crew_share from public.rep_settings where id = 1), 0) / 100, 2);
  if v_amount <= 0 then return; end if;
  v_status := case when v_leader.profile_id = auth.uid() then 'pending' else 'approved' end;
  insert into public.rep_rewards (rep_id, kind, label, amount, status, note, occurred_on, bonus_for, logged_by, decided_by, decided_at)
  values (v_leader.id, 'earn', left('Crew bonus · ' || v_rep.name, 120), v_amount, v_status, left(r.label, 500), r.occurred_on, r.id,
          r.logged_by, case when v_status = 'approved' then r.decided_by end, case when v_status = 'approved' then now() end)
  on conflict (bonus_for) do nothing;
end $$;
revoke execute on function public.pay_crew_bonus(uuid) from public, anon, authenticated;
grant execute on function public.pay_crew_bonus(uuid) to app_definer;

-- A reward from the list for a rep: its amount (a percentage of the sale for a percentage), times
-- their reach's multiplier when it grows with reach; within its monthly limit; for the right kind of
-- rep. Admins hear about the ones waiting; a crew's leader gets their share of the ones that count.
-- For log_reward (the team) and claim_reward (a rep's own page).
create or replace function public.add_reward(p_rep public.sales_reps, p_rule public.reward_rules, p_sale_amount numeric, p_note text,
  p_proof_url text, p_mention_id text, p_occurred_on date, p_status text, p_by uuid)
returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_on         date := coalesce(p_occurred_on, (now() at time zone public.business_tz())::date);
  v_amount     numeric;
  v_multiplier numeric;
  v_id         uuid;
  v_used       int;
begin
  if not p_rep.active then raise exception '% is no longer a rep', p_rep.name; end if;
  if p_rule.id is null or not p_rule.active then raise exception 'That reward isn''t on the list'; end if;
  if p_rule.who = 'customers' and p_rep.kind <> 'customer' then raise exception '% is a reward for customers', p_rule.name; end if;
  if p_rule.who = 'reps' and p_rep.kind = 'customer' then raise exception '% is a reward for reps', p_rule.name; end if;
  if v_on > (now() at time zone public.business_tz())::date then raise exception 'It can''t be for a day still to come'; end if;
  if p_rule.basis = 'percent' then
    if p_sale_amount is null or p_sale_amount <= 0 then raise exception 'Give the amount of the sale'; end if;
    v_amount := round(p_sale_amount * p_rule.amount / 100, 2);
    if v_amount <= 0 then raise exception 'The sale is too small for a reward'; end if;
  else
    v_amount := p_rule.amount;
    if p_rule.scales_with_reach and coalesce((select boost_by_reach from public.rep_settings where id = 1), true) then
      v_multiplier := public.reach_multiplier(p_rep.reach);
      if v_multiplier > 1 then v_amount := round(v_amount * v_multiplier, 2); else v_multiplier := null; end if;
    end if;
  end if;
  if p_rule.monthly_limit is not null then
    select count(*) into v_used from public.rep_rewards
     where rep_id = p_rep.id and rule_id = p_rule.id and kind = 'earn' and status <> 'rejected'
       and date_trunc('month', occurred_on) = date_trunc('month', v_on);
    if v_used >= p_rule.monthly_limit then
      raise exception '% has had "%" % times this month, the most there is', p_rep.name, p_rule.name, v_used;
    end if;
  end if;
  insert into public.rep_rewards (rep_id, kind, rule_id, label, sale_amount, amount, multiplier, status, proof_url, mention_id, note, occurred_on,
                                  logged_by, decided_by, decided_at)
  values (p_rep.id, 'earn', p_rule.id, p_rule.name, case when p_rule.basis = 'percent' then p_sale_amount end, v_amount, v_multiplier, p_status,
          nullif(btrim(p_proof_url), ''), p_mention_id, nullif(btrim(p_note), ''), v_on,
          p_by, case when p_status = 'approved' then p_by end, case when p_status = 'approved' then now() end)
  returning id into v_id;
  if p_status = 'pending' then
    insert into public.notifications (profile_id, title, body, link)
    select a.id, p_rule.name || ' for ' || p_rep.name || ': €' || to_char(v_amount, 'FM999990.00') || ' to approve',
           concat_ws(' · ', coalesce((select full_name from public.profiles where id = p_by), case when p_by is null then 'From their own page' end),
                     case when not p_rep.approved then 'They''re waiting for your OK too' end, nullif(btrim(p_note), '')), '/sales-reps'
      from public.profiles a where a.role = 'admin' and a.active and a.id is distinct from p_by;
  else
    perform public.pay_crew_bonus(v_id);
  end if;
  return jsonb_build_object('id', v_id, 'status', p_status, 'amount', v_amount);
end $$;
revoke execute on function public.add_reward(public.sales_reps, public.reward_rules, numeric, text, text, text, date, text, uuid) from public, anon, authenticated;
grant execute on function public.add_reward(public.sales_reps, public.reward_rules, numeric, text, text, text, date, text, uuid) to app_definer;

-- The team logs a reward. It counts straight away unless the reward needs an admin's approval, the
-- person logging it is the rep, or the rep is still waiting for an admin's OK.
create or replace function public.log_reward(p_rep_id uuid, p_rule_id uuid, p_sale_amount numeric default null,
  p_note text default null, p_proof_url text default null, p_mention_id text default null, p_occurred_on date default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_rep  public.sales_reps;
  v_rule public.reward_rules;
begin
  if not public.is_staff() then raise exception 'Only the team can log rewards'; end if;
  select * into v_rep from public.sales_reps where id = p_rep_id;
  if v_rep.id is null then raise exception 'Rep not found'; end if;
  select * into v_rule from public.reward_rules where id = p_rule_id;
  return public.add_reward(v_rep, v_rule, p_sale_amount, p_note, p_proof_url, p_mention_id, p_occurred_on,
    case when v_rep.profile_id = auth.uid() or not v_rep.approved then 'pending'
         when public.is_admin() or not v_rule.needs_approval then 'approved' else 'pending' end,
    auth.uid());
end $$;

-- Admins: approve (optionally for another amount) or turn down a reward that's waiting. Nobody
-- approves their own. A crew's leader gets their share of it once it counts.
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
  if p_approve then perform public.pay_crew_bonus(p_id); end if;
end $$;

-- Admins: say yes to someone waiting (added by an employee, or by a rep to their crew), or no (they're
-- taken off). Once they're in, what the team logged for them while they waited counts, unless the
-- reward needs an admin's approval anyway; what they sent from their own page still waits.
create or replace function public.decide_rep(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.sales_reps;
  r record;
begin
  if not public.is_admin() then raise exception 'Only an admin can say yes to a rep'; end if;
  select * into v from public.sales_reps where id = p_id;
  if v.id is null then raise exception 'Rep not found'; end if;
  if v.approved then raise exception '% is already a rep', v.name; end if;
  if not p_approve then delete from public.sales_reps where id = p_id; return; end if;
  if v.profile_id = auth.uid() then raise exception 'Someone else says yes to you as a rep'; end if;
  update public.sales_reps set approved = true where id = p_id;
  for r in select w.id from public.rep_rewards w join public.reward_rules u on u.id = w.rule_id
            where w.rep_id = p_id and w.kind = 'earn' and w.status = 'pending' and not u.needs_approval
              and w.logged_by is not null and w.logged_by is distinct from v.profile_id
            order by w.created_at loop
    update public.rep_rewards set status = 'approved', decided_by = auth.uid(), decided_at = now() where id = r.id;
    perform public.pay_crew_bonus(r.id);
  end loop;
end $$;
alter function public.decide_rep(uuid, boolean) owner to app_definer;
revoke execute on function public.decide_rep(uuid, boolean) from public, anon;
grant execute on function public.decide_rep(uuid, boolean) to authenticated;

-- 5. Each rep's own page ---------------------------------------------------------------------------
-- The secret in a rep's link (/rep/<token>): admins make it when they first share it, and can change
-- it; someone on the team who is a rep sees their own. The Worker finds the rep by it.
create table public.rep_links (
  rep_id      uuid primary key references public.sales_reps on delete cascade,
  token       text not null unique default replace(gen_random_uuid()::text, '-', '') check (token ~ '^[0-9a-f]{32}$'),
  created_at  timestamptz not null default now()
);
select public.add_business_scope('public.rep_links');
alter table public.rep_links enable row level security;
revoke all on public.rep_links from anon;
create policy rep_links_admin on public.rep_links for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy rep_links_own on public.rep_links for select to authenticated using (
  exists (select 1 from public.sales_reps r where r.id = rep_id and r.profile_id = (select auth.uid())));

-- What a rep's page shows (the Worker, for anyone with the link): who they are, their reach and
-- crew, what they've earned and can spend or are owed, this month's standing, and what earns a
-- reward for them. Never their phone, email or the café's notes. Null: no such link.
create or replace function public.rep_page(p_token text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v       public.sales_reps;
  v_month date := date_trunc('month', (now() at time zone public.business_tz())::date)::date;
begin
  select r.* into v from public.rep_links l join public.sales_reps r on r.id = l.rep_id where l.token = p_token;
  if v.id is null or not v.active then return null; end if;
  return jsonb_build_object(
    'rep', jsonb_build_object('id', v.id, 'name', v.name, 'kind', v.kind, 'code', v.code, 'approved', v.approved,
             'instagram', v.instagram, 'tiktok', v.tiktok, 'youtube', v.youtube, 'facebook', v.facebook,
             'instagram_followers', v.instagram_followers, 'tiktok_followers', v.tiktok_followers, 'youtube_followers', v.youtube_followers,
             'facebook_followers', v.facebook_followers, 'community', v.community, 'reach', v.reach, 'picture_url', v.picture_url,
             'leader', (select name from public.sales_reps where id = v.leader_id)),
    'business', jsonb_build_object('name', (select name from public.business where id = public.current_business_id()),
                                   'logo', (select coalesce(b.logo_mark, b.logo) from public.brand b where b.id = 1)),
    'settings', (select jsonb_build_object('welcome_offer', s.welcome_offer, 'crew_share', s.crew_share, 'boost_by_reach', s.boost_by_reach, 'pitch', s.pitch)
                   from public.rep_settings s where s.id = 1),
    'balance', coalesce((select sum(amount) from public.rep_rewards where rep_id = v.id and status = 'approved'), 0),
    'waiting', coalesce((select sum(amount) from public.rep_rewards where rep_id = v.id and status = 'pending'), 0),
    'month', (
      with earned as (
        select r.id, coalesce(sum(w.amount) filter (where w.kind = 'earn' and w.status <> 'rejected' and w.occurred_on >= v_month), 0) as total
          from public.sales_reps r left join public.rep_rewards w on w.rep_id = r.id
         where r.active and r.approved group by r.id)
      select jsonb_build_object('earned', coalesce((select total from earned where id = v.id), 0),
                                'rewards', (select count(*) from public.rep_rewards where rep_id = v.id and kind = 'earn' and status <> 'rejected' and occurred_on >= v_month),
                                'rank', case when coalesce((select total from earned where id = v.id), 0) > 0
                                             then 1 + (select count(*) from earned where total > (select total from earned where id = v.id)) end,
                                'people', (select count(*) from earned where total > 0))),
    'rewards', coalesce((
      select jsonb_agg(jsonb_build_object('id', w.id, 'kind', w.kind, 'label', w.label, 'amount', w.amount, 'status', w.status,
                                          'occurred_on', w.occurred_on, 'multiplier', w.multiplier, 'bonus', w.bonus_for is not null)
                       order by w.occurred_on desc, w.created_at desc)
        from (select * from public.rep_rewards where rep_id = v.id order by occurred_on desc, created_at desc limit 30) w), '[]'::jsonb),
    'crew', coalesce((
      select jsonb_agg(jsonb_build_object('name', m.name, 'reach', m.reach, 'approved', m.approved, 'instagram', m.instagram,
               'earned_this_month', coalesce((select sum(w.amount) from public.rep_rewards w
                                               where w.rep_id = m.id and w.kind = 'earn' and w.status <> 'rejected' and w.occurred_on >= v_month), 0),
               'bonus_this_month', coalesce((select sum(b.amount) from public.rep_rewards b join public.rep_rewards w on w.id = b.bonus_for
                                              where b.rep_id = v.id and w.rep_id = m.id and b.status <> 'rejected' and b.occurred_on >= v_month), 0))
             order by m.approved desc, m.reach desc, m.name)
        from public.sales_reps m where m.leader_id = v.id and m.active), '[]'::jsonb),
    'rules', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name, 'who', u.who, 'basis', u.basis, 'amount', u.amount,
               'scales_with_reach', u.scales_with_reach, 'needs_approval', u.needs_approval, 'monthly_limit', u.monthly_limit,
               'used_this_month', (select count(*) from public.rep_rewards w where w.rep_id = v.id and w.rule_id = u.id and w.kind = 'earn'
                                     and w.status <> 'rejected' and w.occurred_on >= v_month))
             order by u.sort, u.created_at)
        from public.reward_rules u
       where u.active and (u.who = 'everyone' or (u.who = 'customers') = (v.kind = 'customer'))), '[]'::jsonb));
end $$;
alter function public.rep_page(text) owner to app_definer;
revoke execute on function public.rep_page(text) from public, anon, authenticated;
grant execute on function public.rep_page(text) to service_role;

-- A rep tells the café what they shared, from their page: a reward from the list (one with a set
-- amount; the café logs the others), waiting for an admin. Ten at a time at most.
create or replace function public.claim_reward(p_token text, p_rule_id uuid, p_note text default null, p_proof_url text default null,
  p_occurred_on date default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_rep  public.sales_reps;
  v_rule public.reward_rules;
begin
  select r.* into v_rep from public.rep_links l join public.sales_reps r on r.id = l.rep_id where l.token = p_token;
  if v_rep.id is null then raise exception 'This link has changed. Ask the café for your new one.'; end if;
  select * into v_rule from public.reward_rules where id = p_rule_id;
  if v_rule.basis <> 'fixed' then raise exception 'The café logs "%" for you once it''s booked', v_rule.name; end if;
  if nullif(btrim(p_note), '') is null and nullif(btrim(p_proof_url), '') is null then
    raise exception 'Say what you shared, or add its link';
  end if;
  if (select count(*) from public.rep_rewards where rep_id = v_rep.id and status = 'pending' and logged_by is null and bonus_for is null) >= 10 then
    raise exception 'Ten of yours are waiting for the café already. Once they''re checked, send more.';
  end if;
  return public.add_reward(v_rep, v_rule, null, p_note, p_proof_url, null, p_occurred_on, 'pending', null);
end $$;
alter function public.claim_reward(text, uuid, text, text, date) owner to app_definer;
revoke execute on function public.claim_reward(text, uuid, text, text, date) from public, anon, authenticated;
grant execute on function public.claim_reward(text, uuid, text, text, date) to service_role;

-- A crew's leader adds someone to their crew from their page (a fighter, a teacher): they earn as a
-- customer, with credit to spend in the café, once an admin says yes. Thirty waiting at most.
create or replace function public.suggest_crew(p_token text, p_person jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_rep public.sales_reps;
  v_new public.sales_reps;
  v_int text[] := array['instagram_followers', 'tiktok_followers', 'youtube_followers', 'facebook_followers', 'community'];
  k     text;
begin
  select r.* into v_rep from public.rep_links l join public.sales_reps r on r.id = l.rep_id where l.token = p_token;
  if v_rep.id is null or not v_rep.active then raise exception 'This link has changed. Ask the café for your new one.'; end if;
  if v_rep.leader_id is not null then
    raise exception 'You''re in %''s crew: they add people to it', (select name from public.sales_reps where id = v_rep.leader_id);
  end if;
  if nullif(btrim(p_person->>'name'), '') is null then raise exception 'Give their name'; end if;
  foreach k in array v_int loop
    if p_person ? k and jsonb_typeof(p_person->k) <> 'null' and (jsonb_typeof(p_person->k) <> 'number' or (p_person->>k)::numeric < 0) then
      raise exception 'Followers are a number';
    end if;
  end loop;
  if (select count(*) from public.sales_reps where leader_id = v_rep.id and not approved) >= 30 then
    raise exception 'Thirty of your crew are waiting for the café''s OK already. Once they''re in, add more.';
  end if;
  insert into public.sales_reps (name, kind, leader_id, approved, instagram, tiktok, youtube, facebook,
                                 instagram_followers, tiktok_followers, youtube_followers, facebook_followers, community, phone, notes)
  values (left(btrim(p_person->>'name'), 120), 'customer', v_rep.id, false, p_person->>'instagram', p_person->>'tiktok', p_person->>'youtube',
          nullif(btrim(p_person->>'facebook'), ''), (p_person->>'instagram_followers')::numeric::int, (p_person->>'tiktok_followers')::numeric::int,
          (p_person->>'youtube_followers')::numeric::int, (p_person->>'facebook_followers')::numeric::int, (p_person->>'community')::numeric::int,
          left(nullif(btrim(p_person->>'phone'), ''), 40), left(nullif(btrim(p_person->>'note'), ''), 2000))
  returning * into v_new;
  return jsonb_build_object('name', v_new.name, 'reach', v_new.reach, 'approved', v_new.approved);
end $$;
alter function public.suggest_crew(text, jsonb) owner to app_definer;
revoke execute on function public.suggest_crew(text, jsonb) from public, anon, authenticated;
grant execute on function public.suggest_crew(text, jsonb) to service_role;
