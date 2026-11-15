// The business's Google rating and reviews a website shows, read from the app (GET
// /api/site/<business>/reviews, worker/site.ts): what the Reviews page keeps, so the website shows the
// same rating and reviews as Google Maps without a Google key of its own. The app reads Google (the
// business's own profile every hour, or the public listing every 3 hours: worker/reviews.ts); the
// website only reads what's kept here, so a website asking often never costs a look-up at Google.
//
// A contract with websites outside the app, like the menu (shared/websiteFeed.ts): fields are added,
// never renamed or removed, and `version` changes if one ever must. docs/WEBSITE.md says how to use it.
import type { Review, ReviewFeed, ReviewLanguage } from './reviews'

export interface SiteReviewsFeed {
  version: 1
  business: { id: number; name: string }
  /** Where the app reads them: the business's own Google profile (all of them) or the public listing (Places: the 5 newest); null: neither yet. */
  source: ReviewFeed | null
  /** Google's average, one decimal (4.7), and how many reviews it's from; null: none yet. */
  rating: number | null
  count: number | null
  /** The business on Google Maps, and Google's page for leaving a review; null when the app doesn't know its place. */
  maps_url: string | null
  write_review_url: string | null
  /** Reviews with words from someone named, newest first (the website picks which to show). */
  reviews: SiteReview[]
  /** When Google was last read; null: not yet. */
  checked_at: string | null
  /** When this answer was made. */
  generated_at: string
}

export interface SiteReview {
  /** Google's id for the review: stays the same. */
  id: string
  rating: 1 | 2 | 3 | 4 | 5
  text: string
  /** The name they review under on Google. */
  reviewer: string
  created_at: string
  /** The language it's written in, as far as the app can tell. */
  language: ReviewLanguage
  /** The business's public reply on Google, if it replied. */
  reply: string | null
  /** Google Maps' page for the review, when Google gives one (Places only). */
  url: string | null
  /** Photos they added with it (the business's own profile only), oldest first. */
  photos: { url: string; thumb: string | null }[]
}

/** Most reviews in one answer. */
export const SITE_REVIEWS = 50

export interface ReviewsInput {
  business: { id: number; name: string }
  /** What the Reviews page keeps (public.reviews), any order. */
  kept: Pick<Review, 'id' | 'rating' | 'text' | 'reviewer' | 'created_at' | 'reply' | 'language' | 'url' | 'photos'>[]
  /** What the app last read from Google (the `reviews` answer kept in provider_cache); null: never read. */
  last: { feed: ReviewFeed | null; google_rating: number | null; google_count: number | null } | null
  checkedAt: string | null
  mapsUrl: string | null
  /** The business's Google place, for the "write a review" page. */
  placeId: string | null
  now?: Date
}

const oneDecimal = (n: number) => Math.round(n * 10) / 10

/**
 * The reviews feed for a website. The rating is Google's own when the listing gives it (Places); from
 * the business's own profile, which gives every review, it's worked out from them all, star-only ones
 * included, as Google does.
 */
export function siteReviews(input: ReviewsInput): SiteReviewsFeed {
  const source = input.last?.feed ?? null
  const all = input.kept.filter(r => r.rating >= 1 && r.rating <= 5)
  const google = source === 'places' && input.last?.google_rating ? { rating: input.last.google_rating, count: input.last.google_count } : null
  const rating = google ? oneDecimal(google.rating) : all.length ? oneDecimal(all.reduce((s, r) => s + r.rating, 0) / all.length) : null
  const count = google ? google.count ?? null : all.length || null
  const place = input.placeId?.trim() || null
  return {
    version: 1,
    business: input.business,
    source,
    rating,
    count,
    maps_url: input.mapsUrl && /^https:\/\//.test(input.mapsUrl) ? input.mapsUrl
      : place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(input.business.name)}&query_place_id=${encodeURIComponent(place)}` : null,
    write_review_url: place ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(place)}` : null,
    reviews: all
      .filter(r => r.text?.trim() && r.reviewer.trim())
      .sort((a, z) => z.created_at.localeCompare(a.created_at))
      .slice(0, SITE_REVIEWS)
      .map(r => ({
        id: r.id, rating: r.rating, text: r.text!.trim(), reviewer: r.reviewer.trim(), created_at: r.created_at, language: r.language,
        reply: r.reply?.trim() || null, url: r.url && /^https:\/\//.test(r.url) ? r.url : null,
        photos: (r.photos ?? []).filter(p => /^https:\/\//.test(p.url)).map(p => ({ url: p.url, thumb: p.thumb && /^https:\/\//.test(p.thumb) ? p.thumb : null })),
      })),
    checked_at: input.checkedAt,
    generated_at: (input.now ?? new Date()).toISOString(),
  }
}
