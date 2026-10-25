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

// ---------------- Competitors: other places, by id, nearby or by name ----------------
// The Competitors page follows other cafés through the same key. Each answer is billed by the most
// detailed field asked for, so lists ask for what a list shows and only following (or the weekly
// check of) a place asks for everything (rating, hours and what it offers). See shared/refresh.ts.

/** A place as a list shows it. */
export interface PlaceSummary {
  id: string
  name: string
  address: string | null
  location: { lat: number; lng: number } | null
  rating: number | null
  count: number | null
  priceLevel: string | null
  primaryType: string | null
  mapsUrl: string | null
  status: string | null
}

/** A place followed: everything about it Google has, `raw` for what it offers (shared/localCompetitors featuresFromGoogle). */
export interface PlaceDetails extends PlaceSummary {
  website: string | null
  periods: { open?: { day?: number; hour?: number; minute?: number }; close?: { day?: number; hour?: number; minute?: number } }[] | null
  raw: Record<string, unknown>
}

interface ApiPlace {
  id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude?: number; longitude?: number }
  rating?: number; userRatingCount?: number; priceLevel?: string; primaryType?: string; googleMapsUri?: string; businessStatus?: string
  websiteUri?: string; regularOpeningHours?: { periods?: PlaceDetails['periods'] }
}

const SUMMARY = ['id', 'displayName', 'formattedAddress', 'location', 'rating', 'userRatingCount', 'priceLevel', 'primaryType', 'googleMapsUri', 'businessStatus']
/** What a place offers, as Google answers it (the names shared/localCompetitors FEATURES reads). */
const OFFER = ['outdoorSeating', 'liveMusic', 'menuForChildren', 'servesDessert', 'goodForChildren', 'allowsDogs', 'restroom', 'goodForWatchingSports',
  'paymentOptions', 'parkingOptions', 'accessibilityOptions', 'takeout', 'delivery', 'reservable', 'servesBreakfast', 'servesLunch', 'servesBrunch',
  'servesBeer', 'servesWine', 'servesVegetarianFood']
/** Cafés and what competes with them for a coffee or breakfast. */
const CAFE_TYPES = ['cafe', 'coffee_shop', 'bakery', 'breakfast_restaurant', 'brunch_restaurant', 'juice_shop', 'tea_house', 'cafeteria']
const CORE_TYPES = ['cafe', 'coffee_shop', 'bakery']

const summary = (p: ApiPlace): PlaceSummary => ({
  id: p.id ?? '', name: p.displayName?.text ?? '', address: p.formattedAddress ?? null,
  location: p.location?.latitude !== undefined && p.location?.longitude !== undefined ? { lat: p.location.latitude, lng: p.location.longitude } : null,
  rating: p.rating ?? null, count: p.userRatingCount ?? null, priceLevel: p.priceLevel ?? null, primaryType: p.primaryType ?? null,
  mapsUrl: p.googleMapsUri ?? null, status: p.businessStatus ?? null,
})

async function places<T>(apiKey: string, path: string, fields: string, body?: unknown, language = 'es'): Promise<T> {
  const res = await fetch(`https://places.googleapis.com/v1/${path}${body ? '' : `?languageCode=${language}`}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-goog-api-key': apiKey, 'x-goog-fieldmask': fields, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify({ languageCode: language, ...body }) : undefined,
  })
  const json = await res.json().catch(() => ({})) as T & { error?: { message?: string } }
  if (!res.ok) throw new Error(`Google Places: ${json.error?.message ?? res.status}`)
  return json
}

/** Everything about one place: for following it, and its weekly check. */
export async function placeDetails(apiKey: string, placeId: string): Promise<PlaceDetails> {
  const p = await places<ApiPlace & Record<string, unknown>>(apiKey, `places/${encodeURIComponent(placeId)}`,
    [...SUMMARY, 'websiteUri', 'regularOpeningHours', ...OFFER].join(','))
  return { ...summary(p), id: p.id ?? placeId, website: p.websiteUri ?? null, periods: p.regularOpeningHours?.periods ?? null, raw: p }
}

/** The cafés nearest a point within a radius (Google gives up to 20). */
export async function nearbyCafes(apiKey: string, centre: { lat: number; lng: number }, radius: number): Promise<PlaceSummary[]> {
  const ask = (types: string[]) => places<{ places?: ApiPlace[] }>(apiKey, 'places:searchNearby', SUMMARY.map(f => `places.${f}`).join(','), {
    includedTypes: types, maxResultCount: 20, rankPreference: 'DISTANCE',
    locationRestriction: { circle: { center: { latitude: centre.lat, longitude: centre.lng }, radius } },
  })
  // Should Google stop knowing one of the types, ask again with the ones it always has.
  const res = await ask(CAFE_TYPES).catch(e => (/type/i.test(String(e)) ? ask(CORE_TYPES) : Promise.reject(e)))
  return (res.places ?? []).map(summary).filter(p => p.id && p.name)
}

/** Places by name (or a kind of place and a town), near a point when there is one. */
export async function findPlaces(apiKey: string, query: string, near: { lat: number; lng: number } | null): Promise<PlaceSummary[]> {
  const res = await places<{ places?: ApiPlace[] }>(apiKey, 'places:searchText', SUMMARY.map(f => `places.${f}`).join(','), {
    textQuery: query, pageSize: 10,
    ...(near ? { locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 20000 } } } : {}),
  })
  return (res.places ?? []).map(summary).filter(p => p.id && p.name)
}
