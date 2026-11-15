-- Photos on Google reviews (Reviews page): the photos a reviewer added with their review, read from
-- the listing's customer photos along with the reviews (worker/reviews.ts photosFor), as Google hosts
-- them: [{ "url": "https://…", "thumb": "https://…" | null }], oldest first, up to 20. Google's
-- addresses for them change over time, so the Worker writes them afresh each time it reads the reviews.
-- Reviews read from the public listing (Places) have none.
alter table public.reviews
  add column photos jsonb not null default '[]'::jsonb
    check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 20);
