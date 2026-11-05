// The demo's Freshly made (Stock): this morning's banana bread (its discount still to come), yesterday's
// brownies (on offer now, 2 for €5), today's toasties (no discount) and Monday's lemon tart (sold out).
// Mirrors the `fresh_batches` migration: the team records and changes batches, finance partners read,
// admins and whoever recorded one delete it; a batch with a discount puts its offer on Offers & specials
// (on every screen that's on; the sample batches' offers are on none).
import type { Api } from './api'
import type { Offer } from '../../shared/offers'
import { freshOfferPrice, freshProblem, goodUntil, type FreshBatch, type FreshBatchInput } from '../../shared/freshBatches'

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
  menu: () => { id: string; name: string; sell_price: number | null }[]
}

type FreshApi = Pick<Api, 'freshBatches' | 'saveFreshBatch' | 'deleteFreshBatch'>
const RLS = 'new row violates row-level security policy for table "fresh_batches"'
const HOUR = 3_600_000

export function demoFreshApi(w: Who): FreshApi {
  const ago = (hours: number) => new Date(Math.floor((Date.now() - hours * HOUR) / 60_000) * 60_000).toISOString()
  const batch = (b: Omit<FreshBatch, 'id' | 'good_until' | 'cleared_at' | 'recipe_id'> & { id: string; cleared_at?: string | null }): FreshBatch =>
    ({ recipe_id: null, cleared_at: null, ...b, good_until: goodUntil(b.made_at, b.shelf_life_hours) })
  const rows: FreshBatch[] = [
    batch({ id: 'fresh-banana', name: 'Banana bread', quantity: 10, made_at: ago(1.5), shelf_life_hours: 24, discount_at: new Date(Date.parse(ago(1.5)) + 18 * HOUR).toISOString(),
      discount: 'percent', percent_off: 30, price: null, cleared: null, notes: 'Two loaves, 5 slices each', made_by: 'p-julio' }),
    batch({ id: 'fresh-brownies', name: 'Brownies', quantity: 12, made_at: ago(30), shelf_life_hours: 48, discount_at: ago(1), discount: 'price', percent_off: 30,
      price: '2 for €5', cleared: null, notes: null, made_by: 'p-maria' }),
    batch({ id: 'fresh-toasties', name: 'Ham & cheese toasties', quantity: 8, made_at: ago(2), shelf_life_hours: 8, discount_at: null, discount: 'percent', percent_off: 30,
      price: null, cleared: null, notes: null, made_by: 'p-julio' }),
    batch({ id: 'fresh-tart', name: 'Lemon tart', quantity: 8, made_at: ago(50), shelf_life_hours: 24, discount_at: ago(32), discount: 'percent', percent_off: 25, price: null,
      cleared: 'sold', cleared_at: ago(30), notes: null, made_by: 'p-maria' }),
  ]

  /** As fresh_batch_offer(): the batch's offer kept in step (made the first time, moved after), or ended. */
  const syncOffer = (b: FreshBatch, screens = w.screens()) => {
    const existing = w.offers.find(o => o.fresh_batch_id === b.id)
    const now = Date.now()
    if (b.discount_at && !b.cleared && Date.parse(b.good_until) > now) {
      const sell = w.menu().find(m => m.id === b.recipe_id)?.sell_price ?? null
      const { price, was_price } = freshOfferPrice(b, sell)
      const fields = { title: b.name.slice(0, 80), price, was_price, starts_at: b.discount_at, ends_at: b.good_until }
      if (existing) Object.assign(existing, fields)
      else w.offers.push({ id: w.uid(), details: null, image_url: null, screen_ids: screens, screen_mode: 'turns', seconds: 15, post_id: null, active: true,
        updated_at: new Date().toISOString(), fresh_batch_id: b.id, ...fields })
      return
    }
    for (const o of [...w.offers].filter(x => x.fresh_batch_id === b.id)) {
      if (Date.parse(o.starts_at) > now) w.offers.splice(w.offers.indexOf(o), 1)
      else if (Date.parse(o.ends_at) > now) o.ends_at = new Date(now).toISOString()
    }
  }
  let seeded = false
  const seed = () => {
    if (seeded) return
    seeded = true
    for (const b of rows) {
      b.recipe_id = w.menu().find(m => m.name.toLowerCase() === b.name.toLowerCase())?.id ?? null
      // The sample batches' offers are on no screen, so the counter TV keeps to its own sample offers.
      if (!b.cleared) syncOffer(b, [])
    }
  }
  const relevant = (b: FreshBatch) => JSON.stringify([b.name, b.recipe_id, b.made_at, b.shelf_life_hours, b.discount_at, b.discount, b.percent_off, b.price, b.cleared])

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
        ...input, id: was?.id ?? w.uid(), name, price: input.price?.trim() || null, notes: input.notes?.trim() || null, recipe_id: recipe?.id ?? null,
        good_until: goodUntil(input.made_at, input.shelf_life_hours),
        cleared_at: !input.cleared ? null : was?.cleared ? was.cleared_at : new Date().toISOString(),
        made_by: was ? was.made_by : w.me(),
      }
      if (was) Object.assign(was, next)
      else rows.push(next)
      if (before !== relevant(next)) syncOffer(next)
      return next.id
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
