import { describe, expect, it } from 'vitest'
import { lineNet, lineProblem, statusOn, totals } from './quotes'

describe('quotes and estimates', () => {
  it('each line less the discount, IVA at each line’s rate, highest rate first', () => {
    const t = totals([
      { description: 'Latte art class (2 hours)', quantity: 6, unit_price: 20, vat_rate: 21 },
      { description: 'Coffee and pastries', quantity: 6, unit_price: 4.5, vat_rate: 10 },
    ])
    expect(t.byRate).toEqual([{ rate: 21, net: 120, vat: 25.2 }, { rate: 10, net: 27, vat: 2.7 }])
    expect(t).toMatchObject({ net: 147, vat: 27.9, total: 174.9 })
    expect(totals([{ description: 'Hamper', quantity: 20, unit_price: 16, vat_rate: 10 }], 10)).toMatchObject({ net: 288, vat: 28.8, total: 316.8 })
    expect(totals([])).toEqual({ net: 0, vat: 0, total: 0, byRate: [] })
  })

  it('a line rounds to the cent', () => {
    expect(lineNet({ quantity: 3, unit_price: 1.335 })).toBe(4.01)
  })

  it('a sent quote past its last day is expired; the others keep their status', () => {
    expect(statusOn({ status: 'sent', valid_until: '2026-09-29' }, '2026-09-30')).toBe('expired')
    expect(statusOn({ status: 'sent', valid_until: '2026-09-30' }, '2026-09-30')).toBe('sent')
    expect(statusOn({ status: 'accepted', valid_until: '2026-09-01' }, '2026-09-30')).toBe('accepted')
    expect(statusOn({ status: 'draft', valid_until: null }, '2026-09-30')).toBe('draft')
  })

  it('a line needs words, a quantity, a price and one of Spain’s IVA rates', () => {
    const ok = { description: 'Cake', quantity: 1, unit_price: 45, vat_rate: 10 }
    expect(lineProblem(ok)).toBeNull()
    expect(lineProblem({ ...ok, description: ' ' })).toMatch(/description/)
    expect(lineProblem({ ...ok, quantity: 0 })).toMatch(/Quantities/)
    expect(lineProblem({ ...ok, unit_price: -1 })).toMatch(/Prices/)
    expect(lineProblem({ ...ok, vat_rate: 7 })).toMatch(/IVA/)
  })
})
