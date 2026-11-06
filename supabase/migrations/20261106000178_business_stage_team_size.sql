-- Set-up guide, "Your business": whether the business is new or already open, how many people work
-- there and, for a new one, the day it opens. Asked once, right after the business is made (each
-- question can be skipped); changed later on the Business page. Read with the rest of the business
-- (business_read); admins change them (business_write).
alter table public.business
  add column stage text check (stage in ('new', 'open')),
  add column team_size text check (team_size in ('1', '2-5', '6-15', '16-50', '50+')),
  add column opens_on date;

comment on column public.business.stage is 'new: just starting out; open: already trading. Null until asked.';
comment on column public.business.team_size is 'How many people work there, the owner included: 1, 2-5, 6-15, 16-50 or 50+.';
comment on column public.business.opens_on is 'A new business: the day it opens, when it knows.';
