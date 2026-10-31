-- Sales reps: only an owner says yes to a new rep. Someone an employee or a shop manager adds (or a
-- rep adds to their crew from their page) waits for an owner, and only owners hear about them. An
-- owner (an admin who sees pay, shared/teamRoles.ts) adds people who count straight away. Rewards
-- that wait are still approved by any admin, as before. Replaces three functions from the
-- rep_reach_and_crews migration, with the same signatures.

-- 1. Who waits: anyone on the team but an owner.
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
  -- Someone on the team who isn't an owner (an employee, a shop manager) suggests; an owner says
  -- yes (decide_rep). The Worker (a rep's page) says itself that its people wait.
  if tg_op = 'INSERT' and auth.uid() is not null and not public.can_see_pay() then new.approved := false; end if;
  if tg_op = 'UPDATE' then new.created_by := old.created_by; new.created_at := old.created_at; end if;
  new.updated_at := now();
  return new;
end $$;

-- 2. Who hears about them: the owners.
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
    from public.profiles a where a.role = 'admin' and a.can_see_pay and a.active and a.id is distinct from auth.uid();
  return null;
end $$;

-- 3. Who says yes or no: an owner.
create or replace function public.decide_rep(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.sales_reps;
  r record;
begin
  if not public.can_see_pay() then raise exception 'Only an owner can say yes to a rep'; end if;
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
