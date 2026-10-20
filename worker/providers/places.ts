// Google's public listing for the business (Places API, New): its rating, how many reviews it has,
// and the 5 newest reviews. No replying, and Google may leave reviews out altogether for some
// projects (it does for EEA billing accounts at times); the business's own profile has them all.
// Used by the Reviews page only until Google approves Business Profile access.
export interface PlaceReviews {
  rating: number | null
  count: number | null
  reviews: { name: string; rating: number; text: string | null; language: string | null; author: string; publishTime: string | null; url: string | null }[]
}

interface ApiReview {
  name?: string; rating?: number; publishTime?: string; googleMapsUri?: string
  text?: { text?: string; languageCode?: string }; originalText?: { text?: string; languageCode?: string }
  authorAttribution?: { displayName?: string }
}

export async function placeReviews(apiKey: string, placeId: string, language = 'es'): Promise<PlaceReviews> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=${language}`, {
    headers: { 'x-goog-api-key': apiKey, 'x-goog-fieldmask': 'rating,userRatingCount,reviews' },
  })
  const json = await res.json().catch(() => ({})) as { rating?: number; userRatingCount?: number; reviews?: ApiReview[]; error?: { message?: string } }
  if (!res.ok) throw new Error(`Google Places: ${json.error?.message ?? res.status}`)
  return {
    rating: json.rating ?? null,
    count: json.userRatingCount ?? null,
    reviews: (json.reviews ?? []).filter(r => r.name && r.rating).map(r => ({
      name: r.name!, rating: r.rating!,
      // The original words, not Google's translation into the language asked for.
      text: r.originalText?.text ?? r.text?.text ?? null,
      language: r.originalText?.languageCode ?? r.text?.languageCode ?? null,
      author: r.authorAttribution?.displayName ?? '',
      publishTime: r.publishTime ?? null,
      url: r.googleMapsUri ?? null,
    })),
  }
}
