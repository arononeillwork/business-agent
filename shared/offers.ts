// Offers & specials: a special or an offer for a set time, with its price and picture, shown on the
// screens picked from the minute it starts to the minute it ends (in turn with each screen's other
// slides, or on its own), and its story or post on the Social planner. Shared by the app, the
// demo and the screens, which put each offer on and take it off by their own clock.
import { localDate, zonedIso } from './time'
import { msg } from './i18n'

/** turns: one of the screen's slides, in turn with the others. only: the screen shows just the offer. */
export type ScreenMode = 'turns' | 'only'

export interface Offer {
  id: string
  title: string
  details: string | null
  /** As shown: "€3.50", "2 for 1", "20% off". */
  price: string | null
  /** What it usually costs, shown crossed out. */
  was_price: string | null
  image_url: string | null
  starts_at: string
  ends_at: string
  /** The screens it shows on while it's on. */
  screen_ids: string[]
  screen_mode: ScreenMode
  /** How long it shows each time round, in turn with the other slides. */
  seconds: number
  /** Its story or post on the Social planner. */
  post_id: string | null
  /** Off: kept, but on no screen. */
  active: boolean
  updated_at: string
  /** A last-day offer (shared/lastDayOffers): the stock item, its rule, and the day it went on by itself (null: added by hand). */
  stock_item_id?: string | null
  last_day_rule_id?: string | null
  auto_for?: string | null
}
export type OfferInput = Omit<Offer, 'id' | 'updated_at'> & { id?: string }

/** What a screen's link gets of each offer on it (display_feed()). */
export type ScreenOffer = Pick<Offer, 'id' | 'title' | 'details' | 'price' | 'was_price' | 'image_url' | 'starts_at' | 'ends_at' | 'screen_mode' | 'seconds'>

export const OFFER_SECONDS = [8, 10, 15, 20, 30, 45, 60]
/** The longest an offer runs: three months (a week's or a month's special fits). */
export const MAX_OFFER_DAYS = 92

/** How long it's on for, from when it starts. */
export type OfferLength = '1h' | '2h' | '3h' | 'today' | '24h' | '3d' | '7d' | 'custom'
export const LENGTHS: { id: OfferLength; label: string }[] = [
  { id: '1h', label: msg('1 hour') },
  { id: '2h', label: msg('2 hours') },
  { id: '3h', label: msg('3 hours') },
  { id: 'today', label: msg('Until the end of the day') },
  { id: '24h', label: msg('24 hours (as long as a story)') },
  { id: '3d', label: msg('3 days') },
  { id: '7d', label: msg('A week') },
  { id: 'custom', label: msg('Until a time I pick') },
]
const HOURS: Partial<Record<OfferLength, number>> = { '1h': 1, '2h': 2, '3h': 3, '24h': 24, '3d': 72, '7d': 168 }

/** When an offer that starts then, for that long, ends ("the end of the day": 23:59 there). */
export function endFor(starts: string, length: Exclude<OfferLength, 'custom'>, tz: string): string {
  if (length === 'today') return zonedIso(localDate(starts, tz), '23:59', tz)
  return new Date(Date.parse(starts) + HOURS[length]! * 3_600_000).toISOString()
}

/** Which of the lengths an offer's times are (else custom), for editing it. */
export function lengthOf(starts: string, ends: string, tz: string): OfferLength {
  const hit = LENGTHS.find(l => l.id !== 'custom' && Date.parse(endFor(starts, l.id, tz)) === Date.parse(ends))
  return hit?.id ?? 'custom'
}

export const newOffer = (now = Date.now()): OfferInput => {
  // From the next quarter of an hour, for two hours.
  const starts = new Date(Math.ceil(now / 900_000) * 900_000).toISOString()
  return { title: '', details: null, price: null, was_price: null, image_url: null, starts_at: starts, ends_at: endFor(starts, '2h', 'UTC'),
    screen_ids: [], screen_mode: 'turns', seconds: 15, post_id: null, active: true }
}

/** What stops this offer being saved as it is, in plain words (null: fine). The database checks the same. */
export function offerProblem(o: Pick<OfferInput, 'title' | 'details' | 'price' | 'was_price' | 'image_url' | 'starts_at' | 'ends_at' | 'seconds' | 'screen_ids'>): string | null {
  if (!o.title.trim()) return msg('Give the offer a name')
  if (o.title.trim().length > 80) return msg('Keep the offer’s name under 80 characters')
  if ((o.details ?? '').trim().length > 300) return msg('Keep the details under 300 characters')
  if ((o.price ?? '').trim().length > 40 || (o.was_price ?? '').trim().length > 40) return msg('Keep the prices short')
  // A drawn or uploaded picture in the demo (data: and blob: addresses) is let through here; the database takes https only.
  const image = (o.image_url ?? '').trim()
  if (image && !/^(data:image\/|blob:)/.test(image) && !/^https:\/\/\S+$/i.test(image)) return msg('The picture’s address should start with https://')
  const starts = Date.parse(o.starts_at), ends = Date.parse(o.ends_at)
  if (Number.isNaN(starts) || Number.isNaN(ends)) return msg('Pick when the offer starts and ends')
  if (ends <= starts) return msg('The offer has to end after it starts')
  if (ends - starts > MAX_OFFER_DAYS * 86_400_000) return msg('An offer can run for up to three months')
  if (!(o.seconds >= 3 && o.seconds <= 3600)) return msg('Show it for between 3 seconds and an hour')
  if (o.screen_ids.length > 50) return msg('An offer can be on up to 50 screens')
  return null
}

export type OfferState = 'coming' | 'on' | 'ended' | 'off'
/** Coming up, on now, ended, or switched off. */
export function offerState(o: Pick<Offer, 'starts_at' | 'ends_at' | 'active'>, now = Date.now()): OfferState {
  if (!o.active) return 'off'
  if (now < Date.parse(o.starts_at)) return 'coming'
  return now < Date.parse(o.ends_at) ? 'on' : 'ended'
}

/** The offers on now, in the order they started. */
export const liveOffers = <T extends Pick<ScreenOffer, 'starts_at' | 'ends_at'>>(offers: T[], now = Date.now()): T[] =>
  offers.filter(o => Date.parse(o.starts_at) <= now && now < Date.parse(o.ends_at))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))

/** The next time an offer starts or ends after now (ms), so a screen changes right then; null: none. */
export function nextChange(offers: Pick<ScreenOffer, 'starts_at' | 'ends_at'>[], now = Date.now()): number | null {
  const ahead = offers.flatMap(o => [Date.parse(o.starts_at), Date.parse(o.ends_at)]).filter(t => t > now)
  return ahead.length ? Math.min(...ahead) : null
}

/** An offer as one of a screen's slides. */
export interface OfferSlide { id: string; kind: 'offer'; offer: ScreenOffer; seconds: number; title: string; active: true }
export const offerSlide = (o: ScreenOffer): OfferSlide => ({ id: `offer-${o.id}`, kind: 'offer', offer: o, seconds: o.seconds, title: o.title, active: true })

/**
 * What a screen plays with these offers on: an offer on its own takes the screen (with any other
 * offer on its own then, in turn); otherwise the offers come first each time round, then the slides.
 */
export function withOffers<T>(order: T[], live: ScreenOffer[]): (T | OfferSlide)[] {
  const only = live.filter(o => o.screen_mode === 'only')
  if (only.length) return only.map(offerSlide)
  return [...live.map(offerSlide), ...order]
}

/** The days an offer runs on, in that time zone (its first and last), for "today" or "until Sunday". */
export function offerDays(o: Pick<Offer, 'starts_at' | 'ends_at'>, tz: string): { first: string; last: string } {
  // Ending at midnight sharp is the day before's.
  const last = localDate(new Date(Date.parse(o.ends_at) - 1), tz)
  return { first: localDate(o.starts_at, tz), last }
}
