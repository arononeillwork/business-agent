-- Cashback for posts about the café, as the owner asked: so much per new follower the café gained in
-- the post's days (the day it went out and the two after), every one of them rather than those over a
-- usual three days; and for every post of an approved rep, however old (a customer's reel from the
-- summer earns its cashback too, by its views and likes when its days' followers aren't known: Instagram
-- keeps them for 30 days), down to a cent rather than from 50 cents. The rates, the most a post earns and
-- the owner's OK stay as the post_cashback migration set them. shared/cashback.ts says the same for the page.

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

-- The followers' part is now every new follower in the post's days (the argument kept its name).
comment on function public.post_cashback(bigint, int, numeric, public.rep_settings) is
  'What a post earns: views / 1000 × the rate, + new followers in its three days × the rate, + likes / 100 × the rate, up to the most a post earns.';
