import { describe, expect, it } from 'vitest'
import { afterPayment, grantLine, isMoneyLink, itemLine, linkSite, moneyLines, statusOf, suggestedPayment, totals, type MoneyItem } from './creditDebit'
import type { GrantApplication } from './grants'

const item = (p: Partial<MoneyItem>): MoneyItem => ({ id: 'i1', direction: 'debit', kind: 'loan', name: 'Loan from Jeremy', party: 'Jeremy', amount: 1000,
  instalment: null, every_months: null, next_due: null, possible: false, done: false, notes: null, link: null, payments: [], ...p })
const pay = (amount: number, paid_on = '2026-10-01') => ({ id: crypto.randomUUID(), item_id: 'i1', paid_on, amount, note: null })
const grant = (p: Partial<GrantApplication>): GrantApplication => ({ id: 'g1', grant_id: 'talento-joven', grant_name: 'Hiring grant: Talento Joven',
  stage: 'gathering', submitted_on: null, expediente: null, amount_requested: 5000, amount_awarded: null, amount_received: null, deadline: null,
  deadline_label: null, notes: null, docs_done: [], obligations_done: [], created_at: '', updated_at: '', ...p })

describe('credit and debit', () => {
  it('a link is a web address, shown by its site', () => {
    const listing = 'https://donedealespana.vercel.app/#/item/207afb06-86e1-406a-9db3-9b60ac5ccd36'
    expect(isMoneyLink(listing)).toBe(true)
    expect(isMoneyLink('http://www.example.com/agreement.pdf')).toBe(true)
    expect(isMoneyLink('donedealespana.vercel.app')).toBe(false)
    expect(isMoneyLink('javascript:alert(1)')).toBe(false)
    expect(isMoneyLink('https://example.com/a b')).toBe(false)
    expect(isMoneyLink(`https://example.com/${'x'.repeat(500)}`)).toBe(false)
    expect(linkSite(listing)).toBe('donedealespana.vercel.app')
    expect(linkSite('http://www.example.com/agreement.pdf')).toBe('example.com')
  })

  it('a payment for this period moves the date on a period; an old one typed in later leaves it; the last one closes it', () => {
    const loan = { amount: 1000, every_months: 1, next_due: '2026-11-01', done: false, possible: false }
    expect(afterPayment(loan, 100, '2026-10-28')).toEqual({ next_due: '2026-12-01', done: false, possible: false })
    expect(afterPayment(loan, 100, '2026-11-05')).toMatchObject({ next_due: '2026-12-01' }) // late
    expect(afterPayment(loan, 100, '2026-09-15')).toMatchObject({ next_due: '2026-11-01' }) // typed in afterwards
    expect(afterPayment(loan, 1000, '2026-10-28')).toEqual({ next_due: null, done: true, possible: false })
    expect(afterPayment({ ...loan, every_months: null }, 100, '2026-10-28')).toMatchObject({ next_due: '2026-11-01', done: false }) // in one go
    expect(afterPayment({ ...loan, next_due: '2027-01-31' }, 100, '2027-01-30')).toMatchObject({ next_due: '2027-02-28' }) // month's end kept
    expect(afterPayment({ ...loan, done: true }, 100, '2026-10-28')).toMatchObject({ next_due: '2026-11-01', done: true })
  })

  it('money coming in for something that could be raised makes it agreed', () => {
    const sale = { amount: 1200, every_months: null, next_due: null, done: false, possible: true }
    expect(afterPayment(sale, 500, '2026-10-28')).toEqual({ next_due: null, done: false, possible: false })
  })

  it('an item: what’s been paid and what’s left; paid off counts as done', () => {
    expect(itemLine(item({ payments: [pay(100), pay(150.5)] }))).toMatchObject({ settled: 250.5, left: 749.5, done: false })
    expect(itemLine(item({ payments: [pay(600), pay(400)], next_due: '2026-12-01' }))).toMatchObject({ left: 0, done: true, next_due: null })
    // Settled for less (sold below the asking price): done, nothing left.
    expect(itemLine(item({ direction: 'credit', kind: 'sale', amount: 1200, possible: true, done: true, payments: [pay(900)] })))
      .toMatchObject({ settled: 900, left: 0, done: true })
    expect(itemLine(item({ possible: true })).possible).toBe(false) // only money coming in is "possible"
  })

  it('a grant: possible while applying, the awarded amount once awarded, less what’s come in; rejected ones are left out', () => {
    expect(grantLine(grant({}))).toMatchObject({ key: 'grant:g1', direction: 'credit', kind: 'grant', amount: 5000, left: 5000, possible: true, done: false })
    expect(grantLine(grant({ stage: 'awarded', amount_awarded: 4000, amount_received: 1500 }))).toMatchObject({ amount: 4000, settled: 1500, left: 2500, possible: false })
    expect(grantLine(grant({ stage: 'paid', amount_awarded: 4000, amount_received: 4000 }))).toMatchObject({ left: 0, done: true })
    expect(grantLine(grant({ stage: 'closed', amount_awarded: 4000, amount_received: 3000 }))).toMatchObject({ left: 0, done: true })
    expect(grantLine(grant({ stage: 'interested', amount_requested: null }))).toMatchObject({ amount: null, left: 0, done: false })
    expect(grantLine(grant({ stage: 'rejected' }))).toBeNull()
    expect(moneyLines([item({})], [grant({}), grant({ id: 'g2', stage: 'rejected' })]).map(l => l.key)).toEqual(['i1', 'grant:g1'])
  })

  it('overdue, due within a week, could raise, open or done', () => {
    const day = '2026-10-24'
    expect(statusOf({ done: false, next_due: '2026-10-23', possible: false }, day)).toBe('overdue')
    expect(statusOf({ done: false, next_due: '2026-10-31', possible: false }, day)).toBe('due')
    expect(statusOf({ done: false, next_due: '2026-11-01', possible: false }, day)).toBe('open')
    expect(statusOf({ done: false, next_due: null, possible: true }, day)).toBe('possible')
    expect(statusOf({ done: true, next_due: '2026-10-01', possible: false }, day)).toBe('done')
  })

  it('totals: still to pay, a month’s payments, coming in, and what could be raised', () => {
    const lines = moneyLines([
      item({ instalment: 100, every_months: 1, payments: [pay(200)] }),
      item({ id: 'i2', kind: 'finance', name: 'Coffee machine', amount: 3000, instalment: 300, every_months: 3 }),
      item({ id: 'i3', name: 'Almost paid', amount: 500, instalment: 100, every_months: 1, payments: [pay(450)] }),
      item({ id: 'i4', name: 'Paid off', amount: 50, payments: [pay(50)] }),
      item({ id: 'i5', direction: 'credit', kind: 'sale', name: 'Old coffee machine', amount: 1200, possible: true }),
      item({ id: 'i6', direction: 'credit', kind: 'deposit', name: 'Deposit back', amount: 400 }),
    ], [grant({}), grant({ id: 'g2', stage: 'awarded', amount_awarded: 2000, amount_received: 500 })])
    expect(totals(lines)).toEqual({ toPay: 800 + 3000 + 50, monthly: 100 + 100 + 50, comingIn: 400 + 1500, couldRaise: 1200 + 5000 })
  })

  it('a payment is suggested at the instalment, or what’s left when that’s less', () => {
    expect(suggestedPayment({ instalment: 100, left: 800 })).toBe(100)
    expect(suggestedPayment({ instalment: 100, left: 50 })).toBe(50)
    expect(suggestedPayment({ instalment: null, left: 1200 })).toBe(1200)
  })
})
