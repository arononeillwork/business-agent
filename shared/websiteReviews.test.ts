// The reviews feed a website reads (shared/websiteReviews.ts): Google's rating one decimal, only reviews
// a website can show, and only https links.
import { describe, expect, it } from 'vitest'
import { SITE_REVIEWS, siteReviews, type ReviewsInput } from './websiteReviews'

const kept = (n: number, more: Partial<ReviewsInput['kept'][number]> = {}): ReviewsInput['kept'][number] => ({
  id: `r${n}`, rating: 5, text: `Review ${n}`, reviewer: 'Ana', created_at: `2026-10-${String(n).padStart(2, '0')}T10:00:00Z`,
  reply: null, language: 'en', url: null, photos: [], ...more,
})
const base: ReviewsInput = { business: { id: 1, name: 'Easy Beans Coffee' }, kept: [], last: null, checkedAt: null, mapsUrl: null, placeId: null, now: new Date('2026-11-15T10:00:00Z') }

describe('the reviews feed', () => {
  it('has no rating, links or reviews before Google is first read', () => {
    expect(siteReviews(base)).toEqual({
      version: 1, business: { id: 1, name: 'Easy Beans Coffee' }, source: null, rating: null, count: null, maps_url: null, write_review_url: null,
      reviews: [], checked_at: null, generated_at: '2026-11-15T10:00:00.000Z',
    })
  })

  it('works the rating out from every review, one decimal, as Google shows it', () => {
    const feed = siteReviews({ ...base, last: { feed: 'business_profile', google_rating: null, google_count: null },
      kept: [kept(1, { rating: 5 }), kept(2, { rating: 5 }), kept(3, { rating: 4 })] })
    expect([feed.rating, feed.count]).toEqual([4.7, 3])
  })

  it('links to Google’s page for leaving a review from the business’s place', () => {
    const feed = siteReviews({ ...base, placeId: 'ChIJ x' })
    expect(feed.write_review_url).toBe('https://search.google.com/local/writereview?placeid=ChIJ%20x')
    expect(feed.maps_url).toBe('https://www.google.com/maps/search/?api=1&query=Easy%20Beans%20Coffee&query_place_id=ChIJ%20x')
  })

  it('gives at most 50, newest first, and only https links and photos', () => {
    const many = Array.from({ length: 60 }, (_, i) => kept(i + 1, { created_at: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString() }))
    many.push(kept(99, { created_at: '2027-01-01T00:00:00Z', url: 'http://maps.test/r', photos: [{ url: 'http://x.test/p.jpg', thumb: null }, { url: 'https://x.test/q.jpg', thumb: 'http://x.test/t.jpg' }] }))
    const feed = siteReviews({ ...base, kept: many })
    expect(feed.reviews).toHaveLength(SITE_REVIEWS)
    expect(feed.reviews[0]).toMatchObject({ id: 'r99', url: null, photos: [{ url: 'https://x.test/q.jpg', thumb: null }] })
  })
})
