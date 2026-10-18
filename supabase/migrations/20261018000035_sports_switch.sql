-- Sports (fixtures, live scores, big nights on Today) is a business-wide switch, off until an
-- admin turns it on from the Sports page. While it's off nothing is fetched from the sports sources.
alter table public.business add column sports_enabled boolean not null default false;
