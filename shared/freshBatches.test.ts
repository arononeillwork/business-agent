import { describe, expect, it } from 'vitest'
import {
  batchFromItem, batchesOf, defaultDiscountAt, freshItemProblem, freshOfferPrice, freshProblem, freshState, goodUntil, likeLastTime, newFreshBatch, newFreshItem, onCounter, shelfShare,
  squareShelfChanges, type FreshBatch,
} from './freshBatches'

const at = (hhmm: string, day = '2026-09-30') => new Date(`${day}T${hhmm}:00Z`).toISOString()
const batch = (x: Partial<FreshBatch> = {}): FreshBatch => ({
  id: 'b1', name: 'Banana bread', recipe_id: null, quantity: 12, made_at: at('08:00'), shelf_life_hours: 24, good_until: at('08:00', '2026-10-01'),
  discount_at: at('02:00', '2026-10-01'), discount: 'percent', percent_off: 30, price: null, cleared: null, cleared_at: null, notes: null, made_by: null, ...x,
})

describe('freshly made', () => {
  it('keeps until it’s made plus its shelf life', () => {
    expect(goodUntil(at('08:00'), 8)).toBe(at('16:00'))
    expect(goodUntil(at('20:00'), 24)).toBe(at('20:00', '2026-10-01'))
  })

  it('starts its discount a quarter of its shelf life before the end, on the hour, never before it’s made', () => {
    expect(defaultDiscountAt(at('08:00'), 24)).toBe(at('02:00', '2026-10-01'))
    expect(defaultDiscountAt(at('08:20'), 8)).toBe(at('14:00'))
    expect(defaultDiscountAt(at('08:00'), 1)).toBe(at('08:00'))
  })

  it('says what stops it being saved', () => {
    const now = Date.parse(at('09:00'))
    const ok = { ...batch(), name: ' Banana bread ' }
    expect(freshProblem(ok, now)).toBeNull()
    expect(freshProblem({ ...ok, name: ' ' }, now)).toBe('Say what was made')
    expect(freshProblem({ ...ok, quantity: 0 }, now)).toBe('Say how many were made, or leave it empty')
    expect(freshProblem({ ...ok, shelf_life_hours: 0 }, now)).toBe('Its shelf life is between 1 hour and 30 days')
    expect(freshProblem({ ...ok, shelf_life_hours: 721 }, now)).toBe('Its shelf life is between 1 hour and 30 days')
    expect(freshProblem({ ...ok, made_at: at('22:00') }, now)).toBe('It can’t be made more than 12 hours from now')
    expect(freshProblem({ ...ok, discount_at: at('07:00') }, now)).toBe('Start the discount after it’s made and before its shelf life ends')
    expect(freshProblem({ ...ok, discount_at: at('08:00', '2026-10-01') }, now)).toBe('Start the discount after it’s made and before its shelf life ends')
    expect(freshProblem({ ...ok, percent_off: 95 }, now)).toBe('Take between 5% and 90% off')
    expect(freshProblem({ ...ok, discount: 'price', price: ' ' }, now)).toBe('Say the offer price, e.g. 2 for €3')
    // No discount: its kind and amount don't matter.
    expect(freshProblem({ ...ok, discount_at: null, percent_off: 0 }, now)).toBeNull()
  })

  it('is fresh, then its discount is coming, then on offer, then past; gone when sold out or thrown away', () => {
    const b = batch()
    expect(freshState(b, Date.parse(at('09:00')))).toBe('discount_soon')
    expect(freshState({ ...b, discount_at: null }, Date.parse(at('09:00')))).toBe('fresh')
    expect(freshState(b, Date.parse(at('03:00', '2026-10-01')))).toBe('on_offer')
    expect(freshState(b, Date.parse(at('08:00', '2026-10-01')))).toBe('past')
    expect(freshState({ ...b, cleared: 'sold' }, Date.parse(at('09:00')))).toBe('sold')
    expect(onCounter(b, Date.parse(at('03:00', '2026-10-01')))).toBe(true)
    expect(onCounter({ ...b, cleared: 'binned' }, Date.parse(at('09:00')))).toBe(false)
    expect(shelfShare(b, Date.parse(at('20:00')))).toBeCloseTo(0.5)
  })

  it('puts it on offer at a % off its menu price, or a set price', () => {
    expect(freshOfferPrice(batch(), 3.5)).toEqual({ price: '€2.45', was_price: '€3.50' })
    expect(freshOfferPrice(batch(), null)).toEqual({ price: '-30%', was_price: null })
    expect(freshOfferPrice(batch({ discount: 'price', price: '2 for €5' }), 3.5)).toEqual({ price: '2 for €5', was_price: '€3.50' })
  })

  it('starts the next batch of the same thing like the last one, moved to its time', () => {
    const last = batch({ shelf_life_hours: 8, good_until: at('16:00'), discount_at: at('14:00'), quantity: 10 })
    expect(likeLastTime(' banana BREAD', [last], at('09:00', '2026-10-01'))).toMatchObject({
      shelf_life_hours: 8, quantity: 10, percent_off: 30, discount_at: at('15:00', '2026-10-01'),
    })
    expect(likeLastTime('Brownies', [last], at('09:00'))).toBeNull()
    expect(likeLastTime('Banana bread', [batch({ discount_at: null })], at('09:00'))).toMatchObject({ discount_at: null })
  })

  it('starts a new one made now, keeping a day, 30% off for its last 6 hours', () => {
    const b = newFreshBatch(new Date(at('08:00')))
    expect(b).toMatchObject({ made_at: at('08:00'), shelf_life_hours: 24, discount_at: at('02:00', '2026-10-01'), percent_off: 30 })
    expect(freshProblem({ ...b, name: 'Brownies' }, Date.parse(at('08:00')))).toBeNull()
  })
})

describe('items made here, with a set shelf life', () => {
  const cheesecake = { recipe_id: 'r-cake', shelf_life_hours: 120, offer_hours: 48, discount: 'percent' as const, percent_off: 25, price: null }

  it('starts a batch from its item: its shelf life, and its offer that long before the end (the last 2 days of 5)', () => {
    expect(batchFromItem(cheesecake, at('08:00'))).toEqual({ recipe_id: 'r-cake', shelf_life_hours: 120, discount: 'percent', percent_off: 25, price: null,
      discount_at: at('08:00', '2026-10-03') })
    expect(batchFromItem({ ...cheesecake, offer_hours: null }, at('08:00')).discount_at).toBeNull()
  })

  it('says what stops an item being saved', () => {
    expect(freshItemProblem(cheesecake)).toBeNull()
    expect(freshItemProblem({ ...cheesecake, recipe_id: '' })).toBe('Pick an item from the menu')
    expect(freshItemProblem({ ...cheesecake, shelf_life_hours: 721 })).toBe('Its shelf life is between 1 hour and 30 days')
    expect(freshItemProblem({ ...cheesecake, offer_hours: 120 })).toBe('Start the offer before its shelf life ends')
    expect(freshItemProblem({ ...cheesecake, percent_off: 95 })).toBe('Take between 5% and 90% off')
    expect(freshItemProblem({ ...cheesecake, discount: 'price', price: ' ' })).toBe('Say the offer price, e.g. 2 for €3')
    expect(freshItemProblem({ ...cheesecake, offer_hours: null, discount: 'price', price: null })).toBeNull()
    expect(newFreshItem('r-1')).toMatchObject({ recipe_id: 'r-1', shelf_life_hours: 24, offer_hours: 4 })
  })

  it('finds its batches, newest first: linked to its menu item, or by its name', () => {
    const list = [batch({ id: 'a', name: 'Cheesecake', recipe_id: 'r-cake', made_at: at('08:00') }), batch({ id: 'b', name: 'biscoff cheesecake ', made_at: at('10:00') }),
      batch({ id: 'c', name: 'Biscoff cheesecake', recipe_id: 'r-other', made_at: at('11:00') }), batch({ id: 'd', name: 'Brownies' })]
    expect(batchesOf({ id: 'r-cake', name: 'Biscoff cheesecake' }, list).map(b => b.id)).toEqual(['b', 'a'])
  })

  it('takes Square’s shelf lives: new ones, changed ones (an offer that no longer fits goes), and those Square no longer has kept as set here', () => {
    const recipes = [{ id: 'r-cake', square_id: 'sq-cake' }, { id: 'r-chia', square_id: 'sq-chia' }, { id: 'r-swirl', square_id: 'sq-swirl' }, { id: 'r-own', square_id: null }]
    const items = [
      { id: 'f-chia', recipe_id: 'r-chia', shelf_life_hours: 72, offer_hours: 48, from_square: false },
      { id: 'f-swirl', recipe_id: 'r-swirl', shelf_life_hours: 24, offer_hours: 4, from_square: true },
      { id: 'f-own', recipe_id: 'r-own', shelf_life_hours: 24, offer_hours: null, from_square: false },
    ]
    const read = [{ square_id: 'sq-cake', shelf_life_hours: 120 }, { square_id: 'sq-chia', shelf_life_hours: 48 }, { square_id: 'sq-swirl', shelf_life_hours: null },
      { square_id: 'sq-gone', shelf_life_hours: 24 }]
    expect(squareShelfChanges(read, recipes, items)).toEqual({
      add: [{ recipe_id: 'r-cake', shelf_life_hours: 120, from_square: true }],
      change: [{ id: 'f-chia', patch: { shelf_life_hours: 48, from_square: true, offer_hours: null } }],
      release: ['f-swirl'],
    })
    // Already in step: nothing to do.
    expect(squareShelfChanges([{ square_id: 'sq-swirl', shelf_life_hours: 24 }], recipes, items.slice(1, 2))).toEqual({ add: [], change: [], release: [] })
  })
})
