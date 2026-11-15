-- The business's reviews and posts on its website (the website_reviews_posts migration): both off until
-- the business turns them on, each on its own; the seed only touches Easy Beans. Nothing made here stays.

begin;

reset role;
select set_config('app.business_id', '1', false);
do $$ begin
  assert (select not website_reviews and not website_posts from public.settings where business_id = 1), 'off for a business that isn''t Easy Beans';
end $$;
update public.settings set website_reviews = true where business_id = 1;
do $$ begin
  assert (select website_reviews and not website_posts from public.settings where business_id = 1), 'each switch is its own';
end $$;
update public.settings set website_posts = true where business_id = 1;
do $$ begin
  assert (select website_posts from public.settings where business_id = 1), 'an admin turns posts on';
end $$;

rollback;
