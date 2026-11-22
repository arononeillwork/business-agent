-- Cashback on or off for the whole business, as the owner asked: a switch at the top of Sales reps & rewards
-- (admins; rep_settings' policies already keep cashback_on to them, the sales_reps migration's). Off, nothing
-- new is offered or paid; what reps have earned stays, to spend or be paid as before. A post made while it
-- was off never earns cashback, even once it's back on: the nightly job pays any post not paid yet, however
-- old (the cashback_every_follower migration), so the database keeps when it was off.

alter table public.rep_settings
  add column cashback_paused jsonb not null default '[]'::jsonb check (jsonb_typeof(cashback_paused) = 'array');
comment on column public.rep_settings.cashback_paused is
  'When cashback was off: [{"from": <when it was switched off>, "until": <when it was switched back on, null while it''s off>}]. Kept by the database from cashback_on; posts made then never earn cashback.';

-- A business whose cashback is off already: off from now (before this, the database didn't keep when).
update public.rep_settings set cashback_paused = jsonb_build_array(jsonb_build_object('from', now(), 'until', null))
 where not cashback_on;

-- Only the switch changes it: switched off, a time off starts; switched on, it ends.
create or replace function public.cashback_switch_rules() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.cashback_paused := case when new.cashback_on then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object('from', now(), 'until', null)) end;
  elsif new.cashback_on and not old.cashback_on then
    new.cashback_paused := (select coalesce(jsonb_agg(case when p->'until' = 'null'::jsonb then jsonb_set(p, '{until}', to_jsonb(now())) else p end
                                                      order by n), '[]'::jsonb)
                              from jsonb_array_elements(old.cashback_paused) with ordinality as x(p, n));
  elsif old.cashback_on and not new.cashback_on then
    new.cashback_paused := old.cashback_paused || jsonb_build_array(jsonb_build_object('from', now(), 'until', null));
  else
    new.cashback_paused := old.cashback_paused;
  end if;
  return new;
end $$;
create trigger rep_settings_cashback_switch before insert or update on public.rep_settings
  for each row execute function public.cashback_switch_rules();

-- Nightly, as the cashback_every_follower migration's, and not for a post made while cashback was off.
create or replace function public.pay_post_cashback() returns int
language plpgsql security definer set search_path = ''
as $$
declare
  s           public.rep_settings;
  m           record;
  v_today     date := (now() at time zone public.business_tz())::date;
  v_in        int;
  v_gained    numeric;
  v_followers numeric;
  v_amount    numeric;
  v_status    text;
  v_note      text;
  v_id        uuid;
  v_n         int := 0;
begin
  select * into s from public.rep_settings where id = 1;
  if s.id is null or not s.cashback_on then return 0; end if;
  for m in
    select i.id, i.permalink, i.views, i.likes, (i.mentioned_at at time zone 'UTC')::date as day0, r.id as rep_id, r.name as rep_name
      from public.instagram_mentions i
      join public.sales_reps r on r.instagram = lower(i.username) and r.active and r.approved
     where (i.mentioned_at at time zone 'UTC')::date <= v_today - 3
       and not exists (select 1 from public.rep_rewards w where w.mention_id = i.id or w.source = 'cashback:' || i.id)
       -- Made while cashback was off: never.
       and not exists (select 1 from jsonb_array_elements(s.cashback_paused) p
                        where i.mentioned_at >= (p->>'from')::timestamptz
                          and (p->>'until' is null or i.mentioned_at < (p->>'until')::timestamptz))
     order by i.mentioned_at
  loop
    -- Due once its three days' new followers are all in (Instagram is a day or two late), or a week on
    -- without them (then it goes by its views and likes alone).
    select count(*), sum(d.gained) into v_in, v_gained from public.social_follower_days d
     where d.source = 'instagram' and d.day between m.day0 and m.day0 + 2;
    continue when v_in < 3 and m.day0 > v_today - 7;
    v_followers := case when v_in = 3 then v_gained end;
    v_amount := public.post_cashback(m.views, m.likes, v_followers, s);
    -- Every cent a post earns is kept (an old post may earn only a little, by its views and likes).
    continue when v_amount < 0.01;
    v_status := case when s.cashback_needs_approval then 'pending' else 'approved' end;
    v_note := concat_ws(' · ',
      case when m.views > 0 then to_char(m.views, 'FM999,999,999,990') || ' views' end,
      case when v_followers > 0 then '+' || to_char(v_followers, 'FM999,999,990') || ' new followers' end,
      case when m.likes > 0 then to_char(m.likes, 'FM999,999,990') || ' likes' end);
    insert into public.rep_rewards (rep_id, kind, label, amount, status, proof_url, mention_id, note, occurred_on, source, decided_at)
    values (m.rep_id, 'earn', 'Cashback for a post', v_amount, v_status,
            case when m.permalink ~* '^https?://\S+$' then m.permalink end, m.id, nullif(v_note, ''), m.day0, 'cashback:' || m.id,
            case when v_status = 'approved' then now() end)
    returning id into v_id;
    if v_status = 'approved' then
      perform public.pay_crew_bonus(v_id);
    else
      insert into public.notifications (profile_id, title, body, link)
      select a.id, 'Post cashback for ' || m.rep_name || ': €' || to_char(v_amount, 'FM999990.00') || ' to approve', nullif(v_note, ''), '/sales-reps'
        from public.profiles a where a.role = 'admin' and a.can_see_pay and a.active;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
alter function public.pay_post_cashback() owner to app_definer;
revoke execute on function public.pay_post_cashback() from public, anon, authenticated;
