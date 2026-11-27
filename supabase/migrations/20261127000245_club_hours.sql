-- The coffee club's free coffee at set times only (Sales → Coffee club → "Free coffee only at set times"), say
-- 9:00 to 11:00, on the days chosen (the business's own time). Square's automatic discount follows them (a time period
-- on its pricing rule, worker/coffeeClub.ts), the note on the till and the website's pass say them, and a coffee given
-- with the club's discount outside them is kept with why ("outside_hours") for an admin, rather than counted.

alter table public.coffee_club
  -- None: any time the café is open.
  add column hours_from time,
  add column hours_to time,
  -- ISO days, Monday 1 to Sunday 7.
  add column hours_days int[] not null default '{1,2,3,4,5,6,7}'
    check (cardinality(hours_days) between 1 and 7 and hours_days <@ '{1,2,3,4,5,6,7}'::int[]),
  -- The time period Square's pricing rule follows.
  add column square_time_period_id text check (char_length(square_time_period_id) <= 191),
  add constraint coffee_club_hours check ((hours_from is null) = (hours_to is null) and (hours_from is null or hours_from < hours_to));

alter table public.coffee_club_coffees drop constraint coffee_club_coffees_problem_check;
alter table public.coffee_club_coffees add constraint coffee_club_coffees_problem_check
  check (problem in ('no_customer', 'not_member', 'not_paid', 'over_limit', 'outside_hours'));
