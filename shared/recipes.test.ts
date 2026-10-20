import { describe, expect, it } from 'vitest'
import { convert, costing, lineCost, linesFor, priceForTarget, unitsFor, wasteSummary, type Recipe } from './recipes'
import type { StockItem } from './stock'

const item = (id: string, unit: StockItem['unit'], cost: number | null, name = id): StockItem => ({
  id, name, category: null, supplier_id: null, supplier_sku: null, product_url: null, unit, pack_size: null, order_multiple: 1, cost_per_unit: cost,
  vat_rate: 10, sell_price: null, on_hand: 0, par_level: null, reorder_at: null, location: null, retail: false, notes: null, active: true, updated_at: '',
})
const items = [item('beans', 'kg', 18.5), item('whole', 'l', 0.95), item('oat', 'l', 1.45), item('cup', 'unit', 0.08), item('lid', 'unit', 0.04),
  item('syrup', 'bottle', null, 'Syrup')]
const flatWhite: Recipe = {
  id: 'fw', name: 'Flat white', category: 'Coffee', square_item: null, sell_price: 3.2, vat_rate: 10, target_margin: 70, wastage_pct: 0, notes: null, active: true,
  variants: [{ id: 'v-oat', name: 'Oat milk', price_change: 0.4 }, { id: 'v-shot', name: 'Extra shot', price_change: 0.5 }],
  lines: [
    { item_id: 'beans', quantity: 18, unit: 'g', variant_id: null, replaces_item_id: null },
    { item_id: 'whole', quantity: 180, unit: 'ml', variant_id: null, replaces_item_id: null },
    { item_id: 'cup', quantity: 1, unit: 'unit', variant_id: null, replaces_item_id: null },
    { item_id: 'lid', quantity: 1, unit: 'unit', variant_id: null, replaces_item_id: null },
    { item_id: 'oat', quantity: 180, unit: 'ml', variant_id: 'v-oat', replaces_item_id: 'whole' },
    { item_id: 'beans', quantity: 9, unit: 'g', variant_id: 'v-shot', replaces_item_id: null },
  ],
}

describe('units', () => {
  it('converts grams and kilos, millilitres and litres; nothing else mixes', () => {
    expect(convert(18, 'g', 'kg')).toBe(0.018)
    expect(convert(1.5, 'l', 'ml')).toBe(1500)
    expect(convert(2, 'unit', 'unit')).toBe(2)
    expect(convert(1, 'g', 'ml')).toBeNull()
    expect(convert(1, 'unit', 'kg')).toBeNull()
    expect(unitsFor('kg')).toEqual(['g', 'kg'])
    expect(unitsFor('bottle')).toEqual(['bottle'])
  })
  it('a line costs its quantity in the item’s unit × the item’s cost', () => {
    expect(lineCost({ quantity: 18, unit: 'g' }, items[0])).toBeCloseTo(0.333)
    expect(lineCost({ quantity: 1, unit: 'g' }, items[1])).toBeNull()
    expect(lineCost({ quantity: 1, unit: 'bottle' }, items[5])).toBeNull()
  })
})

describe('what a serving costs and makes', () => {
  it('a flat white: 18 g beans + 180 ml milk + cup + lid, against €3.20 with 10% IVA', () => {
    const c = costing(flatWhite, items)
    expect(c.cost).toBeCloseTo(0.624) // 0.333 + 0.171 + 0.08 + 0.04
    expect(c.net).toBeCloseTo(2.9091, 4)
    expect(c.margin).toBeCloseTo(2.2851, 3)
    expect(c.marginPct).toBe(78.6)
    expect(c.below).toBe(false)
    expect(c.missing).toEqual([])
  })
  it('a variant swaps or adds items and changes the price', () => {
    expect(linesFor(flatWhite, 'v-oat').map(l => l.item_id)).toEqual(['beans', 'cup', 'lid', 'oat'])
    const oat = costing(flatWhite, items, 'v-oat')
    expect(oat.cost).toBeCloseTo(0.714) // milk 0.171 → oat 0.261
    expect(oat.price).toBe(3.6)
    const shot = costing(flatWhite, items, 'v-shot')
    expect(shot.cost).toBeCloseTo(0.7905)
    expect(shot.price).toBe(3.7)
  })
  it('the waste allowance adds to the cost; below the target margin is flagged', () => {
    const c = costing({ ...flatWhite, wastage_pct: 10, sell_price: 1.8, target_margin: 70 }, items)
    expect(c.cost).toBeCloseTo(0.6864)
    expect(c.marginPct).toBe(58.1)
    expect(c.below).toBe(true)
  })
  it('items with no cost are left out and named; no price, no margin', () => {
    const c = costing({ ...flatWhite, sell_price: null, lines: [...flatWhite.lines, { item_id: 'syrup', quantity: 1, unit: 'bottle', variant_id: null, replaces_item_id: null }] }, items)
    expect(c.missing).toEqual(['Syrup'])
    expect(c.margin).toBeNull()
    expect(c.below).toBe(false)
  })
  it('the price for the target margin, rounded up to 5 cents', () => {
    expect(priceForTarget(0.624, 70, 10)).toBe(2.3) // 2.288 with IVA → 2.30
    expect(priceForTarget(1, 75, 10)).toBe(4.4)
    expect(priceForTarget(1, 100, 10)).toBeNull()
  })
})

describe('waste', () => {
  it('costs the waste, ranks what’s wasted most and compares it with deliveries', () => {
    const s = wasteSummary([
      { item_id: 'oat', reason: 'waste', change: -2 }, { item_id: 'beans', reason: 'waste', change: -0.1 }, { item_id: 'oat', reason: 'waste', change: -1 },
      { item_id: 'oat', reason: 'delivery', change: 24 }, { item_id: 'beans', reason: 'delivery', change: 2 }, { item_id: 'cup', reason: 'used', change: -50 },
    ], items)
    expect(s.cost).toBe(6.2) // 3 × 1.45 + 0.1 × 18.5
    expect(s.top.map(t => [t.name, t.quantity, t.cost])).toEqual([['oat', 3, 4.35], ['beans', 0.1, 1.85]])
    expect(s.ofPurchases).toBe(8.6) // 6.20 of 71.80 delivered
    expect(wasteSummary([], items)).toEqual({ cost: 0, top: [], ofPurchases: null })
  })
})
