-- The business's Google rating and reviews, and its latest Instagram posts, on its own website: the
-- website reads them from the app (GET /api/site/<business>/reviews and /posts, worker/site.ts,
-- shared/websiteReviews.ts and shared/websitePosts.ts) rather than from Google and Instagram itself,
-- so it needs no keys of its own and a business connects Google Maps and Instagram once, on Connections.
-- Each business turns each on for itself (Website & SEO); off, the address answers "not found", as for
-- a number that's no business. Admins change them (settings_write).
alter table public.settings
  add column website_reviews boolean not null default false,
  add column website_posts boolean not null default false;

-- Easy Beans' website (easybeanscoffee.com) shows its Google rating and its Instagram posts, read until
-- now with its own Google and Instagram keys: from here on it reads them from the app.
update public.settings set website_reviews = true, website_posts = true
 where business_id = 1 and exists (select 1 from public.business where id = 1 and name ilike 'easy beans%');
