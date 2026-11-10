-- Cashback for posts about the café: a rep (a customer, an ambassador, someone on the team) who posts
-- about the café on Instagram (a collab reel, a tag, a story mention) earns from what the post did:
-- so much per 1,000 views, per new follower the café gained over the usual in the post's days (the
-- day it went out and the two after, against the middle day of the week before, as Analytics →
-- What each post did), and per 100 likes, up to a most per post. Customers get it as credit to spend
-- in the café; the team and ambassadors as commission. Worked out nightly, once a post's three days
-- are in (or a week has passed), for posts of the last 30 days; each post once. It waits for an
-- admin's OK unless the café says otherwise. shared/cashback.ts says the same for the page.

-- 1. The café's rates (Sales reps & rewards → Cashback for posts) --------------------------------------
alter table public.rep_settings
  add column cashback_on boolean not null default true,
  add column cashback_per_1000_views numeric(6, 2) not null default 0.50 check (cashback_per_1000_views between 0 and 100),
  add column cashback_per_follower numeric(6, 2) not null default 0.10 check (cashback_per_follower between 0 and 100),
  add column cashback_per_100_likes numeric(6, 2) not null default 0.20 check (cashback_per_100_likes between 0 and 100),
  add column cashback_max numeric(8, 2) not null default 15 check (cashback_max > 0 and cashback_max <= 1000),
  add column cashback_needs_approval boolean not null default true;

-- 2. What a post earns ------------------------------------------------------------------------------------
-- The figures it goes by, and the amount: views and likes as Instagram gave them, and the new followers
-- over the usual (null when the café's new followers for those days aren't known).
create or replace function public.post_cashback(p_views bigint, p_likes int, p_extra numeric, s public.rep_settings)
returns numeric
language sql immutable set search_path = ''
as $$
  select round(least(s.cashback_max,
    coalesce(p_views, 0) / 1000.0 * s.cashback_per_1000_views
    + greatest(coalesce(p_extra, 0), 0) * s.cashback_per_follower
    + coalesce(p_likes, 0) / 100.0 * s.cashback_per_100_likes), 2)
$$;
revoke execute on function public.post_cashback(bigint, int, numeric, public.rep_settings) from public, anon;
grant execute on function public.post_cashback(bigint, int, numeric, public.rep_settings) to authenticated;

-- 3. Nightly, for each business: the posts whose cashback is due ------------------------------------------
create or replace function public.pay_post_cashback() returns int
language plpgsql security definer set search_path = ''
as $$
declare
  s        public.rep_settings;
  m        record;
  v_today  date := (now() at time zone public.business_tz())::date;
  v_in     int;
  v_gained numeric;
  v_usual  numeric;
  v_extra  numeric;
  v_amount numeric;
  v_status text;
  v_note   text;
  v_id     uuid;
  v_n      int := 0;
begin
  select * into s from public.rep_settings where id = 1;
  if s.id is null or not s.cashback_on then return 0; end if;
  for m in
    select i.id, i.permalink, i.views, i.likes, (i.mentioned_at at time zone 'UTC')::date as day0, r.id as rep_id, r.name as rep_name
      from public.instagram_mentions i
      join public.sales_reps r on r.instagram = lower(i.username) and r.active and r.approved
     where i.mentioned_at >= now() - interval '30 days'
       and not exists (select 1 from public.rep_rewards w where w.mention_id = i.id or w.source = 'cashback:' || i.id)
     order by i.mentioned_at
  loop
    -- Due once its three days' new followers are all in (Instagram is a day or two late), or a week on
    -- without them (then it goes by its views and likes alone).
    select count(*), sum(d.gained) into v_in, v_gained from public.social_follower_days d
     where d.source = 'instagram' and d.day between m.day0 and m.day0 + 2;
    continue when v_in < 3 and m.day0 > v_today - 7;
    -- The usual: the middle day of the week before (three days of it known at least), times three.
    select case when count(*) >= 3 then percentile_cont(0.5) within group (order by d.gained) end into v_usual
      from public.social_follower_days d where d.source = 'instagram' and d.day between m.day0 - 7 and m.day0 - 1;
    v_extra := case when v_in = 3 and v_usual is not null then greatest(0, v_gained - round(v_usual * 3)) end;
    v_amount := public.post_cashback(m.views, m.likes, v_extra, s);
    continue when v_amount < 0.5;
    v_status := case when s.cashback_needs_approval then 'pending' else 'approved' end;
    v_note := concat_ws(' · ',
      case when m.views > 0 then to_char(m.views, 'FM999,999,999,990') || ' views' end,
      case when v_extra > 0 then '+' || to_char(v_extra, 'FM999,999,990') || ' followers over the usual' end,
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

-- 4. The jobs that run for each business: the hq_reps migration's, and the cashback --------------------------
create or replace function public.each_business(p_job text)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  b int;
  v_failed int := 0;
begin
  if p_job not in ('auto_close_entries', 'queue_shift_alerts', 'deliver_event_alerts', 'queue_due_social_posts',
                   'auto_fill_timecards', 'licence_reminders', 'enquiry_follow_ups', 'campaign_reminders',
                   'bank_holiday_reminders', 'release_rep_commission', 'pay_post_cashback') then
    raise exception 'Not a job that runs for each business: %', p_job;
  end if;
  for b in select id from public.business order by id loop
    perform set_config('app.business_id', b::text, true);
    begin
      execute format('select public.%I()', p_job);
    exception when others then
      v_failed := v_failed + 1;
      raise warning '% failed for business %: %', p_job, b, sqlerrm;
    end;
  end loop;
  perform set_config('app.business_id', '', true);
  return v_failed;
end $$;
