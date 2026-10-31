import { describe, expect, it } from 'vitest'
import {
  closingOn, deliveryUseBy, dueLastDayOffers, isLastDay, isPastUseBy, lastDayNote, lastDayPrice, lastDayRuleProblem, newLastDayRule, offerWindow, ruleFor,
  type LastDayRule,
} from './lastDayOffers'
import type { StockItem } from './stock'
import type { OpeningHours } from './types'

const TZ = 'Europe/Madrid'
// Friday 30 October 2026: Madrid is UTC+1 (the clocks went back on the 25th).
const DAY = '2026-10-30'
const HOURS: OpeningHours = { fri: { open: '09:00', close: '15:00' }, sat: { open: '09:00', close: '15:00' }, sun: null }
const item = (p: Partial<StockItem>): StockItem => ({ id: 'croissants', name: 'Butter croissants', category: 'Bakery', supplier_id: null, supplier_sku: null,
  product_url: null, unit: 'unit', pack_size: null, order_multiple: 1, cost_per_unit: 0.85, vat_rate: 10, sell_price: 2.8, on_hand: 9, par_level: null,
  reorder_at: null, location: null, retail: false, notes: null, active: true, updated_at: '', sell_within_days: 1, use_by: DAY, ...p })
const rule = (p: Partial<LastDayRule> = {}): LastDayRule => ({ ...newLastDayRule(), id: 'r', name: 'Today’s bakes', ...p })

describe('last-day offers', () => {
  it('knows which items are on their last day', () => {
    expect(isLastDay(item({}), DAY)).toBe(true)
    expect(isLastDay(item({ on_hand: 0 }), DAY)).toBe(false)
    expect(isLastDay(item({ use_by: '2026-10-31' }), DAY)).toBe(false)
    expect(isLastDay(item({ use_by: null }), DAY)).toBe(false)
    expect(isLastDay(item({ active: false }), DAY)).toBe(false)
    expect(isPastUseBy(item({ use_by: '2026-10-29' }), DAY)).toBe(true)
    expect(isPastUseBy(item({ use_by: '2026-10-29', on_hand: 0 }), DAY)).toBe(false)
    expect(isPastUseBy(item({}), DAY)).toBe(false)
  })

  it('works out a delivery’s use-by from the days it sells for, or takes the date given', () => {
    expect(deliveryUseBy(1, DAY)).toBe(DAY)
    expect(deliveryUseBy(3, DAY)).toBe('2026-11-01')
    expect(deliveryUseBy(null, DAY)).toBeNull()
    expect(deliveryUseBy(1, DAY, '2026-11-04')).toBe('2026-11-04')
  })

  it('finds the first switched-on rule that covers an item', () => {
    const bakes = rule({ id: 'bakes', categories: ['Bakery'], sort: 1 })
    const just = rule({ id: 'just', categories: [], item_ids: ['croissants'], sort: 0 })
    const all = rule({ id: 'all', categories: [], item_ids: [], sort: 2 })
    expect(ruleFor(item({}), [bakes, just])?.id).toBe('just')
    expect(ruleFor(item({}), [bakes, { ...just, active: false }])?.id).toBe('bakes')
    expect(ruleFor(item({ id: 'milk', category: 'Milk & dairy' }), [bakes, just])).toBeNull()
    expect(ruleFor(item({ id: 'milk', category: 'Milk & dairy' }), [bakes, all])?.id).toBe('all')
  })

  it('runs from the rule’s time until closing, in the café’s time zone', () => {
    expect(closingOn(HOURS, DAY, TZ)).toBe('2026-10-30T14:00:00.000Z')
    expect(closingOn(HOURS, '2026-11-01', TZ)).toBeNull()
    expect(closingOn({ fri: { open: '18:00', close: '01:00' } }, DAY, TZ)).toBe('2026-10-31T00:00:00.000Z')
    expect(offerWindow(rule({ minutes_before_close: 120 }), HOURS, DAY, TZ)).toEqual({ starts: '2026-10-30T12:00:00.000Z', ends: '2026-10-30T14:00:00.000Z' })
    expect(offerWindow(rule(), HOURS, '2026-11-01', TZ)).toBeNull()
  })

  it('takes the discount off the shop price, crossing out the usual', () => {
    expect(lastDayPrice(rule({ percent_off: 30 }), 2.8)).toEqual({ price: '€1.96', was_price: '€2.80' })
    expect(lastDayPrice(rule({ percent_off: 50 }), 3.5)).toEqual({ price: '€1.75', was_price: '€3.50' })
    expect(lastDayPrice(rule({ percent_off: 30 }), null)).toEqual({ price: '-30%', was_price: null })
    expect(lastDayPrice(rule({ discount: 'price', price: '2 for €3' }), 2.1)).toEqual({ price: '2 for €3', was_price: '€2.10' })
  })

  it('puts an item on offer once, from the rule’s time until closing', () => {
    const rules = [rule({ categories: ['Bakery'] })]
    const items = [item({}), item({ id: 'cake', name: 'Almond cake', use_by: '2026-10-31' }), item({ id: 'milk', name: 'Oat milk', category: 'Milk & dairy' })]
    const at = (time: string) => Date.parse(`${DAY}T${time}:00+01:00`)
    expect(dueLastDayOffers(items, rules, new Set(), HOURS, at('12:59'), TZ)).toEqual([])
    const due = dueLastDayOffers(items, rules, new Set(), HOURS, at('13:30'), TZ)
    expect(due.map(d => d.item.name)).toEqual(['Butter croissants'])
    expect(due[0]).toMatchObject({ starts: '2026-10-30T12:30:00.000Z', ends: '2026-10-30T14:00:00.000Z' })
    expect(dueLastDayOffers(items, rules, new Set(['croissants']), HOURS, at('13:30'), TZ)).toEqual([])
    expect(dueLastDayOffers(items, rules, new Set(), HOURS, at('15:00'), TZ)).toEqual([])
    expect(dueLastDayOffers(items, [{ ...rules[0], active: false }], new Set(), HOURS, at('13:30'), TZ)).toEqual([])
    // Closed on Sunday: nothing, whatever's left.
    expect(dueLastDayOffers([item({ use_by: '2026-11-01' })], rules, new Set(), HOURS, Date.parse('2026-11-01T13:30:00+01:00'), TZ)).toEqual([])
  })

  it('says what stops a rule being saved', () => {
    const ok = rule()
    expect(lastDayRuleProblem(ok)).toBeNull()
    expect(lastDayRuleProblem({ ...ok, name: ' ' })).toBe('Give the rule a name')
    expect(lastDayRuleProblem({ ...ok, percent_off: 95 })).toMatch(/90%/)
    expect(lastDayRuleProblem({ ...ok, discount: 'price', price: '' })).toMatch(/offer price/)
    expect(lastDayRuleProblem({ ...ok, minutes_before_close: 5 })).toMatch(/15 minutes/)
  })

  it('writes the bell’s note as the database does', () => {
    expect(lastDayNote({ name: 'Butter croissants', on_hand: 9 }, '€1.96', '15:00')).toEqual({
      title: 'On offer till closing: Butter croissants',
      body: '9 left on their last day, €1.96 until 15:00. Square isn’t changed: take the offer price at the till.',
    })
  })
})
