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

// ---------------------------------------------------------------------------------------------
// The items made here, with a set shelf life (the `fresh_items` migration)
// ---------------------------------------------------------------------------------------------

/**
 * A menu item with a set shelf life (a pastry, a chia pudding, a cheesecake): how long it keeps once made
 * and, if it goes on offer before it has to be gone, from how long before the end and at what discount.
 * A batch recorded of it starts from these. Read from Square's "Shelf life" custom attribute on the item
 * (`from_square`), or set in the app.
 */
export interface FreshItem {
  id: string
  /** The menu item (from Square when that's where the menu comes from). */
  recipe_id: string
  shelf_life_hours: number
  /** Square has its shelf life, and changes it. */
  from_square: boolean
  /** Its offer starts this long before it has to be gone (null: no offer). */
  offer_hours: number | null
  discount: 'percent' | 'price'
  percent_off: number
  price: string | null
}
export type FreshItemInput = Omit<FreshItem, 'id' | 'from_square'> & { id?: string }

/** How long before the end its offer starts, as offered on the page (any number of hours below its shelf life is fine). */
export const OFFER_LEADS: { hours: number; label: string }[] = [
  { hours: 2, label: msg('Its last 2 hours') }, { hours: 4, label: msg('Its last 4 hours') }, { hours: 8, label: msg('Its last 8 hours') },
  { hours: 24, label: msg('Its last day') }, { hours: 48, label: msg('Its last 2 days') }, { hours: 72, label: msg('Its last 3 days') },
]

/** A new one: keeps a day, 30% off for its last 4 hours. */
export const newFreshItem = (recipeId = ''): FreshItemInput =>
  ({ recipe_id: recipeId, shelf_life_hours: 24, offer_hours: 4, discount: 'percent', percent_off: 30, price: null })

/** What stops it being saved (null: fine). The database checks the same. */
export function freshItemProblem(i: Pick<FreshItemInput, 'recipe_id' | 'shelf_life_hours' | 'offer_hours' | 'discount' | 'percent_off' | 'price'>): string | null {
  if (!i.recipe_id) return msg('Pick an item from the menu')
  if (!(Number.isInteger(i.shelf_life_hours) && i.shelf_life_hours >= 1 && i.shelf_life_hours <= MAX_SHELF_HOURS)) return msg('Its shelf life is between 1 hour and 30 days')
  if (i.offer_hours !== null) {
    if (!(Number.isInteger(i.offer_hours) && i.offer_hours >= 1 && i.offer_hours < i.shelf_life_hours)) return msg('Start the offer before its shelf life ends')
    if (i.discount === 'percent' && !(Number.isInteger(i.percent_off) && i.percent_off >= 5 && i.percent_off <= 90)) return msg('Take between 5% and 90% off')
    if (i.discount === 'price' && !i.price?.trim()) return msg('Say the offer price, e.g. 2 for €3')
  }
  if ((i.price ?? '').trim().length > 40) return msg('Keep the prices short')
  return null
}

/** A batch of it made at `madeAt`: its menu item, its shelf life, and its offer from that long before the end. */
export function batchFromItem(item: Pick<FreshItem, 'recipe_id' | 'shelf_life_hours' | 'offer_hours' | 'discount' | 'percent_off' | 'price'>, madeAt: string):
  Pick<FreshBatchInput, 'recipe_id' | 'shelf_life_hours' | 'discount_at' | 'discount' | 'percent_off' | 'price'> {
  const end = Date.parse(goodUntil(madeAt, item.shelf_life_hours))
  return {
    recipe_id: item.recipe_id, shelf_life_hours: item.shelf_life_hours, discount: item.discount, percent_off: item.percent_off, price: item.price,
    discount_at: item.offer_hours === null ? null : new Date(Math.max(Date.parse(madeAt), end - item.offer_hours * HOUR)).toISOString(),
  }
}

/** Its batches, newest first: those of its menu item, or with its name when not linked to one. */
export function batchesOf(recipe: { id: string; name: string }, batches: FreshBatch[]): FreshBatch[] {
  const name = recipe.name.trim().toLowerCase()
  return batches.filter(b => b.recipe_id === recipe.id || (!b.recipe_id && b.name.trim().toLowerCase() === name))
    .sort((a, b) => b.made_at.localeCompare(a.made_at))
}

/**
 * What Square's shelf lives change (its items' "Shelf life" custom attribute, read with the menu): one
 * set for each menu item that has one (an offer that no longer fits before the end goes), and those
 * Square no longer has kept as they are, as set in the app from then on. The Worker and the demo do it.
 */
export function squareShelfChanges(read: { square_id: string; shelf_life_hours?: number | null }[], recipes: { id: string; square_id: string | null }[],
  items: Pick<FreshItem, 'id' | 'recipe_id' | 'shelf_life_hours' | 'offer_hours' | 'from_square'>[]) {
  const bySquare = new Map(recipes.filter(r => r.square_id).map(r => [r.square_id!, r.id]))
  const add: { recipe_id: string; shelf_life_hours: number; from_square: true }[] = []
  const change: { id: string; patch: { shelf_life_hours: number; from_square: true; offer_hours?: null } }[] = []
  const inSquare = new Set<string>()
  for (const r of read) {
    const recipe = r.shelf_life_hours ? bySquare.get(r.square_id) : undefined
    if (!recipe || !r.shelf_life_hours) continue
    inSquare.add(recipe)
    const had = items.find(i => i.recipe_id === recipe)
    if (!had) add.push({ recipe_id: recipe, shelf_life_hours: r.shelf_life_hours, from_square: true })
    else if (!had.from_square || had.shelf_life_hours !== r.shelf_life_hours) {
      change.push({ id: had.id, patch: { shelf_life_hours: r.shelf_life_hours, from_square: true, ...(had.offer_hours !== null && had.offer_hours >= r.shelf_life_hours ? { offer_hours: null } : {}) } })
    }
  }
  const release = items.filter(i => i.from_square && !inSquare.has(i.recipe_id)).map(i => i.id)
  return { add, change, release }
}
