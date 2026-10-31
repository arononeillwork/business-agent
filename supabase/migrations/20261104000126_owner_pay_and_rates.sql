-- Owner pay: whether the owners' hours on the rota are paid as wages. On (the default), an owner on the
-- rota costs their pay rate like anyone else; off, their hours cost nothing on the Rota, Staff wages,
-- Profit & loss and Timecards. Either way the breakeven (the cost of running the business each day on
-- Sales, Finances and the staff kitty) counts the owners' hours at their rate: the business only truly
-- breaks even once their time is covered too.
-- The team reads it with the rest of the settings; only an owner (an admin with pay access) changes it,
-- and the server's own code (no signed-in user) may too, as for the other guarded columns.

alter table public.settings add column owner_pay boolean not null default true;

create or replace function public.guard_owner_pay() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.owner_pay is distinct from old.owner_pay and auth.uid() is not null and not public.can_see_pay() then
    raise exception 'Only an owner turns owner pay on or off';
  end if;
  return new;
end $$;
revoke execute on function public.guard_owner_pay() from public, anon, authenticated;
create trigger settings_owner_pay before update of owner_pay on public.settings
  for each row execute function public.guard_owner_pay();

-- Easy Beans (business 1): the pay rates the owner gave, from the café's opening in April 2026: Mark
-- €10 an hour, Maria €9. A rate already set for that day is left as it is; with nobody of that name
-- there, nothing is added.
insert into public.pay_rates (business_id, profile_id, effective_from, hourly_rate)
select 1, p.id, date '2026-04-01', r.rate
  from (values ('mark', 10.00), ('maria', 9.00)) r(name, rate)
  join lateral (select x.id from public.profiles x
                 where x.business_id = 1 and x.active and x.role in ('admin', 'employee')
                   and x.full_name ~* ('^\s*' || r.name || '\M')
                 order by x.created_at limit 1) p on true
 where not exists (select 1 from public.pay_rates y where y.profile_id = p.id and y.effective_from = date '2026-04-01');

-- And the Staff wages line on Finances, which was an estimate (€4,300 a month), becomes what November's
-- rota costs at those rates (owner pay on), with the employer's multiplier: the hours the team works now.
-- Finances → Staff wages keeps it in step from here.
update public.expenses e
   set amount = round(w.cost, 2),
       notes = 'From the rota: November 2026''s hours × each person''s pay rate (owner pay included). Finances → Staff wages shows it person by person.'
  from (select sum(greatest(0, extract(epoch from (s.ends_at - s.starts_at)) / 3600 - s.break_minutes / 60.0) * pr.hourly_rate)
               * coalesce((select st.employer_cost_multiplier from public.settings st where st.business_id = 1), 1) as cost
          from public.shifts s
          join lateral (select r.hourly_rate from public.pay_rates r
                         where r.profile_id = s.profile_id and r.effective_from <= (s.starts_at at time zone 'Europe/Madrid')::date
                         order by r.effective_from desc limit 1) pr on true
         where s.business_id = 1 and s.status = 'published'
           and (s.starts_at at time zone 'Europe/Madrid')::date between date '2026-11-01' and date '2026-11-30') w
 where e.business_id = 1 and e.name = 'Staff wages' and e.category = 'People' and w.cost > 0;
