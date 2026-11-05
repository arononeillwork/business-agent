// Freshly made (Stock): what the team makes for the counter (a banana bread, today's sandwiches, a
// tray of brownies), when it was made, how long it keeps, and when it goes on offer at what discount.
// A batch with a discount puts itself on Offers & specials from that time until its shelf life ends,
// its menu price crossed out, on the screens; sold out or thrown away first, its offer ends then. The
// database does that (the `fresh_batches` migration: fresh_batch_offer()); this is the same reckoning,
// for the page, the demo and the tests. Nothing is charged or changed in Square.
import { msg } from './i18n'
import { lastDayPrice } from './lastDayOffers'

export type FreshCleared = 'sold' | 'binned'

export interface FreshBatch {
  id: string
  /** What was made, as on the menu or in the team's own words. */
  name: string
  /** The menu item (Menu costing) it is, for its price. */
  recipe_id: string | null
  /** How many were made; null: not counted. */
  quantity: number | null
  made_at: string
  /** How long it keeps once made; `good_until` is made_at plus this. */
  shelf_life_hours: number
  good_until: string
  /** When its discount starts (null: no discount), and what it takes off. */
  discount_at: string | null
  discount: 'percent' | 'price'
  percent_off: number
  /** A set price, as shown ("2 for €3"). */
  price: string | null
  /** Gone from the counter before its time. */
  cleared: FreshCleared | null
  cleared_at: string | null
  notes: string | null
  /** Who recorded it. */
  made_by: string | null
}
export type FreshBatchInput = Omit<FreshBatch, 'id' | 'good_until' | 'cleared_at' | 'made_by'> & { id?: string }

/** How long things keep, as offered on the page (any number of hours is fine). */
export const SHELF_LIVES: { hours: number; label: string }[] = [
  { hours: 4, label: msg('4 hours') }, { hours: 8, label: msg('8 hours') }, { hours: 12, label: msg('12 hours') },
  { hours: 24, label: msg('1 day') }, { hours: 48, label: msg('2 days') }, { hours: 72, label: msg('3 days') }, { hours: 120, label: msg('5 days') },
]
/** When the discount starts, as offered: this long before its shelf life ends. */
export const DISCOUNT_LEADS: { hours: number; label: string }[] = [
  { hours: 1, label: msg('1 hour before') }, { hours: 2, label: msg('2 hours before') }, { hours: 4, label: msg('4 hours before') },
  { hours: 8, label: msg('8 hours before') }, { hours: 24, label: msg('1 day before') },
]

export const MAX_SHELF_HOURS = 720
const HOUR = 3_600_000

/** When it has to be gone: made plus its shelf life (an ISO time). */
export const goodUntil = (madeAt: string, shelfHours: number) => new Date(Date.parse(madeAt) + shelfHours * HOUR).toISOString()

/**
 * The usual start of its discount: a quarter of its shelf life before the end (6 hours for a day's, 2 for
 * 8 hours'), on the hour, and never before it's made.
 */
export function defaultDiscountAt(madeAt: string, shelfHours: number): string {
  const end = Date.parse(goodUntil(madeAt, shelfHours))
  const lead = Math.max(1, Math.round(shelfHours / 4))
  const at = Math.floor((end - lead * HOUR) / HOUR) * HOUR
  return new Date(Math.max(at, Date.parse(madeAt))).toISOString()
}

/** What stops the batch being saved (null: fine). The database checks the same. */
export function freshProblem(b: Pick<FreshBatchInput, 'name' | 'quantity' | 'made_at' | 'shelf_life_hours' | 'discount_at' | 'discount' | 'percent_off' | 'price' | 'notes'>,
  now = Date.now()): string | null {
  if (!b.name.trim()) return msg('Say what was made')
  if (b.name.trim().length > 80) return msg('Keep the name to 80 characters')
  if (b.quantity !== null && !(b.quantity > 0 && b.quantity <= 10_000)) return msg('Say how many were made, or leave it empty')
  if (!(Number.isInteger(b.shelf_life_hours) && b.shelf_life_hours >= 1 && b.shelf_life_hours <= MAX_SHELF_HOURS)) return msg('Its shelf life is between 1 hour and 30 days')
  if (Number.isNaN(Date.parse(b.made_at))) return msg('Say when it was made')
  if (Date.parse(b.made_at) > now + 12 * HOUR) return msg('It can’t be made more than 12 hours from now')
  if (b.discount_at) {
    const at = Date.parse(b.discount_at)
    if (Number.isNaN(at) || at < Date.parse(b.made_at) || at >= Date.parse(goodUntil(b.made_at, b.shelf_life_hours))) {
      return msg('Start the discount after it’s made and before its shelf life ends')
    }
    if (b.discount === 'percent' && !(Number.isInteger(b.percent_off) && b.percent_off >= 5 && b.percent_off <= 90)) return msg('Take between 5% and 90% off')
    if (b.discount === 'price' && !b.price?.trim()) return msg('Say the offer price, e.g. 2 for €3')
  }
  if ((b.price ?? '').trim().length > 40) return msg('Keep the prices short')
  if ((b.notes ?? '').trim().length > 300) return msg('Keep the notes to 300 characters')
  return null
}

/** Where a batch is: fresh, its discount coming, on offer now, past its shelf life, or gone (sold out or thrown away). */
export type FreshState = 'fresh' | 'discount_soon' | 'on_offer' | 'past' | FreshCleared

export function freshState(b: Pick<FreshBatch, 'good_until' | 'discount_at' | 'cleared'>, now = Date.now()): FreshState {
  if (b.cleared) return b.cleared
  if (now >= Date.parse(b.good_until)) return 'past'
  if (!b.discount_at) return 'fresh'
  return now >= Date.parse(b.discount_at) ? 'on_offer' : 'discount_soon'
}

/** Still on the counter: neither gone nor past its shelf life. */
export const onCounter = (b: Pick<FreshBatch, 'good_until' | 'discount_at' | 'cleared'>, now = Date.now()) =>
  !['past', 'sold', 'binned'].includes(freshState(b, now))

/** How far through its shelf life it is (0 just made, 1 at the end). */
export const shelfShare = (b: Pick<FreshBatch, 'made_at' | 'good_until'>, now = Date.now()) =>
  Math.min(1, Math.max(0, (now - Date.parse(b.made_at)) / Math.max(1, Date.parse(b.good_until) - Date.parse(b.made_at))))

/** Its offer price and the usual one crossed out, as on Offers & specials: 30% off the menu price ("€2.45", was "€3.50"). */
export const freshOfferPrice = (b: Pick<FreshBatch, 'discount' | 'percent_off' | 'price'>, sellPrice: number | null) => lastDayPrice(b, sellPrice)

/**
 * What a new batch of the same thing starts from: the last one's shelf life and discount (moved to the
 * new time), so a daily bake is two taps to record.
 */
export function likeLastTime(name: string, batches: FreshBatch[], madeAt: string): Partial<FreshBatchInput> | null {
  const key = name.trim().toLowerCase()
  const last = [...batches].filter(b => b.name.trim().toLowerCase() === key).sort((a, b) => b.made_at.localeCompare(a.made_at))[0]
  if (!last) return null
  const lead = last.discount_at ? Date.parse(last.good_until) - Date.parse(last.discount_at) : null
  const end = Date.parse(goodUntil(madeAt, last.shelf_life_hours))
  return {
    recipe_id: last.recipe_id, quantity: last.quantity, shelf_life_hours: last.shelf_life_hours, discount: last.discount, percent_off: last.percent_off, price: last.price,
    discount_at: lead === null ? null : new Date(Math.max(Date.parse(madeAt), end - lead)).toISOString(),
  }
}

/** A new batch: made now, keeps a day, 30% off for its last 6 hours. */
export function newFreshBatch(now = new Date()): FreshBatchInput {
  const made = new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString()
  return {
    name: '', recipe_id: null, quantity: null, made_at: made, shelf_life_hours: 24, discount_at: defaultDiscountAt(made, 24),
    discount: 'percent', percent_off: 30, price: null, cleared: null, notes: null,
  }
}
