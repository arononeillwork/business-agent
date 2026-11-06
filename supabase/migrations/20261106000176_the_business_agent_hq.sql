-- The Business Agent HQ: the business the company runs its sales reps from (the hq_reps migration)
-- takes the product's name, The Business Agent, and so do its reps' pitch and its complimentary
-- note. start_hq() makes it under the new name on a database that has none yet (the tests, a fresh
-- set-up). It's found by is_hq, never by name, so nothing that looks it up changes.
do $$
declare v_id int := (select id from public.business where is_hq);
begin
  if v_id is null then return; end if;
  perform set_config('app.business_id', v_id::text, true);
  update public.business set name = 'The Business Agent HQ' where id = v_id and name = 'Business Agent HQ';
  update public.rep_settings set pitch = replace(pitch, 'bringing businesses to Business Agent.', 'bringing businesses to The Business Agent.')
   where business_id = v_id;
  update public.billing set complimentary_note = 'The Business Agent HQ: The Business Agent itself'
   where business_id = v_id and complimentary_note = 'Business Agent HQ: Business Agent itself';
  perform set_config('app.business_id', '', true);
end $$;

create or replace function public.start_hq() returns int
language plpgsql set search_path = ''
as $$
declare v_id int := (select id from public.business where is_hq);
begin
  if v_id is not null then return v_id; end if;
  v_id := nextval('public.business_id_seq');
  perform set_config('app.business_id', v_id::text, true);
  insert into public.business (id, name, timezone, email, is_hq) values (v_id, 'The Business Agent HQ', 'Europe/Madrid', 'sales@businesssagent.com', true);
  perform public.seed_new_business(null);
  update public.rep_settings
     set welcome_offer = 'Your first month free, and I''ll set it up with you', boost_by_reach = false,
         pitch = 'Thank you for bringing businesses to The Business Agent. Every business that signs up with your code is yours: '
              || '€50 when it first pays, then 20% of what it pays for its first 12 paid months.'
   where business_id = v_id;
  insert into public.reward_rules (name, who, basis, amount, needs_approval, monthly_limit, sort, hq_role) values
    ('A business’s first payment', 'reps', 'fixed', 50, false, null, 1, 'first_payment'),
    ('20% of a payment', 'reps', 'percent', 20, false, null, 2, 'payment');
  -- The email is temporary until we have Julio's (HQ's Sales reps & rewards page changes it).
  insert into public.sales_reps (name, kind, code, email, categories, notes)
  values ('Julio', 'ambassador', 'JULIO27', 'julio.temp@example.com', '{cafe}', 'Cafés lead, Costa del Sol. Temporary email until we have his.');
  perform public.grant_complimentary('founder', 'The Business Agent HQ: The Business Agent itself', v_id);
  perform set_config('app.business_id', '', true);
  return v_id;
end $$;
revoke execute on function public.start_hq() from public, anon, authenticated, service_role;
