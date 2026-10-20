-- Ads: Meta Ads and Google Ads are connections like the others (not choose-one, the apps feature),
-- and the monthly limits are one row that only admins read and change.

create function pg_temp.act_as_role(p_role text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', (select id::text from public.profiles where role::text = p_role and active order by created_at limit 1), false);
  set role authenticated;
end $$;

-- 1. The connections ---------------------------------------------------------------------------
reset role;
do $$ begin
  assert (select count(*) from public.integrations where provider in ('meta_ads', 'google_ads')) = 2, 'both listed';
  assert public.integration_group('meta_ads') is null and public.integration_group('google_ads') is null, 'any number of ad platforms';
  assert public.plan_feature_of('meta_ads') = 'apps' and public.plan_feature_of('google_ads') = 'apps', 'need the apps feature';
end $$;
-- Both connected at once, next to Facebook: nothing else is disconnected.
update public.integrations set status = 'connected', account_label = 'Easy Beans Coffee' where provider in ('meta_ads', 'google_ads');
do $$ begin
  assert (select count(*) from public.integrations where provider in ('meta_ads', 'google_ads') and status = 'connected') = 2, 'both stay connected';
end $$;
update public.integrations set status = 'disconnected', account_label = null where provider in ('meta_ads', 'google_ads');

-- 2. Monthly limits: admins read and change the one row --------------------------------------
select pg_temp.act_as_role('admin');
do $$ begin
  assert (select count(*) from public.ad_settings) = 1, 'one row';
  assert (select alert_at_percent from public.ad_settings) = 80, 'warn at 80% to start';
  update public.ad_settings set meta_ads_monthly_cap = 300, google_ads_monthly_cap = 150.5, alert_at_percent = 90;
  assert (select meta_ads_monthly_cap = 300 and google_ads_monthly_cap = 150.5 and updated_by = auth.uid() from public.ad_settings), 'saved and stamped';
  begin
    update public.ad_settings set meta_ads_monthly_cap = -1;
    raise exception 'a negative cap was taken';
  exception when check_violation then null;
  end;
  begin
    update public.ad_settings set alert_at_percent = 0;
    raise exception 'a warning at nothing spent was taken';
  exception when check_violation then null;
  end;
  begin
    insert into public.ad_settings (id) values (2);
    raise exception 'a second row was taken';
  exception when insufficient_privilege or check_violation then null;
  end;
end $$;

-- 3. Staff see nothing and change nothing -------------------------------------------------------
select pg_temp.act_as_role('employee');
do $$ begin
  assert (select count(*) from public.ad_settings) = 0, 'staff can’t read the limits';
  update public.ad_settings set meta_ads_monthly_cap = 9999;
end $$;
reset role;
do $$ begin
  assert (select meta_ads_monthly_cap from public.ad_settings) = 300, 'staff changed nothing';
end $$;
