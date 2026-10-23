// Competitors (Marketing): the cafés around the business. What each one charges for the same basket
// of drinks and food, what it offers (a terrace, plant milks, brunch…), its hours, how it does on
// Google over time, and notes from visits with ideas worth borrowing. The business is a row too
// (is_self) so it's compared on the same terms; its prices come from Menu costing where an item is
// linked to a menu item. Everything below is pure and shared: the page shows it, the AI tools say it.
// (Not to be confused with shared/competitors.ts: Business Agent's own comparison with Square.)
import { msg } from './i18n'
import { addDays } from './time'
import type { DayKey, OpeningHours } from './types'

export type CompetitorKind = 'specialty' | 'cafe' | 'cafe_bar' | 'bakery' | 'brunch' | 'juice' | 'chain' | 'other'
export const KINDS: { id: CompetitorKind; label: string }[] = [
  { id: 'specialty', label: msg('Specialty coffee') },
  { id: 'cafe', label: msg('Café') },
  { id: 'cafe_bar', label: msg('Café-bar') },
  { id: 'bakery', label: msg('Bakery & café') },
  { id: 'brunch', label: msg('Brunch & breakfast') },
  { id: 'juice', label: msg('Juice & smoothie bar') },
  { id: 'chain', label: msg('Chain') },
  { id: 'other', label: msg('Other') },
]

/** How much a place competes for the same customers. */
export type Threat = 'high' | 'medium' | 'low'
export const THREATS: { id: Threat; label: string }[] = [
  { id: 'high', label: msg('High') }, { id: 'medium', label: msg('Medium') }, { id: 'low', label: msg('Low') },
]

export type GoogleStatus = 'open' | 'closed_temporarily' | 'closed_permanently'

export interface Competitor {
  id: string
  /** The business itself: one row, compared on the same terms. */
  is_self: boolean
  name: string
  kind: CompetitorKind
  /** Null for the business itself. */
  threat: Threat | null
  address: string | null
  /** From the business, in metres (worked out from Google's map position, or typed). */
  distance_m: number | null
  lat: number | null
  lng: number | null
  /** Google's place id, when it was found there: kept up to date from Google every week. */
  place_id: string | null
  website: string | null
  instagram: string | null
  maps_url: string | null
  /** 0 (free) to 4 (very expensive), Google's scale. */
  price_level: number | null
  /** Typed in; null: Google's (google_hours). The business's own come from Opening hours. */
  hours: OpeningHours | null
  google_hours: OpeningHours | null
  /** What an admin set ({ terrace: true, matcha: false }); it wins over what Google says. */
  features: Record<string, boolean>
  google_features: Record<string, boolean>
  google_rating: number | null
  google_count: number | null
  google_status: GoogleStatus | null
  google_checked_at: string | null
  strengths: string | null
  weaknesses: string | null
  notes: string | null
  /** False: no longer followed (it closed, or isn't a competitor after all). Kept with its history. */
  active: boolean
  created_at?: string
}
export type CompetitorInput = Partial<Omit<Competitor, 'id' | 'is_self' | 'google_hours' | 'google_features' | 'google_rating' | 'google_count'
  | 'google_status' | 'google_checked_at' | 'created_at'>> & { id?: string; name: string }

/** One thing on the basket compared everywhere (a flat white, a croissant). */
export interface PriceItem {
  id: string
  name: string
  /** The business's own menu item it is (Menu costing), for its price. */
  recipe_id: string | null
  sort: number
}

export type PriceSource = 'visit' | 'menu' | 'website' | 'delivery' | 'social' | 'other'
export const PRICE_SOURCES: { id: PriceSource; label: string }[] = [
  { id: 'visit', label: msg('Visit') },
  { id: 'menu', label: msg('Their menu') },
  { id: 'website', label: msg('Website') },
  { id: 'delivery', label: msg('Delivery app') },
  { id: 'social', label: msg('Social media') },
  { id: 'other', label: msg('Other') },
]

/** A price seen on a day: each one is kept, so prices can be followed over time. */
export interface CompetitorPrice {
  id: string
  competitor_id: string
  item_id: string
  price: number
  observed_on: string
  source: PriceSource
  note: string | null
  created_at?: string
}

export type NoteKind = 'visit' | 'menu' | 'price' | 'promotion' | 'event' | 'social' | 'opening' | 'idea' | 'other'
export const NOTE_KINDS: { id: NoteKind; label: string }[] = [
  { id: 'visit', label: msg('Visit') },
  { id: 'menu', label: msg('Menu change') },
  { id: 'price', label: msg('Prices') },
  { id: 'promotion', label: msg('Promotion') },
  { id: 'event', label: msg('Event') },
  { id: 'social', label: msg('Social media') },
  { id: 'opening', label: msg('Opening or closing') },
  { id: 'idea', label: msg('Idea to borrow') },
  { id: 'other', label: msg('Other') },
]

/** Where an idea to borrow has got to. */
export type IdeaStatus = 'new' | 'trying' | 'adopted' | 'dropped'
export const IDEA_STATUSES: { id: IdeaStatus; label: string }[] = [
  { id: 'new', label: msg('To try') },
  { id: 'trying', label: msg('Trying it') },
  { id: 'adopted', label: msg('Adopted') },
  { id: 'dropped', label: msg('Not for us') },
]

/** Something seen or heard (a new menu, a 2x1, queues on Saturday), or an idea worth borrowing. */
export interface CompetitorNote {
  id: string
  /** Null: about the area as a whole (a trend). */
  competitor_id: string | null
  kind: NoteKind
  text: string
  observed_on: string
  /** Ideas only. */
  status: IdeaStatus | null
  created_at?: string
}
export type CompetitorNoteInput = Omit<CompetitorNote, 'id' | 'created_at'> & { id?: string }

/** Google's rating and review count on a day (taken every week), for the trend. */
export interface RatingSnapshot {
  competitor_id: string
  taken_on: string
  rating: number | null
  review_count: number | null
}

/** A place Google lists near the business (from the weekly look around, or a search). */
export interface NearbyPlace {
  place_id: string
  name: string
  address: string | null
  distance_m: number | null
  rating: number | null
  review_count: number | null
  price_level: number | null
  primary_type: string | null
  maps_url: string | null
  first_seen: string
  dismissed: boolean
}

export interface CompetitorSettings {
  /** How far around the business Google is asked to look, in metres. */
  radius_m: number
  /** When Google was last asked (null: never; the weekly look starts once an admin has looked once). */
  scanned_at: string | null
  /** Look again every week and tell admins about places that are new. */
  scan_weekly: boolean
}

/** Everything the page shows, read at once. */
export interface CompetitorData {
  competitors: Competitor[]
  items: PriceItem[]
  prices: CompetitorPrice[]
  notes: CompetitorNote[]
  snapshots: RatingSnapshot[]
  nearby: NearbyPlace[]
  settings: CompetitorSettings
}

export const RADII = [300, 500, 1000, 2000, 5000]
export const DEFAULT_RADIUS = 1000
/** A price older than this is shaded: worth checking again. */
export const STALE_DAYS = 180
/** How often each place is read again from Google (ratings and reviews move slowly). */
export const GOOGLE_EVERY_DAYS = 7
/** A place first seen with this many reviews or more isn't new: it was there all along (just outside the last look). */
export const NEW_PLACE_MAX_REVIEWS = 50

// ---------------- What a place offers ----------------

export type FeatureGroup = 'drinks' | 'food' | 'place' | 'service'
export const FEATURE_GROUPS: { id: FeatureGroup; label: string }[] = [
  { id: 'drinks', label: msg('Drinks') }, { id: 'food', label: msg('Food') },
  { id: 'place', label: msg('The place') }, { id: 'service', label: msg('Service') },
]

export interface Feature {
  key: string
  label: string
  group: FeatureGroup
  /** Google Places fields that say it (any true: yes; only false: no). */
  google?: string[]
  /** False for what a business can't easily change, or rarely wants to (parking, sports on TV): never suggested as a gap. */
  actionable?: false
}

export const FEATURES: Feature[] = [
  { key: 'specialty', label: msg('Specialty coffee'), group: 'drinks' },
  { key: 'plant_milk', label: msg('Plant milks'), group: 'drinks' },
  { key: 'matcha', label: msg('Matcha'), group: 'drinks' },
  { key: 'cold_coffee', label: msg('Iced coffee & cold brew'), group: 'drinks' },
  { key: 'smoothies', label: msg('Smoothies & fresh juice'), group: 'drinks' },
  { key: 'alcohol', label: msg('Beer & wine'), group: 'drinks', google: ['servesBeer', 'servesWine'], actionable: false },
  { key: 'breakfast', label: msg('Breakfast'), group: 'food', google: ['servesBreakfast'] },
  { key: 'brunch', label: msg('Brunch'), group: 'food', google: ['servesBrunch'] },
  { key: 'lunch', label: msg('Lunch'), group: 'food', google: ['servesLunch'] },
  { key: 'pastries', label: msg('Cakes & pastries'), group: 'food', google: ['servesDessert'] },
  { key: 'healthy', label: msg('Bowls & salads'), group: 'food' },
  { key: 'vegetarian', label: msg('Vegetarian options'), group: 'food', google: ['servesVegetarianFood'] },
  { key: 'vegan', label: msg('Vegan options'), group: 'food' },
  { key: 'gluten_free', label: msg('Gluten-free options'), group: 'food' },
  { key: 'terrace', label: msg('Terrace'), group: 'place', google: ['outdoorSeating'] },
  { key: 'laptop', label: msg('Wi-Fi & laptop friendly'), group: 'place' },
  { key: 'dogs', label: msg('Dog friendly'), group: 'place', google: ['allowsDogs'] },
  { key: 'kids', label: msg('Good for children'), group: 'place', google: ['goodForChildren', 'menuForChildren'] },
  { key: 'accessible', label: msg('Wheelchair access'), group: 'place', google: ['accessibilityOptions.wheelchairAccessibleEntrance'], actionable: false },
  { key: 'parking', label: msg('Parking'), group: 'place', actionable: false, google: ['parkingOptions.freeParkingLot', 'parkingOptions.paidParkingLot',
    'parkingOptions.freeStreetParking', 'parkingOptions.paidStreetParking', 'parkingOptions.freeGarageParking', 'parkingOptions.paidGarageParking', 'parkingOptions.valetParking'] },
  { key: 'toilets', label: msg('Toilets'), group: 'place', google: ['restroom'], actionable: false },
  { key: 'sports_tv', label: msg('Sports on TV'), group: 'place', google: ['goodForWatchingSports'], actionable: false },
  { key: 'live_music', label: msg('Live music'), group: 'place', google: ['liveMusic'], actionable: false },
  { key: 'takeaway', label: msg('Takeaway'), group: 'service', google: ['takeout'] },
  { key: 'delivery', label: msg('Delivery apps'), group: 'service', google: ['delivery'] },
  { key: 'bookings', label: msg('Table booking'), group: 'service', google: ['reservable'] },
  { key: 'cards', label: msg('Card & contactless'), group: 'service', google: ['paymentOptions.acceptsCreditCards', 'paymentOptions.acceptsDebitCards', 'paymentOptions.acceptsNfc'] },
  { key: 'loyalty', label: msg('Loyalty card'), group: 'service' },
  { key: 'retail', label: msg('Beans & merchandise'), group: 'service' },
  { key: 'events', label: msg('Workshops & tastings'), group: 'service' },
]
export const feature = (key: string) => FEATURES.find(f => f.key === key)

/** What a place offers: Google's answers, with what an admin set over them. */
export const featuresOf = (c: Pick<Competitor, 'features' | 'google_features'>): Record<string, boolean> =>
  ({ ...(c.google_features ?? {}), ...(c.features ?? {}) })

const at = (o: unknown, path: string) => path.split('.').reduce<unknown>((x, k) => (x && typeof x === 'object' ? (x as Record<string, unknown>)[k] : undefined), o)

/** The features Google's place details answer (outdoorSeating: true → terrace: true); unanswered ones are left out. */
export function featuresFromGoogle(place: Record<string, unknown>): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const f of FEATURES) {
    const said = (f.google ?? []).map(p => at(place, p)).filter((v): v is boolean => typeof v === 'boolean')
    if (said.length) out[f.key] = said.includes(true)
  }
  return out
}

// ---------------- From Google ----------------

const SUNDAY_FIRST: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
type GooglePoint = { day?: number; hour?: number; minute?: number }
const hm = (p: GooglePoint) => `${String(p.hour ?? 0).padStart(2, '0')}:${String(p.minute ?? 0).padStart(2, '0')}`

/**
 * Opening hours from Google's periods (days 0-6 from Sunday), one span a day: a lunch break is
 * bridged (opens at the first opening, closes at the last close), past midnight closes at 23:59.
 */
export function hoursFromGoogle(periods: { open?: GooglePoint; close?: GooglePoint }[] | undefined | null): OpeningHours | null {
  if (!periods?.length) return null
  const out: OpeningHours = { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null }
  // Open all the time: one period from Sunday 00:00 with no close.
  if (periods.length === 1 && !periods[0].close && (periods[0].open?.day ?? 0) === 0 && !periods[0].open?.hour && !periods[0].open?.minute) {
    for (const d of SUNDAY_FIRST) out[d] = { open: '00:00', close: '23:59' }
    return out
  }
  for (const p of periods) {
    if (!p.open || p.open.day === undefined || p.open.day < 0 || p.open.day > 6) continue
    const day = SUNDAY_FIRST[p.open.day]
    const open = hm(p.open)
    const close = !p.close || p.close.day !== p.open.day ? '23:59' : hm(p.close)
    const kept = out[day]
    out[day] = kept ? { open: open < kept.open ? open : kept.open, close: close > kept.close ? close : kept.close } : { open, close }
  }
  return out
}

const PRICE_LEVELS: Record<string, number> = {
  PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4,
}
export const priceLevelFromGoogle = (level: string | null | undefined) => (level && level in PRICE_LEVELS ? PRICE_LEVELS[level] : null)
/** €, €€… for Google's price level. */
export const priceLevelLabel = (level: number | null) => (level === null ? '' : level === 0 ? msg('Free') : '€'.repeat(level))

/** A sensible kind from Google's main type for the place (coffee_shop → café, bakery → bakery & café). */
export function kindFromGoogle(type: string | null | undefined): CompetitorKind {
  const t = type ?? ''
  if (/breakfast|brunch/.test(t)) return 'brunch'
  if (/juice|acai|smoothie/.test(t)) return 'juice'
  if (/bakery|pastry|bagel|donut|confection/.test(t)) return 'bakery'
  if (/coffee|cafe|tea_house/.test(t)) return 'cafe'
  if (/(^|_)bar($|_)|pub/.test(t)) return 'cafe_bar'
  return 'other'
}

/** The Instagram handle from "@handle" or the profile's address, as the database keeps it; null for none, undefined when it can't be one. */
export function cleanInstagram(s: string | null | undefined): string | null | undefined {
  const h = (s ?? '').trim().replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, '').replace(/[@/]|\?.*$/g, '')
  if (!h) return null
  return /^[A-Za-z0-9._]{1,60}$/.test(h) ? h : undefined
}

/** Straight-line distance in metres (haversine). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * 6_371_000 * Math.asin(Math.sqrt(h)))
}
/** Minutes on foot (about 80 m a minute), at least one. */
export const walkMinutes = (m: number) => Math.max(1, Math.round(m / 80))

/**
 * How much a new place competes, to start with: the same kind of café within 500 m is a close
 * rival, within 1.5 km some overlap; anything else that close overlaps a little. Admins change it.
 */
export function suggestedThreat(kind: CompetitorKind, distance: number | null): Threat {
  const direct = kind === 'specialty' || kind === 'cafe' || kind === 'brunch' || kind === 'juice' || kind === 'chain'
  const close = distance !== null && distance <= 500, near = distance !== null && distance <= 1500
  return direct && close ? 'high' : (direct && near) || close ? 'medium' : 'low'
}

// ---------------- The basket ----------------

/** What a café in Spain is usually compared on: the coffees, the matcha, breakfast and the fresh juice. Added in one click. */
export const BASKET: string[] = [
  msg('Espresso'), msg('Café con leche'), msg('Flat white'), msg('Cappuccino'), msg('Latte'), msg('Iced latte'), msg('Matcha latte'),
  msg('Chai latte'), msg('Plant milk (extra)'), msg('Croissant'), msg('Tostada con tomate'), msg('Fresh orange juice'), msg('Smoothie'), msg('Açaí bowl'),
]

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * The menu item a basket item is, when there's no doubt: the only one of that name, or the only one
 * with the name in it ("Matcha latte" → "Iced matcha latte"). "Latte" with three lattes on the menu: none.
 */
export function matchRecipe<R extends { id: string; name: string; active?: boolean }>(name: string, recipes: R[]): R | null {
  const n = norm(name)
  if (!n) return null
  const live = recipes.filter(r => r.active !== false)
  const same = live.filter(r => norm(r.name) === n)
  if (same.length) return same.length === 1 ? same[0] : null
  const containing = live.filter(r => norm(r.name).includes(n))
  return containing.length === 1 ? containing[0] : null
}

// ---------------- Prices ----------------

const dayNumber = (d: string) => Date.parse(`${d}T12:00:00Z`) / 86_400_000
export const daysBetween = (from: string, to: string) => Math.round(dayNumber(to) - dayNumber(from))
const round2 = (n: number) => Math.round(n * 100) / 100

export const priceKey = (competitorId: string, itemId: string) => `${competitorId}|${itemId}`

/** Each place's prices for each item, newest first. */
export function priceHistory(prices: CompetitorPrice[]): Map<string, CompetitorPrice[]> {
  const out = new Map<string, CompetitorPrice[]>()
  for (const p of prices) {
    const k = priceKey(p.competitor_id, p.item_id)
    const list = out.get(k)
    if (list) list.push(p); else out.set(k, [p])
  }
  for (const list of out.values()) list.sort((a, b) => b.observed_on.localeCompare(a.observed_on) || (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  return out
}

export interface OurPrice { price: number; from: 'menu' | 'typed' }

/** The business's own price for each item: its menu item's (Menu costing) when linked, else one typed in here. */
export function ourPrices(items: PriceItem[], recipes: { id: string; sell_price: number | null }[], history: Map<string, CompetitorPrice[]>, selfId: string | null) {
  const out = new Map<string, OurPrice>()
  for (const i of items) {
    const r = i.recipe_id ? recipes.find(x => x.id === i.recipe_id) : undefined
    if (r && r.sell_price !== null) { out.set(i.id, { price: Number(r.sell_price), from: 'menu' }); continue }
    const typed = selfId ? history.get(priceKey(selfId, i.id))?.[0] : undefined
    if (typed) out.set(i.id, { price: typed.price, from: 'typed' })
  }
  return out
}

export interface PriceCell { price: number; observed_on: string; previous: number | null; stale: boolean; source: PriceSource }

export interface PriceRow {
  item: PriceItem
  ours: OurPrice | null
  /** Each competitor's latest price, by competitor id. */
  cells: Record<string, PriceCell>
  n: number
  min: number | null
  max: number | null
  avg: number | null
  /** Yours against the average, as a share (0.1: 10% dearer). */
  vsAvg: number | null
  /** How many charge less, and more, than you. */
  cheaper: number
  dearer: number
}

/** The basket item by item: each competitor's latest price, the area's range and average, and where yours sits. */
export function priceBoard(items: PriceItem[], rivals: { id: string }[], history: Map<string, CompetitorPrice[]>, ours: Map<string, OurPrice>, today: string): PriceRow[] {
  return [...items].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)).map(item => {
    const cells: Record<string, PriceCell> = {}
    for (const c of rivals) {
      const [last, before] = history.get(priceKey(c.id, item.id)) ?? []
      if (!last) continue
      cells[c.id] = { price: last.price, observed_on: last.observed_on, previous: before ? before.price : null,
        stale: daysBetween(last.observed_on, today) > STALE_DAYS, source: last.source }
    }
    const values = Object.values(cells).map(c => c.price)
    const avg = values.length ? round2(values.reduce((s, v) => s + v, 0) / values.length) : null
    const our = ours.get(item.id) ?? null
    return {
      item, ours: our, cells, n: values.length,
      min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null, avg,
      vsAvg: our && avg ? our.price / avg - 1 : null,
      cheaper: our ? values.filter(v => v < our.price).length : 0,
      dearer: our ? values.filter(v => v > our.price).length : 0,
    }
  })
}

/**
 * A place's prices against the area average item by item, averaged (100: the average; 110: 10%
 * dearer), and on how many items. Only items with a price nearby count: like for like.
 */
export function priceIndex(rows: PriceRow[], price: (row: PriceRow) => number | null | undefined) {
  const ratios = rows.flatMap(r => {
    const p = price(r)
    return p !== null && p !== undefined && r.avg ? [p / r.avg] : []
  })
  return { index: ratios.length ? Math.round((ratios.reduce((s, v) => s + v, 0) / ratios.length) * 100) : null, items: ratios.length }
}

export interface PriceChange { competitor_id: string; item_id: string; from: number; to: number; on: string }

/** Prices that moved in the last `days` days (each new price against the one seen before it), newest first. */
export function priceChanges(history: Map<string, CompetitorPrice[]>, rivalIds: Set<string>, today: string, days = 90): PriceChange[] {
  const since = addDays(today, -days)
  const out: PriceChange[] = []
  for (const list of history.values()) {
    if (!rivalIds.has(list[0].competitor_id)) continue
    for (let i = 0; i < list.length - 1 && list[i].observed_on >= since; i++) {
      if (list[i].price !== list[i + 1].price) {
        out.push({ competitor_id: list[i].competitor_id, item_id: list[i].item_id, from: list[i + 1].price, to: list[i].price, on: list[i].observed_on })
      }
    }
  }
  return out.sort((a, b) => b.on.localeCompare(a.on))
}

// ---------------- What they offer ----------------

/** gap: most nearby offer it and you don't; edge: you do and at most one other; shared: you and most others. */
export type FeatureVerdict = 'gap' | 'edge' | 'shared' | null
export interface FeatureRow {
  feature: Feature
  /** Competitors that offer it, and that don't (the rest: not known). */
  have: string[]
  lack: string[]
  ours: boolean | null
  verdict: FeatureVerdict
}

export function featureMatrix(rivals: Competitor[], self: Competitor | null): FeatureRow[] {
  const mine = self ? featuresOf(self) : {}
  return FEATURES.map(f => {
    const have: string[] = [], lack: string[] = []
    for (const c of rivals) {
      const v = featuresOf(c)[f.key]
      if (v === true) have.push(c.id); else if (v === false) lack.push(c.id)
    }
    const known = have.length + lack.length
    const ours = f.key in mine ? mine[f.key] : null
    const most = have.length >= 2 && have.length * 2 >= known
    const verdict: FeatureVerdict = ours !== true && most ? 'gap' : ours === true && known >= 2 && have.length <= 1 ? 'edge' : ours === true && most ? 'shared' : null
    return { feature: f, have, lack, ours, verdict }
  })
}

// ---------------- Google ----------------

export interface RatingRow {
  competitor: Competitor
  rating: number | null
  count: number | null
  /** New reviews a month lately (from the weekly snapshots): how busy it's getting. */
  perMonth: number | null
  /** The rating now against about three months ago. */
  change: number | null
}

/** Every place by Google rating (then review count), with how fast its reviews are coming in. */
export function ratingRows(places: Competitor[], snapshots: RatingSnapshot[], today: string): RatingRow[] {
  const since = addDays(today, -120)
  return places.map(c => {
    const list = snapshots.filter(s => s.competitor_id === c.id).sort((a, b) => a.taken_on.localeCompare(b.taken_on))
    const last = list.at(-1)
    const rating = c.google_rating ?? last?.rating ?? null
    const count = c.google_count ?? last?.review_count ?? null
    // The oldest snapshot of the last four months, at least three weeks before the newest.
    const base = last && list.find(s => s.taken_on >= since && daysBetween(s.taken_on, last.taken_on) >= 21)
    const perMonth = base && last && base.review_count !== null && last.review_count !== null
      ? Math.round((Math.max(0, last.review_count - base.review_count) / daysBetween(base.taken_on, last.taken_on)) * 300) / 10 : null
    const change = base && base.rating !== null && rating !== null ? Math.round((rating - base.rating) * 10) / 10 : null
    return { competitor: c, rating, count, perMonth, change }
  }).sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || (b.count ?? -1) - (a.count ?? -1) || a.competitor.name.localeCompare(b.competitor.name))
}

// ---------------- Opening hours ----------------

const WEEKDAYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri']

/** The earliest opening and latest close over some days; null when closed on all of them. */
function span(h: OpeningHours | null, days: DayKey[]) {
  const open = days.map(d => h?.[d]).filter((x): x is { open: string; close: string } => !!x)
  if (!open.length) return null
  return { open: open.map(x => x.open).sort()[0], close: open.map(x => x.close).sort().at(-1)! }
}

export interface HoursCompare {
  /** Competitors whose hours are known. */
  known: number
  ours: { open: string; close: string } | null
  /** Open before you on weekdays: how many, and the earliest. */
  earlier: { n: number; time: string | null }
  /** Still open after you close on weekdays: how many, and the latest. */
  later: { n: number; time: string | null }
  sunday: { n: number; ours: boolean }
}

/** A place's hours: typed in, else Google's. */
export const hoursOf = (c: Pick<Competitor, 'hours' | 'google_hours'>) => c.hours ?? c.google_hours ?? null

export function compareHours(ours: OpeningHours | null, theirs: (OpeningHours | null)[]): HoursCompare | null {
  const me = span(ours, WEEKDAYS)
  const known = theirs.filter((h): h is OpeningHours => !!h && Object.values(h).some(Boolean))
  if (!ours || !known.length) return null
  const spans = known.map(h => span(h, WEEKDAYS)).filter((s): s is { open: string; close: string } => !!s)
  const before = me ? spans.filter(s => s.open < me.open) : []
  const after = me ? spans.filter(s => s.close > me.close) : []
  return {
    known: known.length, ours: me,
    earlier: { n: before.length, time: before.map(s => s.open).sort()[0] ?? null },
    later: { n: after.length, time: after.map(s => s.close).sort().at(-1) ?? null },
    sunday: { n: known.filter(h => !!h.sun).length, ours: !!ours.sun },
  }
}

// ---------------- Putting it together ----------------

export interface Analysis {
  self: Competitor | null
  /** Followed competitors (not the business, not switched off). */
  rivals: Competitor[]
  history: Map<string, CompetitorPrice[]>
  rows: PriceRow[]
  /** Yours, and each competitor's, against the area (100: the average). */
  ourIndex: { index: number | null; items: number }
  rivalIndex: Map<string, { index: number | null; items: number }>
  changes: PriceChange[]
  features: FeatureRow[]
  ratings: RatingRow[]
  hours: HoursCompare | null
  /** Places Google lists nearby that appeared since the first look, with few reviews yet, and aren't followed or put aside. */
  newNearby: NearbyPlace[]
  /** Places Google lists nearby that aren't followed or put aside. */
  untracked: NearbyPlace[]
}

export function analyse(data: CompetitorData, recipes: { id: string; sell_price: number | null }[], ownHours: OpeningHours | null, today: string): Analysis {
  const self = data.competitors.find(c => c.is_self) ?? null
  const rivals = data.competitors.filter(c => !c.is_self && c.active)
  const history = priceHistory(data.prices)
  const ours = ourPrices(data.items, recipes, history, self?.id ?? null)
  const rows = priceBoard(data.items, rivals, history, ours, today)
  const followed = new Set(data.competitors.map(c => c.place_id).filter(Boolean))
  const untracked = data.nearby.filter(p => !p.dismissed && !followed.has(p.place_id))
  const firstLook = data.nearby.map(p => p.first_seen.slice(0, 10)).sort()[0]
  return {
    self, rivals, history, rows,
    ourIndex: priceIndex(rows, r => r.ours?.price),
    rivalIndex: new Map(rivals.map(c => [c.id, priceIndex(rows, r => r.cells[c.id]?.price)])),
    changes: priceChanges(history, new Set(rivals.map(c => c.id)), today),
    features: featureMatrix(rivals, self),
    ratings: ratingRows(self ? [self, ...rivals] : rivals, data.snapshots, today),
    hours: compareHours(ownHours ?? (self ? hoursOf(self) : null), rivals.map(hoursOf)),
    newNearby: untracked.filter(p => p.first_seen.slice(0, 10) > firstLook && daysBetween(p.first_seen.slice(0, 10), today) <= 30
      && (p.review_count ?? 0) < NEW_PLACE_MAX_REVIEWS),
    untracked,
  }
}

/**
 * One finding in plain words: English with {placeholders} (the page translates it, the AI tools
 * fill it in as it is). With `count`, `plural` is the text for many.
 */
export interface Insight {
  area: 'prices' | 'offer' | 'hours' | 'google' | 'nearby'
  tone: 'good' | 'warn' | 'info'
  text: string
  plural?: string
  count?: number
  vars: Record<string, string | number>
}

export interface InsightFormat {
  money: (n: number) => string
  /** A rating, one decimal. */
  rating: (n: number) => string
  /** Translate a label kept with msg() (a feature's name). */
  label: (s: string) => string
}

/** What the comparison says, most useful first in each area: prices, what's offered, hours, Google, new places. */
export function insights(a: Analysis, f: InsightFormat): Insight[] {
  const out: Insight[] = []
  const name = (id: string) => a.rivals.find(c => c.id === id)?.name ?? ''
  const list = (names: string[]) => names.slice(0, 3).join(', ') + (names.length > 3 ? '…' : '')

  // Prices: overall, then the item furthest above and the one furthest below the area.
  const { index, items } = a.ourIndex
  if (index !== null) {
    const pct = Math.abs(index - 100)
    out.push(pct < 5
      ? { area: 'prices', tone: 'good', text: msg('On {n} like-for-like items your prices are in line with the area average.'), vars: { n: items } }
      : index > 100
        ? { area: 'prices', tone: 'info', text: msg('On {n} like-for-like items your prices are {pct}% above the area average.'), vars: { n: items, pct } }
        : { area: 'prices', tone: 'info', text: msg('On {n} like-for-like items your prices are {pct}% below the area average: there may be room to charge more.'), vars: { n: items, pct } })
  }
  const compared = a.rows.filter(r => r.vsAvg !== null && r.n >= 2)
  const dearest = [...compared].sort((x, y) => y.vsAvg! - x.vsAvg!)[0]
  if (dearest && dearest.vsAvg! >= 0.15) {
    out.push({ area: 'prices', tone: 'warn', text: msg('{item}: you charge {ours}; nearby it’s {avg} on average ({min}–{max}).'),
      vars: { item: dearest.item.name, ours: f.money(dearest.ours!.price), avg: f.money(dearest.avg!), min: f.money(dearest.min!), max: f.money(dearest.max!) } })
  }
  const best = [...compared].sort((x, y) => x.vsAvg! - y.vsAvg!)[0]
  if (best && best.vsAvg! <= -0.1) {
    out.push({ area: 'prices', tone: 'info', text: msg('{item}: at {ours} you’re cheaper than {n} of {total} nearby ({avg} on average).'),
      vars: { item: best.item.name, ours: f.money(best.ours!.price), n: best.dearer, total: best.n, avg: f.money(best.avg!) } })
  }
  const rises = a.changes.filter(c => c.to > c.from)
  if (rises.length) {
    const latest = rises[0]
    out.push({ area: 'prices', tone: 'info', count: rises.length,
      text: msg('{n} price rise nearby in the last 90 days: {name}’s {item}, {from} → {to}.'),
      plural: msg('{n} price rises nearby in the last 90 days, the latest {name}’s {item}, {from} → {to}.'),
      vars: { name: name(latest.competitor_id), item: a.rows.find(r => r.item.id === latest.item_id)?.item.name ?? '', from: f.money(latest.from), to: f.money(latest.to) } })
  }

  // What's offered: the clearest gaps (only what a café can change), then what sets you apart.
  const gaps = a.features.filter(r => r.verdict === 'gap' && r.feature.actionable !== false)
    .sort((x, y) => y.have.length / (y.have.length + y.lack.length) - x.have.length / (x.have.length + x.lack.length) || y.have.length - x.have.length)
  for (const g of gaps.slice(0, 3)) {
    out.push({ area: 'offer', tone: 'warn', text: msg('{feature}: {n} of {total} nearby offer it and you don’t.'),
      vars: { feature: f.label(g.feature.label), n: g.have.length, total: g.have.length + g.lack.length } })
  }
  const edges = a.features.filter(r => r.verdict === 'edge').sort((x, y) => x.have.length - y.have.length || y.lack.length - x.lack.length)
  for (const e of edges.slice(0, 3)) {
    out.push(e.have.length === 0
      ? { area: 'offer', tone: 'good', text: msg('{feature}: only you offer it nearby. Make it known.'), vars: { feature: f.label(e.feature.label) } }
      : { area: 'offer', tone: 'good', text: msg('{feature}: only you and {name} offer it nearby.'), vars: { feature: f.label(e.feature.label), name: name(e.have[0]) } })
  }

  // Hours: who's open before you, after you, and on Sundays.
  const h = a.hours
  if (h?.ours) {
    if (h.earlier.n) {
      out.push({ area: 'hours', tone: h.earlier.n * 2 >= h.known ? 'warn' : 'info', count: h.earlier.n,
        text: msg('{n} of {total} opens before you on weekdays (at {time}); you open at {ours}.'),
        plural: msg('{n} of {total} open before you on weekdays (the earliest at {time}); you open at {ours}.'),
        vars: { total: h.known, time: h.earlier.time!, ours: h.ours.open } })
    }
    if (h.later.n) {
      out.push({ area: 'hours', tone: 'info', count: h.later.n,
        text: msg('{n} of {total} stays open after you close on weekdays (until {time}); you close at {ours}.'),
        plural: msg('{n} of {total} stay open after you close on weekdays (until {time}); you close at {ours}.'),
        vars: { total: h.known, time: h.later.time!, ours: h.ours.close } })
    }
  }
  if (h && h.sunday.ours && h.sunday.n * 2 < h.known) {
    out.push(h.sunday.n === 0
      ? { area: 'hours', tone: 'good', text: msg('None of the {total} nearby open on Sundays, and you do.'), vars: { total: h.known } }
      : { area: 'hours', tone: 'good', text: msg('Only {n} of {total} open on Sundays, and you do.'), vars: { n: h.sunday.n, total: h.known } })
  } else if (h && !h.sunday.ours && h.sunday.n * 2 >= h.known && h.sunday.n > 0) {
    out.push({ area: 'hours', tone: 'warn', text: msg('{n} of {total} open on Sundays; you’re closed.'), vars: { n: h.sunday.n, total: h.known } })
  }

  // Google: where your rating sits, who's getting reviews fastest, who closed.
  const mine = a.ratings.find(r => r.competitor.is_self)
  const rated = a.ratings.filter(r => !r.competitor.is_self && r.rating !== null)
  if (mine?.rating !== null && mine?.rating !== undefined && rated.length) {
    const higher = rated.filter(r => r.rating! > mine.rating!)
    out.push(higher.length === 0
      ? { area: 'google', tone: 'good', text: msg('Your Google rating ({rating}★) is the highest of the {total} places you follow.'), vars: { rating: f.rating(mine.rating), total: rated.length } }
      : { area: 'google', tone: 'info', count: higher.length, text: msg('{n} place rates higher than your {rating}★ on Google: {names}.'),
          plural: msg('{n} places rate higher than your {rating}★ on Google: {names}.'), vars: { rating: f.rating(mine.rating), names: list(higher.map(r => r.competitor.name)) } })
  }
  const fastest = [...rated].filter(r => r.perMonth !== null).sort((x, y) => y.perMonth! - x.perMonth!)[0]
  if (fastest && fastest.perMonth! >= 2 && fastest.perMonth! > (mine?.perMonth ?? 0)) {
    out.push({ area: 'google', tone: 'info', text: mine?.perMonth !== null && mine?.perMonth !== undefined
      ? msg('{name} gets about {n} new reviews a month, the most nearby; you get {ours}.')
      : msg('{name} gets about {n} new reviews a month, the most nearby.'),
    vars: { name: fastest.competitor.name, n: Math.round(fastest.perMonth!), ours: Math.round(mine?.perMonth ?? 0) } })
  }
  for (const c of a.rivals.filter(x => x.google_status === 'closed_permanently')) {
    out.push({ area: 'google', tone: 'info', text: msg('{name} shows as closed for good on Google.'), vars: { name: c.name } })
  }

  if (a.newNearby.length) {
    out.push({ area: 'nearby', tone: 'info', text: msg('New on Google nearby: {names}.'), vars: { names: list(a.newNearby.map(p => p.name)) } })
  }
  return out
}

/** An insight in English with its values filled in (for the AI tools). */
export const insightText = (i: Insight) => (i.count !== undefined && i.count !== 1 && i.plural ? i.plural : i.text)
  .replace(/\{(\w+)\}/g, (all, k: string) => (k === 'n' && i.count !== undefined ? String(i.count) : k in i.vars ? String(i.vars[k]) : all))

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v))

/** Rows from the database as the analysis expects them: numeric columns can come back as text, json columns as null. */
export function competitorRows(d: CompetitorData): CompetitorData {
  return {
    ...d,
    competitors: d.competitors.map(c => ({ ...c, lat: num(c.lat), lng: num(c.lng), google_rating: num(c.google_rating), google_count: num(c.google_count),
      distance_m: num(c.distance_m), price_level: num(c.price_level), features: c.features ?? {}, google_features: c.google_features ?? {} })),
    prices: d.prices.map(p => ({ ...p, price: Number(p.price) })),
    snapshots: d.snapshots.map(s => ({ ...s, rating: num(s.rating), review_count: num(s.review_count) })),
    nearby: d.nearby.map(p => ({ ...p, rating: num(p.rating), review_count: num(p.review_count), distance_m: num(p.distance_m), price_level: num(p.price_level) })),
  }
}
