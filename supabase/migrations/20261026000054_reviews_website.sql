-- Reviews and Website & SEO (Marketing).
-- Reviews: every Google review the Worker has seen, so each new one is noticed once (admins get a
-- notification, a low rating flagged) and the Reviews page can show figures over time. Read from
-- the business's own Google profile (Google Maps connection) or, until Google approves that, from
-- the public listing (Places API: the 5 newest, no replies).
-- Website: the last SEO check and PageSpeed results, so the page opens instantly and the checks
-- (which fetch the website and Google) only run when asked, at most every few minutes.
-- Admins only.

create table public.reviews (
  id          text primary key check (char_length(id) <= 300),  -- Google's review id
  source      text not null default 'google' check (source in ('google')),
  rating      int not null check (rating between 1 and 5),
  text        text check (char_length(text) <= 10000),
  reviewer    text not null default '' check (char_length(reviewer) <= 200),
  created_at  timestamptz not null,
  reply       text check (char_length(reply) <= 4096),
  replied_at  timestamptz,
  language    text not null default 'en' check (language in ('es', 'en')),
  url         text check (url is null or url ~* '^https://'),
  seen_at     timestamptz not null default now()
);
create index reviews_created_idx on public.reviews (created_at desc);

alter table public.reviews enable row level security;
revoke all on public.reviews from anon;
create policy reviews_admin on public.reviews for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create trigger audit_reviews after insert or update or delete on public.reviews
  for each row execute function public.audit_row();

-- New reviews come up in the bell (kind 'review', data.review = its id).
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind is null or kind in ('instagram_mention', 'review'));

create table public.website_checks (
  id          int primary key default 1 check (id = 1),
  url         text check (url is null or url ~* '^https?://'),
  -- shared/seo.ts SeoReport, and PageSpeed per strategy ({ "mobile": PageSpeed, "desktop": PageSpeed }).
  report      jsonb check (report is null or jsonb_typeof(report) = 'object'),
  checked_at  timestamptz,
  pagespeed   jsonb not null default '{}'::jsonb check (jsonb_typeof(pagespeed) = 'object'),
  updated_at  timestamptz not null default now()
);
insert into public.website_checks (id) values (1) on conflict do nothing;

alter table public.website_checks enable row level security;
revoke all on public.website_checks from anon;
create policy website_checks_admin on public.website_checks for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
