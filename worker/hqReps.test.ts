// Business Agent's own reps: what a Stripe invoice or refund counts for. What must never break:
//   - commission is on what was actually paid, without IVA, and only for the plan
//   - a year is twelve of the twelve paid months; a trial or a free month earns nothing
//   - a refund takes back the share given back, never more than all of it
import { describe, expect, it } from 'vitest'
import { invoiceCommission, refundShare, type StripeInvoice } from './hqReps'

const monthly = { data: [{ price: { recurring: { interval: 'month' } } }] }
const invoice = (patch: Partial<StripeInvoice>): StripeInvoice =>
  ({ id: 'in_1', customer: 'cus_1', amount_paid: 9559, total: 9559, total_excluding_tax: 7900, tax: 1659, status_transitions: { paid_at: 1_790_000_000 }, lines: monthly, ...patch })

describe('What an invoice counts for', () => {
  it('a month of Pro with IVA: €79 for one month, when it was paid', () => {
    expect(invoiceCommission(invoice({}))).toEqual({ amount: 79, months: 1, paidAt: new Date(1_790_000_000_000).toISOString() })
  })

  it('a year is twelve months', () => {
    expect(invoiceCommission(invoice({ amount_paid: 79000, total: 79000, total_excluding_tax: 79000, tax: 0,
      lines: { data: [{ price: { recurring: { interval: 'year' } } }] } }))).toMatchObject({ amount: 790, months: 12 })
  })

  it('credit on the bill (a free month in part): only what was paid, without its IVA', () => {
    expect(invoiceCommission(invoice({ amount_paid: 4780 }))?.amount).toBe(39.5)
  })

  it('nothing paid (a trial, a whole free month) or no plan on it (pay per use alone): nothing', () => {
    expect(invoiceCommission(invoice({ amount_paid: 0 }))).toBeNull()
    expect(invoiceCommission(invoice({ total: 0, amount_paid: 0 }))).toBeNull()
    expect(invoiceCommission(invoice({ lines: { data: [{ price: { recurring: null } }] } }))).toBeNull()
    expect(invoiceCommission(invoice({ lines: null }))).toBeNull()
  })

  it('without the tax split, the tax is taken off the total', () => {
    expect(invoiceCommission(invoice({ total_excluding_tax: null }))?.amount).toBe(79)
  })
})

describe('A refund', () => {
  it('is the share given back so far, at most all of it', () => {
    expect(refundShare({ id: 'ch_1', customer: 'cus_1', invoice: 'in_1', amount: 9559, amount_refunded: 0 })).toBe(0)
    expect(refundShare({ id: 'ch_1', customer: 'cus_1', invoice: 'in_1', amount: 10000, amount_refunded: 2500 })).toBe(0.25)
    expect(refundShare({ id: 'ch_1', customer: 'cus_1', invoice: 'in_1', amount: 10000, amount_refunded: 12000 })).toBe(1)
    expect(refundShare({ id: 'ch_1', customer: 'cus_1', invoice: 'in_1', amount: 0, amount_refunded: 0 })).toBe(0)
  })
})
