-- Reviews in the app's language: a review's words in the app's other language, by language ({"en": "…"}
-- or {"es": "…"}), so the Reviews page follows English or Spanish. Google's own translation when it sends one
-- with the review, else one the Worker makes the first time the page is opened in that language
-- (worker/reviewTranslations.ts). Admins read and write reviews as before (the `reviews_website` migration).
-- The code live before this keeps working: it never names the column, and it has a default.

alter table public.reviews add column translations jsonb not null default '{}'::jsonb
  check (jsonb_typeof(translations) = 'object' and pg_column_size(translations) < 20000);
