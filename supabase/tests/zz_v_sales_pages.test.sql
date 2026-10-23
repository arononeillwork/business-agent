-- Leads & enquiries, Quotes & estimates and Campaigns: tidied, admins only, an enquiry moved on by
-- its quote (quoted, then won, which makes the person a customer), quotes numbered and totalled by
-- the database, and the nightly reminders for follow-ups and planned campaigns.
-- People from the tests before it: maria (admin with pay access), julio (employee).

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  set role authenticated;
end $$;

create function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_err text;
begin
  begin execute p_sql; exception when others then v_err := sqlerrm; end;
  if v_err is null then raise exception 'Expected error like "%" but statement succeeded: %', p_like, p_sql; end if;
  if v_err not ilike '%' || p_like || '%' then raise exception 'Expected error like "%", got "%"', p_like, v_err; end if;
end $$;

-- 1. Enquiries: tidied, closed when won or lost, and won makes the person a customer ---------------
select pg_temp.act_as('maria@test');
do $$
declare v_lead uuid; v_e uuid;
begin
  insert into public.customers (kind, first_name, email) values ('lead', 'Hannah', 'hannah@example.de') returning id into v_lead;
  insert into public.enquiries (customer_id, title, channel, value, follow_up_on, notes)
    values (v_lead, '  Cakes for a baby shower ', 'website', 180, current_date, '  ') returning id into v_e;
  assert (select title = 'Cakes for a baby shower' and notes is null and stage = 'new' and closed_at is null from public.enquiries where id = v_e), 'tidied, new and open';
  update public.enquiries set stage = 'lost', lost_reason = ' Too dear ' where id = v_e;
  assert (select closed_at is not null and lost_reason = 'Too dear' from public.enquiries where id = v_e), 'lost: closed, with its reason';
  update public.enquiries set stage = 'contacted' where id = v_e;
  assert (select closed_at is null and lost_reason is null from public.enquiries where id = v_e), 'open again: no longer closed';
end $$;
select pg_temp.expect_error($q$insert into public.enquiries (customer_id, title, stage) values ((select id from public.customers limit 1), 'X', 'maybe')$q$, 'check constraint');

-- 2. Quotes: numbered each year, totalled here, moving their enquiry on ----------------------------
do $$
declare v_e uuid := (select id from public.enquiries where title = 'Cakes for a baby shower'); v_q uuid; v_q2 uuid;
begin
  insert into public.quotes (title, enquiry_id, lines, discount_pct) values ('Baby shower, 15 people', v_e,
    '[{"description": "Coffee and tea", "quantity": 15, "unit_price": 2.5, "vat_rate": 10},
      {"description": "Hire of the terrace", "quantity": 1, "unit_price": 100, "vat_rate": 21}]', 10) returning id into v_q;
  assert (select number = 'Q-' || extract(year from current_date) || '-001' from public.quotes where id = v_q), 'the first number of the year';
  -- 37.50 and 100 less 10%: 33.75 at 10% (3.38) and 90 at 21% (18.90).
  assert (select net = 123.75 and vat = 22.28 and total = 146.03 from public.quotes where id = v_q), 'totals worked out here';
  assert (select customer_id = (select customer_id from public.enquiries where id = v_e) from public.quotes where id = v_q), 'the enquiry’s person';
  assert (select stage = 'quoted' from public.enquiries where id = v_e), 'a quote moves the enquiry to quoted';
  update public.quotes set number = 'Q-1999-999', status = 'sent' where id = v_q;
  assert (select number like 'Q-%-001' and issued_on = current_date and valid_until = current_date + 30 from public.quotes where id = v_q),
    'the number stays; sent: dated today, good for 30 days';
  insert into public.quotes (title) values ('Christmas hampers') returning id into v_q2;
  assert (select number like 'Q-%-002' and total = 0 from public.quotes where id = v_q2), 'the next number, and nothing to total yet';
  update public.quotes set status = 'accepted' where id = v_q;
  assert (select stage = 'won' and closed_at is not null from public.enquiries where id = v_e), 'accepted: the enquiry is won';
  assert (select kind = 'customer' from public.customers where id = (select customer_id from public.enquiries where id = v_e)), 'and the lead a customer';
end $$;
select pg_temp.expect_error($q$insert into public.quotes (title, lines) values ('X', '[{"description": "Cake", "quantity": 1, "unit_price": 20, "vat_rate": 7}]')$q$, 'one of the IVA rates');
select pg_temp.expect_error($q$insert into public.quotes (title, lines) values ('X', '[{"description": " ", "quantity": 1, "unit_price": 20, "vat_rate": 10}]')$q$, 'needs a description');
select pg_temp.expect_error($q$insert into public.quotes (title, lines) values ('X', '[{"description": "Cake", "unit_price": 20, "vat_rate": 10}]')$q$, 'a quantity above 0');

-- 3. Campaigns: a subject only for email, sent keeps when and how many ------------------------------
do $$
declare v_c uuid;
begin
  insert into public.campaigns (name, channel, subject, body) values ('  Pumpkin spice ', 'sms', 'Ignored', 'Back on Friday') returning id into v_c;
  assert (select name = 'Pumpkin spice' and subject is null and sent_at is null from public.campaigns where id = v_c), 'tidied; texts have no subject';
  update public.campaigns set status = 'sent', recipients = 4 where id = v_c;
  assert (select sent_at is not null and recipients = 4 from public.campaigns where id = v_c), 'sent: when and how many';
  update public.campaigns set status = 'draft' where id = v_c;
  assert (select sent_at is null and recipients is null from public.campaigns where id = v_c), 'back to a draft: not sent';
end $$;
select pg_temp.expect_error($q$insert into public.campaigns (name, status) values ('X', 'scheduled')$q$, 'campaigns_planned');
select pg_temp.expect_error($q$select public.campaign_reminders()$q$, 'permission denied');

-- 4. The nightly reminders: once each, to the admins ------------------------------------------------
do $$ begin
  insert into public.enquiries (customer_id, title, follow_up_on) values ((select id from public.customers where first_name = 'Hannah'), 'Office coffee', current_date - 1);
  insert into public.enquiries (customer_id, title, follow_up_on) values ((select id from public.customers where first_name = 'Hannah'), 'Later', current_date + 3);
  insert into public.campaigns (name, status, scheduled_at, subject, channel) values ('October regulars', 'scheduled', now() - interval '1 hour', 'Oat milk on us', 'email');
  insert into public.campaigns (name, status, scheduled_at) values ('November', 'scheduled', now() + interval '20 days');
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$
declare n_admins int := (select count(*) from public.profiles where role = 'admin' and active);
begin
  assert public.enquiry_follow_ups() = 1, 'only the open enquiry whose day has come';
  assert (select count(*) from public.notifications where title = 'Follow up: Office coffee' and link = '/leads') = n_admins, 'every active admin hears (nobody is assigned)';
  assert public.enquiry_follow_ups() = 0, 'once per day set';
  assert public.campaign_reminders() = 1, 'only the campaign planned for today';
  assert (select count(*) from public.notifications where title = 'Time to send: October regulars' and body = 'Oat milk on us') = n_admins, 'with its subject';
  assert public.campaign_reminders() = 0, 'once';
end $$;

-- 5. Employees see and change none of it --------------------------------------------------------------
select pg_temp.act_as('julio@test');
do $$ declare n int; begin
  assert (select count(*) from public.enquiries) = 0 and (select count(*) from public.quotes) = 0 and (select count(*) from public.campaigns) = 0, 'employees see none';
  update public.quotes set total = 0; get diagnostics n = row_count;
  assert n = 0, 'and change none';
end $$;
select pg_temp.expect_error($q$insert into public.campaigns (name) values ('Sneaky')$q$, 'row-level security');
select pg_temp.expect_error($q$select public.enquiry_follow_ups()$q$, 'permission denied');

reset role;
select set_config('request.jwt.claim.sub', '', false);
