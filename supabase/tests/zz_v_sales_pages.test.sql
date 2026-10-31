-- Leads & enquiries and Campaigns: tidied, admins only, an enquiry won making the person a customer,
-- and the nightly reminders for follow-ups and planned campaigns.
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

-- 2. Won (by hand, now there are no quotes): closed, and the lead is a customer ---------------------
do $$
declare v_e uuid := (select id from public.enquiries where title = 'Cakes for a baby shower');
begin
  update public.enquiries set stage = 'quoted' where id = v_e;
  assert (select closed_at is null from public.enquiries where id = v_e), 'quoted: still open';
  update public.enquiries set stage = 'won' where id = v_e;
  assert (select stage = 'won' and closed_at is not null from public.enquiries where id = v_e), 'won: closed';
  assert (select kind = 'customer' from public.customers where id = (select customer_id from public.enquiries where id = v_e)), 'and the lead a customer';
end $$;
do $$ begin
  assert to_regclass('public.quotes') is null, 'the quotes table is gone';
  assert not exists (select 1 from pg_proc where proname in ('quote_rules', 'quote_moves_enquiry')), 'and its functions';
end $$;

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
  assert (select count(*) from public.enquiries) = 0 and (select count(*) from public.campaigns) = 0, 'employees see none';
  update public.enquiries set notes = 'x'; get diagnostics n = row_count;
  assert n = 0, 'and change none';
end $$;
select pg_temp.expect_error($q$insert into public.campaigns (name) values ('Sneaky')$q$, 'row-level security');
select pg_temp.expect_error($q$select public.enquiry_follow_ups()$q$, 'permission denied');

reset role;
select set_config('request.jwt.claim.sub', '', false);

-- 6. Inactive campaigns and the suggestion each came from (the `campaign_inactive` migration) ---------
select pg_temp.act_as('maria@test');
do $$
declare v_c uuid;
begin
  assert not exists (select 1 from public.campaigns where inactive), 'campaigns start active';
  insert into public.campaigns (name, status, scheduled_at, idea) values ('Christmas menu', 'scheduled', now() - interval '1 hour', 'christmas') returning id into v_c;
  assert (select idea = 'christmas' and not inactive from public.campaigns where id = v_c), 'started from a suggestion, active';
  update public.campaigns set inactive = true where id = v_c;
  assert (select inactive and status = 'scheduled' from public.campaigns where id = v_c), 'an admin switches it off; it keeps the rest';
end $$;
select pg_temp.expect_error($q$insert into public.campaigns (name, idea) values ('X', 'Not a key!')$q$, 'check constraint');

reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  assert public.campaign_reminders() = 0, 'no reminder while it''s switched off';
  update public.campaigns set inactive = false where name = 'Christmas menu';
  assert public.campaign_reminders() = 1, 'switched back on, its day has come';
  assert (select count(*) from public.notifications where title = 'Time to send: Christmas menu') = (select count(*) from public.profiles where role = 'admin' and active), 'to every active admin';
end $$;

select pg_temp.act_as('julio@test');
do $$ declare n int; begin
  update public.campaigns set inactive = true; get diagnostics n = row_count;
  assert n = 0, 'employees switch none off';
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
