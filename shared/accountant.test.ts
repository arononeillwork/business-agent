import { describe, expect, it } from 'vitest'
import { claimsOwed, invoiceVat, invoicesDue, netTakings, periodPnl, pnlFigures, returnsDue, runningCosts, vatIn, vatSummary } from './accountant'
import { filingsFor, DEFAULT_TAX_SETTINGS, type FilingRecord } from './tax'
import type { Invoice } from './invoices'

const day = (date: string, gross: number, refunds = 0, payments = 10) => ({ date, gross, refunds, payments })
const inv = (p: Partial<Invoice>): Invoice => ({
  id: Math.random().toString(36).slice(2), direction: 'in', supplier_id: null, party_name: null, party_email: null, party_tax_id: null, number: null,
  issued_on: null, due_on: null, net: null, vat: null, total: null, currency: 'EUR', category: null, status: 'to_pay', paid_on: null, document_id: null,
  source: 'manual', email_id: null, email_from: null, email_subject: null, email_at: null, notes: null, created_at: '2026-09-01T00:00:00Z', ...p,
})

describe('the Accountant: takings and VAT', () => {
  it('the VAT inside an amount that includes it', () => {
    expect(vatIn(110, 10)).toBe(10)
    expect(vatIn(121, 21)).toBe(21)
    expect(vatIn(100, 0)).toBe(0)
    expect(vatIn(113.5, 13.5)).toBe(13.5)
  })

  it('takings for the period, net of refunds, split into without VAT and the VAT', () => {
    const days = [day('2026-07-31', 999), day('2026-08-01', 1100, 0, 100), day('2026-08-15', 1100, 110, 90), day('2026-09-01', 500)]
    expect(netTakings(days, '2026-08-01', '2026-08-31', 10)).toEqual({ gross: 2200, refunds: 110, net: 2090, withoutVat: 1900, vat: 190, payments: 190 })
    expect(netTakings([], '2026-08-01', '2026-08-31', 10)).toEqual({ gross: 0, refunds: 0, net: 0, withoutVat: 0, vat: 0, payments: 0 })
  })

  it('an invoice’s VAT: as written, or its total less its net', () => {
    expect(invoiceVat({ net: 100, vat: 10, total: 110 })).toBe(10)
    expect(invoiceVat({ net: 100, vat: null, total: 121 })).toBe(21)
    expect(invoiceVat({ net: null, vat: null, total: 121 })).toBeNull()
  })

  it('VAT charged on the takings and the sales invoices, less VAT paid on invoices received in the period', () => {
    const invoices = [
      inv({ issued_on: '2026-08-18', vat: 33.64, net: 336.36, total: 370, status: 'paid' }),
      inv({ issued_on: '2026-08-31', net: 545.45, total: 600 }),
      inv({ issued_on: '2026-08-20', vat: 50, status: 'cancelled' }),
      inv({ issued_on: '2026-09-01', vat: 29.09 }),
      inv({ issued_on: '2026-08-10', total: 80 }),
      inv({ direction: 'out', issued_on: '2026-08-12', vat: 40.91, total: 450, status: 'sent' }),
    ]
    const v = vatSummary({ takings: 2090, rate: 10, invoices, from: '2026-08-01', to: '2026-08-31' })
    expect(v).toEqual({ onTakings: 190, onSales: 40.91, onPurchases: 88.19, balance: 142.72, invoices: 4, missing: 1 })
    // More paid than charged: to claim back.
    expect(vatSummary({ takings: 110, rate: 10, invoices, from: '2026-08-01', to: '2026-08-31' }).balance).toBe(-37.28)
  })
})

describe('the Accountant: profit and loss over the period', () => {
  const base = {
    vatRate: 10, employerMultiplier: 1.3, expenses: [{ name: 'Rent', amount: 3100, category: 'Premises', active: true }, { name: 'Beans', amount: 620, category: 'Stock', active: true }],
    entries: [{ profile_id: 'p1', work_date: '2026-08-10', paid_minutes: 600 }, { profile_id: 'p1', work_date: '2026-07-31', paid_minutes: 6000 }],
    shifts: [], rates: new Map([['p1', 10]]), lines: [],
    takings: [day('2026-07-31', 5000), day('2026-08-01', 1100), day('2026-08-20', 2310, 110)],
  }

  it('a whole month: its takings without VAT, a month of running costs, the team from its own timecards', () => {
    const f = pnlFigures(periodPnl(base, '2026-08-01', '2026-08-31', '2026-09-30'))
    expect(f.takings).toBe(3000)
    expect(f.costOfSales).toBe(620)
    expect(f.running).toBe(3100)
    expect(f.pay).toBe(100)
    expect(f.social).toBe(30)
    expect(f.team).toBe(130)
    expect(f.operatingProfit).toBe(3000 - 620 - 130 - 3100)
    expect(f.otherIncome).toBe(0)
  })

  it('part of a month: the running costs for its days only, and nothing after today', () => {
    // 1 to 10 August of a 31-day month, with today the 10th.
    const p = periodPnl(base, '2026-08-01', '2026-08-31', '2026-08-10')
    expect(pnlFigures(p).running).toBe(1000)
    expect(pnlFigures(p).takings).toBe(1000)
    // A fortnight spanning two months counts each one's share.
    const span = periodPnl({ ...base, entries: [], takings: [] }, '2026-07-25', '2026-08-07', '2026-09-30')
    expect(pnlFigures(span).running).toBe(Math.round((3100 * 7 / 31 + 3100 * 7 / 31) * 100) / 100)
  })

  it('one-off income on top of the takings', () => {
    const p = periodPnl({ ...base, lines: [{ month: '2026-08-01', kind: 'income', category: null, label: 'Grant', amount: 500 }] }, '2026-08-01', '2026-08-31', '2026-09-30')
    expect(pnlFigures(p).otherIncome).toBe(500)
    expect(pnlFigures(p).takings).toBe(3000)
  })
})

describe('the Accountant: what’s owed', () => {
  it('invoices received still to pay, overdue first; what customers owe on the ones sent', () => {
    const list = [
      inv({ total: 320, due_on: '2026-10-01', status: 'to_pay' }),
      inv({ total: 600, due_on: '2026-09-15', status: 'to_pay' }),
      inv({ total: 200, due_on: '2026-10-20', status: 'to_check' }),
      inv({ total: 999, status: 'paid' }),
      inv({ total: 50, status: 'cancelled' }),
      inv({ total: 80, status: 'disputed' }),
      inv({ direction: 'out', total: 450, status: 'sent' }),
      inv({ direction: 'out', total: 100, status: 'paid' }),
    ]
    const d = invoicesDue(list, '2026-09-30')
    expect(d.toPay).toEqual({ count: 4, total: 1200 })
    expect(d.overdue).toEqual({ count: 1, total: 600 })
    expect(d.owed).toEqual({ count: 1, total: 450 })
    expect(d.next.map(i => i.total)).toEqual([600, 320, 200, 80])
  })

  it('running costs as a month’s worth, by category, the ones not counted left out', () => {
    const c = runningCosts([
      { amount: 1530, category: 'Premises', active: true }, { amount: 100, category: 'Premises', active: true },
      { amount: 1200, category: 'Software', active: true, frequency: 'yearly' }, { amount: 999, category: 'Premises', active: false },
      { amount: 20, category: null, active: true },
    ])
    expect(c).toEqual({ monthly: 1750, count: 4, categories: [{ name: 'Premises', amount: 1630 }, { name: 'Software', amount: 100 }, { name: 'Uncategorised', amount: 20 }] })
  })

  it('expenses owed back to the team, by person; those to approve; what was paid back in the period', () => {
    const c = claimsOwed([
      { profile_id: 'maria', status: 'approved', amount: 6, paid_on: null },
      { profile_id: 'julio', status: 'approved', amount: 12.5, paid_on: null },
      { profile_id: 'maria', status: 'approved', amount: 10, paid_on: null },
      { profile_id: 'julio', status: 'submitted', amount: 4.94, paid_on: null },
      { profile_id: 'mark', status: 'paid', amount: 8.4, paid_on: '2026-09-28' },
      { profile_id: 'aron', status: 'paid', amount: 32.24, paid_on: '2026-08-31' },
      { profile_id: 'julio', status: 'rejected', amount: 23.5, paid_on: null },
    ], '2026-09-01', '2026-09-30')
    expect(c.toPayBack).toBe(28.5)
    expect(c.people).toEqual([{ profile_id: 'maria', amount: 16 }, { profile_id: 'julio', amount: 12.5 }])
    expect(c.toApprove).toEqual({ count: 1, total: 4.94 })
    expect(c.paidBack).toBe(8.4)
  })
})

describe('the Accountant: the next tax returns', () => {
  const s = DEFAULT_TAX_SETTINGS
  const rec = (model: string, year: number, period: FilingRecord['period'], status: FilingRecord['status']): FilingRecord =>
    ({ model, year, period, status, amount: null, filed_on: null, reference: null, notes: null })

  it('what’s due next, the filed ones left out; overdue only this year’s', () => {
    const filings = [...filingsFor(2025, s), ...filingsFor(2026, s)]
    const records = [rec('303', 2026, '2T', 'filed'), rec('111', 2026, '2T', 'filed'), rec('115', 2026, '2T', 'not_needed'), rec('303', 2026, '1T', 'filed')]
    const { next, overdue } = returnsDue(filings, records, '2026-09-30')
    expect(next.slice(0, 3).map(f => `${f.model} ${f.period}`)).toEqual(['111 3T', '115 3T', '303 3T'])
    expect(next[0].due).toBe('2026-10-20')
    // Last year's (all due by July) aren't counted as overdue here; this year's first quarter 111 and 115 are.
    expect(overdue.map(f => `${f.model} ${f.year} ${f.period}`)).toEqual(['111 2026 1T', '115 2026 1T'])
  })

  it('in January, last year’s last quarter and year summaries are next', () => {
    const { next } = returnsDue([...filingsFor(2025, s), ...filingsFor(2026, s)], [], '2026-01-12')
    expect(next.slice(0, 2).map(f => `${f.model} ${f.year} ${f.period}`)).toEqual(['111 2025 4T', '115 2025 4T'])
  })
})
