import { describe, expect, it } from 'vitest'
import {
  matchPriceList,
  costWithVat, emailLink, isLow, lastPriceChanges, risesSince, nextOrderDay, orderList, orderMessage, readNumber, readStockCsv, retailMargin, stockValue, suggestedOrder, whatsappLink,
  type StockItem, type Supplier,
} from './stock'

const supplier = (s: Partial<Supplier> = {}): Supplier => ({
  id: 'dairy', name: 'Lácteos Costa', kind: 'Dairy', contact_name: 'Paco', email: 'pedidos@lacteos.test', phone: '+34 611 222 333', whatsapp: true,
  website: null, order_url: null, address: null, account_number: null, order_days: ['mon', 'wed', 'fri'], cutoff: '12:00', lead_days: 1,
  minimum_order: 60, payment_terms: null, notes: null, active: true, ...s,
})
const item = (i: Partial<StockItem> = {}): StockItem => ({
  id: 'oat', name: 'Oat milk', category: 'Milk & dairy', supplier_id: 'dairy', supplier_sku: 'AV-1L', product_url: null, unit: 'l', pack_size: '6 × 1 l',
  order_multiple: 6, cost_per_unit: 1.45, vat_rate: 10, sell_price: null, on_hand: 8, par_level: 24, reorder_at: 10, location: 'Storeroom',
  retail: false, notes: null, active: true, updated_at: '2026-09-30T07:00:00Z', ...i,
})

describe('low stock and what to order', () => {
  it('low means down to the reorder level; no level, never low', () => {
    expect(isLow(item({ on_hand: 10 }))).toBe(true)
    expect(isLow(item({ on_hand: 11 }))).toBe(false)
    expect(isLow(item({ reorder_at: null, on_hand: 0 }))).toBe(false)
    expect(isLow(item({ active: false, on_hand: 0 }))).toBe(false)
  })

  it('orders up to par in whole cases; without a par, back to twice the reorder level', () => {
    expect(suggestedOrder(item({ on_hand: 8 }))).toBe(18) // 16 needed → 3 cases of 6
    expect(suggestedOrder(item({ on_hand: 11 }))).toBe(0)
    expect(suggestedOrder(item({ on_hand: 2, par_level: null, reorder_at: 5, order_multiple: 1 }))).toBe(8)
    expect(suggestedOrder(item({ on_hand: 0.5, par_level: 3, reorder_at: 1, order_multiple: 0.5, unit: 'kg' }))).toBe(2.5)
  })

  it('the order list groups by supplier, adds IVA, and says when it’s under the minimum', () => {
    const items = [item(), item({ id: 'whole', name: 'Whole milk', cost_per_unit: 0.95, on_hand: 3 }),
      item({ id: 'cups', name: 'Cups 8oz', supplier_id: null, cost_per_unit: 0.08, vat_rate: 21, unit: 'unit', order_multiple: 1000, on_hand: 200, par_level: 2000, reorder_at: 500 }),
      item({ id: 'fine', name: 'Almond milk', on_hand: 20 })]
    const [dairy, none] = orderList(items, [supplier()])
    expect(dairy.supplier?.name).toBe('Lácteos Costa')
    expect(dairy.lines.map(l => [l.item.name, l.qty])).toEqual([['Oat milk', 18], ['Whole milk', 24]])
    expect(dairy.net).toBe(48.9) // 18 × 1.45 + 24 × 0.95
    expect(dairy.gross).toBe(53.79)
    expect(dairy.short).toBe(11.1)
    expect(none.supplier).toBeNull()
    expect(none.lines[0]).toMatchObject({ qty: 2000, net: 160, gross: 193.6 })
  })
})

describe('when to order', () => {
  // Wednesday 30 Sep 2026 in Madrid (CEST, UTC+2).
  it('today if it’s an order day and before the cut-off, else the next order day', () => {
    expect(nextOrderDay(supplier(), new Date('2026-09-30T07:00:00Z'))).toEqual({ date: '2026-09-30', by: '12:00', arrives: '2026-10-01' })
    expect(nextOrderDay(supplier(), new Date('2026-09-30T10:30:00Z'))).toEqual({ date: '2026-10-02', by: '12:00', arrives: '2026-10-03' })
    expect(nextOrderDay(supplier({ order_days: ['wed'], cutoff: null, lead_days: 2 }), new Date('2026-09-30T20:00:00Z')))
      .toEqual({ date: '2026-09-30', by: null, arrives: '2026-10-02' })
    expect(nextOrderDay(supplier({ order_days: ['wed'] }), new Date('2026-09-30T11:00:00Z'))?.date).toBe('2026-10-07')
    expect(nextOrderDay(supplier({ order_days: [] }), new Date())).toBeNull()
  })
})

describe('worth and margins', () => {
  it('stock value is units in × cost; a shop item’s margin is on its price without IVA', () => {
    expect(stockValue([item(), item({ on_hand: 2, cost_per_unit: 18.5 }), item({ cost_per_unit: null }), item({ on_hand: -3 }), item({ active: false })])).toBe(48.6)
    expect(retailMargin(item({ sell_price: 16.5, cost_per_unit: 7.2, vat_rate: 10 }))).toBe(52)
    expect(retailMargin(item({ sell_price: null }))).toBeNull()
  })
})

describe('the message to the supplier', () => {
  it('in Spanish by default, with packs, references, the account and the delivery day', () => {
    const [order] = orderList([item(), item({ id: 'w', name: 'Whole milk', supplier_sku: null, pack_size: null, on_hand: 3 })], [supplier({ account_number: 'C-1042' })])
    expect(orderMessage(order, 'Easy Beans Coffee', 'es', '2026-10-01')).toBe(
      'Hola Paco, os hago un pedido para Easy Beans Coffee (cliente C-1042):\n'
      + '- 18 l · Oat milk (6 × 1 l, ref. AV-1L)\n- 24 l · Whole milk\n'
      + 'Para entregar el jueves, 1 de octubre, si puede ser.\n¡Gracias!')
    expect(orderMessage(order, 'Easy Beans Coffee', 'en')).toBe(
      'Hello Paco, here\'s an order for Easy Beans Coffee (account C-1042):\n- 18 l · Oat milk (6 × 1 l, ref AV-1L)\n- 24 l · Whole milk\nThank you!')
  })

  it('opens WhatsApp or email with it written', () => {
    expect(whatsappLink('+34 611 222 333', 'Hola, 2 × café')).toBe('https://wa.me/34611222333?text=Hola%2C%202%20%C3%97%20caf%C3%A9')
    expect(emailLink('a@b.es', 'Pedido', 'Hola\nGracias')).toBe('mailto:a@b.es?subject=Pedido&body=Hola%0AGracias')
  })
})

describe('importing a price list', () => {
  it('reads Spanish or English headings, decimal commas and units', () => {
    const csv = 'Producto;Proveedor;Ref;Unidad;Formato;Coste;IVA;PVP;Stock;Mínimo;Máximo\n'
      + 'Café Brasil 1kg;Tostadores Sur;BR-1;kilos;1 kg;18,50 €;10;;4;2;8\n'
      + ';;;;;;;;;;\n'
      + 'Bolsa café 250 g;Tostadores Sur;;bolsa;;5,20;10;12,50;10;5;20\n'
      + ';Sin nombre;;;;;;;;;\n'
    const r = readStockCsv(new TextEncoder().encode(csv))
    expect(r.columns.filter(c => c.field).map(c => c.field)).toEqual(['name', 'supplier', 'sku', 'unit', 'pack', 'cost', 'vat', 'price', 'on_hand', 'reorder', 'par'])
    expect(r.rows).toHaveLength(2)
    expect(r.skipped).toBe(1)
    expect(r.rows[0]).toMatchObject({ name: 'Café Brasil 1kg', supplier: 'Tostadores Sur', supplier_sku: 'BR-1', unit: 'kg', cost_per_unit: 18.5,
      on_hand: 4, reorder_at: 2, par_level: 8, retail: false })
    expect(r.rows[1]).toMatchObject({ unit: 'bag', sell_price: 12.5, retail: true })
  })

  it('numbers as people type them', () => {
    expect(readNumber('1.234,56')).toBe(1234.56)
    expect(readNumber('1,234.56')).toBe(1234.56)
    expect(readNumber('0,08 €')).toBe(0.08)
    expect(readNumber('')).toBeNull()
    expect(readNumber('n/a')).toBeNull()
  })
})

describe('wholesale prices over time', () => {
  const p = (item_id: string, cost_per_unit: number, changed_at: string) => ({ item_id, cost_per_unit, changed_at })
  it('each item’s last change, from the price before it; unchanged items have none', () => {
    const changes = lastPriceChanges([
      p('beans', 22, '2026-04-01T09:00:00Z'), p('beans', 23.5, '2026-08-01T09:00:00Z'), p('beans', 24.2, '2026-09-20T09:00:00Z'),
      p('milk', 0.95, '2026-04-01T09:00:00Z'), p('milk', 0.89, '2026-09-01T09:00:00Z'),
      p('cups', 0.08, '2026-04-01T09:00:00Z'),
      p('lids', 0.03, '2026-04-01T09:00:00Z'), p('lids', 0.03, '2026-06-01T09:00:00Z'),
    ])
    expect(changes).toEqual([
      { item_id: 'beans', from: 23.5, to: 24.2, pct: 3, at: '2026-09-20T09:00:00Z' },
      { item_id: 'milk', from: 0.95, to: 0.89, pct: -6.3, at: '2026-09-01T09:00:00Z' },
    ])
    expect(risesSince(changes, '2026-07-01').map(c => c.item_id)).toEqual(['beans'])
    expect(risesSince(changes, '2026-09-21')).toEqual([])
  })

  it('cost with IVA on top', () => {
    expect(costWithVat({ cost_per_unit: 24.2, vat_rate: 10 })).toBe(26.62)
    expect(costWithVat({ cost_per_unit: 0.08, vat_rate: 21 })).toBe(0.1)
    expect(costWithVat({ cost_per_unit: null, vat_rate: 10 })).toBeNull()
  })
})

describe('a price list again', () => {
  const item = (id: string, name: string, extra: Partial<StockItem> = {}): StockItem => ({
    id, name, category: null, supplier_id: 'roaster', supplier_sku: null, product_url: null, unit: 'kg', pack_size: null, order_multiple: 1,
    cost_per_unit: 20, vat_rate: 10, sell_price: null, on_hand: 3, par_level: null, reorder_at: null, location: null, retail: false, notes: null,
    active: true, updated_at: '2026-09-01T09:00:00Z', ...extra,
  })
  const items = [item('house', 'House espresso', { supplier_sku: 'ESP-1' }), item('decaf', 'Decaf', { cost_per_unit: 25 }),
    item('milk', 'Whole milk', { supplier_id: 'dairy', unit: 'l', cost_per_unit: 0.95 })]
  const supplierId = (name?: string | null) => ({ 'tostadores sur': 'roaster', 'lácteos': 'dairy' } as Record<string, string>)[name?.trim().toLowerCase() ?? ''] ?? null
  const file = (text: string) => readStockCsv(new TextEncoder().encode(text))

  it('the same reference or name updates the item (only what the file has); the rest are new', () => {
    const m = matchPriceList(file('Ref;Producto;Proveedor;Coste\n'
      + 'ESP-1;House espresso blend 1kg;Tostadores Sur;21,40\n' // by reference, though renamed
      + ';decaf;Tostadores Sur;25\n' // by name: same price, nothing to change
      + ';Whole milk;Tostadores Sur;0,90\n' // another supplier's milk: a new item
      + ';Guest filter;Tostadores Sur;19\n'), items, supplierId)
    expect(m.updates).toEqual([{ item: items[0], patch: { cost_per_unit: 21.4 } }])
    expect(m.unchanged).toBe(1)
    expect(m.added.map(a => [a.name, a.supplier_id])).toEqual([['Whole milk', 'roaster'], ['Guest filter', 'roaster']])
  })

  it('a column the file doesn’t have leaves that alone', () => {
    expect(matchPriceList(file('Item,Cost\nDecaf,26\n'), items, supplierId).updates[0].patch).toEqual({ cost_per_unit: 26 }) // IVA, unit and pack untouched
  })
})
