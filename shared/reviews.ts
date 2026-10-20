// Reviews: what people say about the business on Google, with the figures for the Reviews page
// (average, spread of stars, month by month, how many got a reply and how fast) and reply
// templates the admin edits before sending. No AI writes replies: the templates are plain text in
// the review's language, Spanish or English.
import { msg } from './i18n'

export type ReviewSource = 'google'
/** Where the reviews came from: the business's own Google profile (all of them, with replies) or Google's public listing (the 5 newest, no replies). */
export type ReviewFeed = 'business_profile' | 'places'
export type ReviewLanguage = 'es' | 'en'

export interface Review {
  id: string
  source: ReviewSource
  rating: 1 | 2 | 3 | 4 | 5
  text: string | null
  reviewer: string
  created_at: string
  reply: string | null
  replied_at: string | null
  language: ReviewLanguage
  /** Google Maps' page for it, when Google gives one. */
  url: string | null
}

export interface ReviewsState {
  /** null: no way to read reviews yet (Google Maps not connected, no Places key). */
  feed: ReviewFeed | null
  /** Only the business's own profile can be replied to. */
  can_reply: boolean
  /** Google's own totals for the listing, when it gives them (Places): all reviews, not only those read. */
  google_rating: number | null
  google_count: number | null
  reviews: Review[]
  /** Why reviews can't be read right now, in words an admin can act on. */
  problem: string | null
}

/** Google gives stars as words on the business profile. */
const STARS: Record<string, Review['rating']> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }
export function starsOf(v: unknown): Review['rating'] | null {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5) return v as Review['rating']
  return typeof v === 'string' ? STARS[v.toUpperCase()] ?? null : null
}

// Whole words only, accented letters included (\b doesn't count "é" as a letter).
const words = (list: string) => new RegExp(`(?<!\\p{L})(?:${list})(?!\\p{L})`, 'giu')
const SPANISH = words('el|la|los|las|muy|para|pero|con|por|que|una|está|café|gracias|buen[oa]?|rico|riquísim[oa]|excelente|atención|sitio|lugar|recomiendo|también|mejor|todo|nos|fue|precio|amable|personal')
const ENGLISH = words('the|and|very|but|with|for|was|were|great|lovely|friendly|staff|place|amazing|coffee|really|recommend|best|nice|good|delicious|definitely|would|again')

/** Spanish or English, from the words in it (English when there's nothing to go on). */
export function guessLanguage(text: string | null | undefined): ReviewLanguage {
  const t = text ?? ''
  const es = (t.match(SPANISH)?.length ?? 0) + (/[ñ¿¡]/.test(t) ? 1 : 0)
  const en = t.match(ENGLISH)?.length ?? 0
  return es > en ? 'es' : 'en'
}

export interface ReviewSummary {
  count: number
  average: number | null
  /** How many of each star, 5 down to 1. */
  stars: { rating: Review['rating']; count: number }[]
  /** Month by month (YYYY-MM), oldest first: reviews and their average. */
  months: { month: string; count: number; average: number }[]
  /** Share of reviews with a reply (0–1); null when there are none. */
  reply_rate: number | null
  /** Average hours from review to reply, for the ones replied to. */
  reply_hours: number | null
  unanswered: number
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function summarise(reviews: Review[]): ReviewSummary {
  const count = reviews.length
  const average = count ? round1(reviews.reduce((s, r) => s + r.rating, 0) / count) : null
  const stars = ([5, 4, 3, 2, 1] as const).map(rating => ({ rating, count: reviews.filter(r => r.rating === rating).length }))
  const byMonth = new Map<string, number[]>()
  for (const r of reviews) {
    const m = r.created_at.slice(0, 7)
    byMonth.set(m, [...(byMonth.get(m) ?? []), r.rating])
  }
  const months = [...byMonth].sort(([a], [b]) => a.localeCompare(b))
    .map(([month, rs]) => ({ month, count: rs.length, average: round1(rs.reduce((s, x) => s + x, 0) / rs.length) }))
  const replied = reviews.filter(r => r.reply)
  const timed = replied.filter(r => r.replied_at && Date.parse(r.replied_at) >= Date.parse(r.created_at))
  const reply_hours = timed.length
    ? round1(timed.reduce((s, r) => s + (Date.parse(r.replied_at!) - Date.parse(r.created_at)) / 3_600_000, 0) / timed.length)
    : null
  return { count, average, stars, months, reply_rate: count ? replied.length / count : null, reply_hours, unanswered: count - replied.length }
}

export type ReviewFilter = 'all' | 'unanswered' | 'low' | 'high'
export const REVIEW_FILTERS: { id: ReviewFilter; label: string }[] = [
  { id: 'all', label: msg('All') },
  { id: 'unanswered', label: msg('No reply yet') },
  { id: 'low', label: msg('1 to 3 stars') },
  { id: 'high', label: msg('4 and 5 stars') },
]
export function filterReviews(reviews: Review[], f: ReviewFilter) {
  if (f === 'unanswered') return reviews.filter(r => !r.reply)
  if (f === 'low') return reviews.filter(r => r.rating <= 3)
  if (f === 'high') return reviews.filter(r => r.rating >= 4)
  return reviews
}

/** A low rating that's worth a quick, careful reply (and a flag on the notification). */
export const isLow = (r: Pick<Review, 'rating'>) => r.rating <= 3

const firstName = (name: string) => name.trim().split(/\s+/)[0] || ''

/**
 * A reply to start from, in the review's language: thanks for 4–5 stars, thanks and an invitation
 * back for 3, an apology and a way to talk for 1–2. The admin edits it before it's sent.
 */
export function suggestedReply(r: Pick<Review, 'rating' | 'reviewer' | 'language'>, business: string, contact?: string | null): string {
  const name = firstName(r.reviewer)
  if (r.language === 'es') {
    const hi = name ? `¡Hola, ${name}!` : '¡Hola!'
    if (r.rating >= 4) return `${hi} Muchísimas gracias por tu reseña. Nos alegra mucho que te haya gustado ${business}. ¡Te esperamos pronto para el próximo café!`
    if (r.rating === 3) return `${hi} Gracias por contarnos tu experiencia. Tomamos nota para mejorar y nos encantaría que nos dieras otra oportunidad en tu próxima visita.`
    return `${name ? `Hola, ${name}.` : 'Hola.'} Sentimos mucho que tu visita no fuera como esperabas. Nos gustaría saber más y arreglarlo: ${contact ? `escríbenos a ${contact}` : 'pregunta por nosotros en tu próxima visita'}. Gracias por decírnoslo.`
  }
  const hi = name ? `Hi ${name},` : 'Hi,'
  if (r.rating >= 4) return `${hi} thank you so much for your review! We're really glad you enjoyed ${business}. See you soon for the next coffee!`
  if (r.rating === 3) return `${hi} thanks for telling us about your visit. We've taken note so we can do better, and we'd love to welcome you back.`
  return `${hi} we're very sorry your visit wasn't what you hoped for. We'd like to hear more and put it right: ${contact ? `please write to us at ${contact}` : 'please ask for us next time you’re in'}. Thank you for letting us know.`
}

/** Nothing to read reviews from yet (shown as is, and translated on the page). */
export const CONNECT_MAPS = msg('Connect Google Maps on the Connections page to read and reply to your Google reviews.')

/** Google lets a reply be up to 4,096 characters. */
export const MAX_REPLY = 4096
