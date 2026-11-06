// The demo's Freshly made (Stock): this morning's banana bread and pain au chocolat (their discounts still to
// come), yesterday's brownies (on offer now, 2 for €5), today's toasties (no discount) and Monday's lemon tart
// (sold out); and the pastries' set shelf life (a day, 30% off for the last 4 hours), as the `fresh_items`
// migration, with what Square's item library says once the menu is read from it.
// Mirrors the `fresh_batches` migration: the team records and changes batches, finance partners read,
// admins and whoever recorded one delete it; a batch with a discount puts its offer on Offers & specials
// (on every screen that's on; the sample batches' offers are on none).
import type { Api } from './api'
import type { Offer } from '../../shared/offers'
import {
  freshItemProblem, freshOfferPrice, freshProblem, goodUntil, squareShelfChanges, type FreshBatch, type FreshBatchInput, type FreshItem, type FreshItemInput,
  NO_SECOND_DISCOUNT, NO_SECOND_OFFER, secondDiscount,
} from '../../shared/freshBatches'

interface Who {
  isStaff: () => boolean
  isAdmin: () => boolean
  /** A finance partner (reads only). */
  reads: () => boolean
  me: () => string | null
  uid: () => string
  /** The demo's offers (Offers & specials), changed in place. */
  offers: Offer[]
  /** The screens that are on. */
  screens: () => string[]
  /** The menu items, for a name's price. */
  menu: () => { id: string; name: string; sell_price: number | null; square_id?: string | null }[]
}

type FreshApi = Pick<Api, 'freshBatches' | 'saveFreshBatch' | 'deleteFreshBatch' | 'freshItems' | 'saveFreshItem' | 'deleteFreshItem'> & {
  /** Square's shelf lives, read with the menu (as the Worker: worker/menu.ts). */
  squareShelfLives: (read: { square_id: string; shelf_life_hours?: number | null }[]) => void
}
const RLS = 'new row violates row-level security policy for table "fresh_batches"'
const ITEMS_RLS = 'new row violates row-level security policy for table "fresh_items"'
const HOUR = 3_600_000

export function demoFreshApi(w: Who): FreshApi {
  const ago = (hours: number) => new Date(Math.floor((Date.now() - hours * HOUR) / 60_000) * 60_000).toISOString()
  type Second = 'discount2_at' | 'discount2' | 'percent_off2' | 'price2'
  const batch = (b: Omit<FreshBatch, 'id' | 'good_until' | 'cleared_at' | 'recipe_id' | Second> & Partial<Pick<FreshBatch, Second>> & { id: string; cleared_at?: string | null }): FreshBatch =>
    ({ recipe_id: null, cleared_at: null, ...NO_SECOND_DISCOUNT, ...b, good_until: goodUntil(b.made_at, b.shelf_life_hours) })
  const rows: FreshBatch[] = [
    batch({ id: 'fresh-banana', name: 'Banana bread', quantity: 10, made_at: ago(1.5), shelf_life_hours: 24, discount_at: new Date(Date.parse(ago(1.5)) + 18 * HOUR).toISOString(),
      discount: 'percent', percent_off: 30, price: null, cleared: null, notes: 'Two loaves, 5 slices each', made_by: 'p-julio' }),
    batch({ id: 'fresh-brownies', name: 'Brownies', quantity: 12, made_at: ago(30), shelf_life_hours: 48, discount_at: ago(1), discount: 'price', percent_off: 30,
      price: '2 for €5', cleared: null, notes: null, made_by: 'p-maria' }),
    batch({ id: 'fresh-toasties', name: 'Ham & cheese toasties', quantity: 8, made_at: ago(2), shelf_life_hours: 8, discount_at: null, discount: 'percent', percent_off: 30,
      price: null, cleared: null, notes: null, made_by: 'p-julio' }),
    batch({ id: 'fresh-pain', name: 'Pain au chocolat', quantity: 10, made_at: ago(2), shelf_life_hours: 24, discount_at: new Date(Date.parse(ago(2)) + 20 * HOUR).toISOString(),
      discount: 'percent', percent_off: 30, price: null, cleared: null, notes: null, made_by: 'p-julio' }),
    batch({ id: 'fresh-tart', name: 'Lemon tart', quantity: 8, made_at: ago(50), shelf_life_hours: 24, discount_at: ago(32), discount: 'percent', percent_off: 25, price: null,
      cleared: 'sold', cleared_at: ago(30), notes: null, made_by: 'p-maria' }),
  ]

  /**
   * As fresh_batch_offer(): an offer for each of the batch's discounts, kept in step (made the first time,
   * moved after), or ended. The first runs until the second starts (or the end), the second until the end.
   */
  const syncOffer = (b: FreshBatch, screens = w.screens()) => {
    const now = Date.now()
    const sell = w.menu().find(m => m.id === b.recipe_id)?.sell_price ?? null
    const stages = [
      { stage: 1, from: b.discount_at, until: b.discount2_at ?? b.good_until, discount: b },
      { stage: 2, from: b.discount2_at, until: b.good_until, discount: secondDiscount(b) },
    ]
    for (const { stage, from, until, discount } of stages) {
      const mine = (o: { fresh_batch_id?: string | null; fresh_stage?: number | null }) => o.fresh_batch_id === b.id && (o.fresh_stage ?? 1) === stage
      const existing = w.offers.find(mine)
      if (from && !b.cleared && Date.parse(until) > now) {
        const { price, was_price } = freshOfferPrice(discount, sell)
        const fields = { title: b.name.slice(0, 80), price, was_price, starts_at: from, ends_at: until }
        if (existing) Object.assign(existing, fields)
        else w.offers.push({ id: w.uid(), details: null, image_url: null, screen_ids: screens, screen_mode: 'turns', seconds: 15, post_id: null, active: true,
          updated_at: new Date().toISOString(), fresh_batch_id: b.id, fresh_stage: stage, ...fields })
        continue
      }
      for (const o of [...w.offers].filter(mine)) {
        if (Date.parse(o.starts_at) > now) w.offers.splice(w.offers.indexOf(o), 1)
        else if (Date.parse(o.ends_at) > now) o.ends_at = new Date(now).toISOString()
      }
    }
  }
  // The items made here with a set shelf life: the café's pastries keep a day, 30% off for their last 4 hours.
  const items: FreshItem[] = []
  let seeded = false
  const seed = () => {
    if (seeded) return
    seeded = true
    for (const name of ['Croissant', 'Pain au chocolat']) {
      const r = w.menu().find(m => m.name === name)
      if (r) items.push({ id: `fresh-item-${r.id}`, recipe_id: r.id, shelf_life_hours: 24, from_square: false, offer_hours: 4, discount: 'percent', percent_off: 30, price: null, ...NO_SECOND_OFFER, made_here: true })
    }
    for (const b of rows) {
      b.recipe_id = w.menu().find(m => m.name.toLowerCase() === b.name.toLowerCase())?.id ?? null
      // The sample batches' offers are on no screen, so the counter TV keeps to its own sample offers.
      if (!b.cleared) syncOffer(b, [])
    }
  }
  const relevant = (b: FreshBatch) => JSON.stringify([b.name, b.recipe_id, b.made_at, b.shelf_life_hours, b.discount_at, b.discount, b.percent_off, b.price,
    b.discount2_at, b.discount2, b.percent_off2, b.price2, b.cleared])

  return {
    async freshBatches() {
      seed()
      if (!w.isStaff() && !w.reads()) return []
      const since = Date.now() - 14 * 86_400_000
      return structuredClone(rows.filter(b => Date.parse(b.made_at) >= since || Date.parse(b.good_until) >= since))
        .sort((a, b) => b.made_at.localeCompare(a.made_at))
    },
    async saveFreshBatch({ id, ...input }: FreshBatchInput) {
      seed()
      if (!w.isStaff()) throw new Error(RLS)
      const problem = freshProblem(input)
      if (problem) throw new Error(problem)
      const was = id ? rows.find(b => b.id === id) : undefined
      if (id && !was) throw new Error('That isn’t here any more')
      const before = was ? relevant(was) : null
      const name = input.name.trim()
      // As the database: tidied, a name on the menu linked to its item, when it has to be gone, who and when it was cleared.
      const recipe = w.menu().find(m => m.id === input.recipe_id) ?? w.menu().find(m => m.name.toLowerCase() === name.toLowerCase())
      const next: FreshBatch = {
        ...input, id: was?.id ?? w.uid(), name, price: input.price?.trim() || null, price2: input.price2?.trim() || null, notes: input.notes?.trim() || null, recipe_id: recipe?.id ?? null,
        good_until: goodUntil(input.made_at, input.shelf_life_hours),
        cleared_at: !input.cleared ? null : was?.cleared ? was.cleared_at : new Date().toISOString(),
        made_by: was ? was.made_by : w.me(),
      }
      if (was) Object.assign(was, next)
      else rows.push(next)
      if (before !== relevant(next)) syncOffer(next)
      return next.id
    },
    async freshItems() {
      seed()
      if (!w.isStaff() && !w.reads()) return []
      const menu = new Set(w.menu().map(m => m.id))
      return structuredClone(items.filter(i => menu.has(i.recipe_id)))
    },
    async saveFreshItem({ id, ...input }: FreshItemInput) {
      seed()
      if (!w.isAdmin()) throw new Error(ITEMS_RLS)
      const problem = freshItemProblem(input)
      if (problem) throw new Error(problem)
      if (!w.menu().some(m => m.id === input.recipe_id)) throw new Error('Pick an item from the menu')
      const was = id ? items.find(i => i.id === id) : undefined
      if (id && !was) throw new Error('That isn’t here any more')
      if (items.some(i => i.recipe_id === input.recipe_id && i.id !== id)) throw new Error('duplicate key value violates unique constraint "fresh_items_recipe_key"')
      const next: FreshItem = { ...input, id: was?.id ?? w.uid(), from_square: was?.from_square ?? false, price: input.price?.trim() || null, price2: input.price2?.trim() || null }
      if (was) Object.assign(was, next)
      else items.push(next)
      return next.id
    },
    async deleteFreshItem(id) {
      seed()
      if (!w.isAdmin()) return
      const i = items.findIndex(x => x.id === id)
      if (i >= 0) items.splice(i, 1)
    },
    squareShelfLives(read) {
      seed()
      const { add, change, release } = squareShelfChanges(read, w.menu().map(m => ({ id: m.id, square_id: m.square_id ?? null })), items)
      for (const a of add) items.push({ ...a, id: w.uid(), offer_hours: null, discount: 'percent', percent_off: 30, price: null, ...NO_SECOND_OFFER, made_here: true })
      for (const c of change) Object.assign(items.find(i => i.id === c.id)!, c.patch)
      for (const i of items) if (release.includes(i.id)) i.from_square = false
    },
    async deleteFreshBatch(id) {
      seed()
      const i = rows.findIndex(b => b.id === id)
      if (i < 0 || !(w.isAdmin() || (w.isStaff() && rows[i].made_by === w.me()))) return
      for (const o of [...w.offers].filter(x => x.fresh_batch_id === id && Date.parse(x.ends_at) > Date.now())) w.offers.splice(w.offers.indexOf(o), 1)
      for (const o of w.offers) if (o.fresh_batch_id === id) o.fresh_batch_id = null
      rows.splice(i, 1)
    },
  }
}
