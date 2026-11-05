import { describe, expect, it } from 'vitest'
import { defaultDiscountAt, freshOfferPrice, freshProblem, freshState, goodUntil, likeLastTime, newFreshBatch, onCounter, shelfShare, type FreshBatch } from './freshBatches'

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
