// The coffee club's rules (shared/coffeeClub.ts): what can be set, how a member stands, why a coffee didn't count,
// and the line on the till, in English and Spanish, which leaves the team's own note alone.
import { describe, expect, it } from 'vitest'
import { clubInputProblem, clubProblem, clubTotals, noteLine, standing, weekOf, withNoteLine, withoutNoteLine, CLUB_DEFAULTS } from './coffeeClub'
import { clubLines, paidBySubscription } from '../worker/providers/squareClub'

const club = { name: 'Coffee club', coffees_per_week: 1, till_language: 'en' as const }
const member = { status: 'active' as const, paid: true, started_on: '2026-11-01', used_this_week: 0 }

describe('The coffee club', () => {
  it('takes a name, €1 to €200 a month, 1 to 14 coffees a week and up to €50 off a drink, in cents', () => {
    expect(clubInputProblem(CLUB_DEFAULTS)).toBeNull()
    expect(clubInputProblem({ ...CLUB_DEFAULTS, name: '  ' })).toMatch(/name/)
    expect(clubInputProblem({ ...CLUB_DEFAULTS, price: 0.5 })).toMatch(/price/)
    expect(clubInputProblem({ ...CLUB_DEFAULTS, price: 9.999 })).toMatch(/cents/)
    expect(clubInputProblem({ ...CLUB_DEFAULTS, coffees_per_week: 1.5 })).toMatch(/coffees/)
    expect(clubInputProblem({ ...CLUB_DEFAULTS, max_value: 60 })).toMatch(/most off/)
    expect(clubInputProblem({ ...CLUB_DEFAULTS, till_language: 'fr' as 'en' })).toMatch(/language/)
  })

  it('a member stands as Square has them, a failed payment first', () => {
    expect(standing({ status: 'active', paid: true, ends_on: null })).toBe('active')
    expect(standing({ status: 'active', paid: false, ends_on: '2026-12-01' })).toBe('payment_failed')
    expect(standing({ status: 'active', paid: true, ends_on: '2026-12-01' })).toBe('ending')
    expect(standing({ status: 'paused', paid: true, ends_on: null })).toBe('paused')
    expect(standing({ status: 'canceled', paid: true, ends_on: '2026-11-01' })).toBe('ended')
  })

  it('a coffee counts for a member in good standing with coffees left this week; otherwise it says why not', () => {
    expect(clubProblem('SQC1', member, 0, 1, 1)).toBeNull()
    expect(clubProblem('SQC1', member, 1, 1, 1)).toBe('over_limit')
    expect(clubProblem('SQC1', member, 1, 1, 3)).toBeNull()
    expect(clubProblem(null, null, 0, 1, 1)).toBe('no_customer')
    expect(clubProblem('SQC9', null, 0, 1, 1)).toBe('not_member')
    expect(clubProblem('SQC1', { ...member, paid: false }, 0, 1, 1)).toBe('not_paid')
    expect(clubProblem('SQC1', { ...member, status: 'paused' }, 0, 1, 1)).toBe('not_paid')
  })

  it('a week is Monday to Sunday, the business’s days', () => {
    expect(weekOf('2026-11-29T23:30:00Z', 'Europe/Madrid')).toBe('2026-11-30') // 23:30 on Sunday in Dublin is past midnight in Madrid
    expect(weekOf('2026-11-29T23:30:00Z', 'Europe/Dublin')).toBe('2026-11-23')
  })

  it('the note on the till says whether this week’s coffee is there to have, in the till’s language', () => {
    expect(noteLine(club, member)).toBe('☕ Coffee club: this week’s coffee is ready')
    expect(noteLine(club, { ...member, used_this_week: 1 })).toBe('☕ Coffee club: this week’s coffee used. Next one on Monday')
    expect(noteLine({ ...club, coffees_per_week: 3 }, { ...member, used_this_week: 1 })).toBe('☕ Coffee club: 2 of 3 coffees left this week')
    expect(noteLine({ ...club, coffees_per_week: 3 }, { ...member, used_this_week: 3 })).toBe('☕ Coffee club: all 3 coffees used this week. More on Monday')
    expect(noteLine(club, { ...member, paid: false })).toBe('☕ Coffee club: the last payment failed. Charge as normal')
    expect(noteLine(club, { ...member, status: 'pending', started_on: '2026-12-01' })).toBe('☕ Coffee club: starts 1/12')
    expect(noteLine(club, { ...member, status: 'canceled' })).toBeNull()
    const es = { ...club, name: 'Club del café', till_language: 'es' as const }
    expect(noteLine(es, member)).toBe('☕ Club del café: el café de esta semana está listo')
    expect(noteLine(es, { ...member, used_this_week: 1 })).toBe('☕ Club del café: ya tomó el café de esta semana. El próximo, el lunes')
    expect(noteLine({ ...es, coffees_per_week: 2 }, { ...member, used_this_week: 1 })).toBe('☕ Club del café: le quedan 1 de 2 cafés esta semana')
  })

  it('the app’s line goes first and replaces its last one; the team’s own lines stay as they were', () => {
    expect(withNoteLine('Oat flat white\nNo sugar', '☕ Coffee club: this week’s coffee is ready')).toBe('☕ Coffee club: this week’s coffee is ready\nOat flat white\nNo sugar')
    expect(withNoteLine('☕ Coffee club: this week’s coffee is ready\nOat flat white', '☕ Coffee club: this week’s coffee used. Next one on Monday'))
      .toBe('☕ Coffee club: this week’s coffee used. Next one on Monday\nOat flat white')
    expect(withNoteLine('☕ Coffee club: paused. Charge as normal\nOat flat white', null)).toBe('Oat flat white')
    expect(withNoteLine(undefined, null)).toBe('')
    expect(withoutNoteLine('☕ Coffee club: this week’s coffee is ready')).toBe('')
  })

  it('the figures: members in good standing and their month, coffees this week and this month', () => {
    const totals = clubTotals({
      club: { name: 'Coffee club', price: 10, currency: 'EUR', coffees_per_week: 1, max_value: 5, till_language: 'en', selling: true, signup_url: null, set_up_at: '' },
      week: '2026-11-23',
      members: [
        { id: 'a', customer_id: null, name: 'A', square_customer_id: 'x', status: 'active', started_on: null, ends_on: null, paid: true, paid_through: null, used_this_week: 1, last_coffee: null, coffees: 3 },
        { id: 'b', customer_id: null, name: 'B', square_customer_id: 'y', status: 'active', started_on: null, ends_on: null, paid: false, paid_through: null, used_this_week: 0, last_coffee: null, coffees: 1 },
      ],
      coffees: [
        { id: '1', member_id: 'a', name: 'A', item: 'Flat White', quantity: 1, value: 3.8, at: '2026-11-24T09:00:00Z', problem: null, sorted_at: null },
        { id: '2', member_id: 'a', name: 'A', item: 'Flat White', quantity: 1, value: 3.8, at: '2026-10-24T09:00:00Z', problem: null, sorted_at: null },
        { id: '3', member_id: null, name: null, item: 'Latte', quantity: 1, value: 4, at: '2026-11-24T10:00:00Z', problem: 'no_customer', sorted_at: null },
      ],
    }, '2026-11')
    expect(totals).toEqual({ members: 1, monthly: 10, week: 1, month_coffees: 1, month_value: 3.8, problems: 1 })
  })
})

describe('Square’s side', () => {
  it('a sale’s club coffees: the lines the discount took something off; on the whole sale, one coffee', () => {
    const o = {
      id: 'O1', discounts: [{ uid: 'd1', catalog_object_id: 'DISC', scope: 'LINE_ITEM' as const }, { uid: 'd2', catalog_object_id: 'OTHER' }],
      line_items: [
        { uid: 'l1', name: 'Flat White', variation_name: 'Regular', quantity: '2', applied_discounts: [{ discount_uid: 'd1', applied_money: { amount: 500 } }] },
        { uid: 'l2', name: 'Croissant', quantity: '1', applied_discounts: [{ discount_uid: 'd2', applied_money: { amount: 50 } }] },
        { uid: 'l3', name: 'Latte', variation_name: 'Oat', quantity: '1', applied_discounts: [{ discount_uid: 'd1', applied_money: { amount: 420 } }] },
      ],
    }
    expect(clubLines(o, 'DISC')).toEqual([
      { uid: 'l1', item: 'Flat White', quantity: 2, value: 5 }, { uid: 'l3', item: 'Latte · Oat', quantity: 1, value: 4.2 },
    ])
    expect(clubLines({ id: 'O2', discounts: [{ uid: 'd9', catalog_object_id: 'DISC', scope: 'ORDER', applied_money: { amount: 380 } }] }, 'DISC'))
      .toEqual([{ uid: 'order:d9', item: null, quantity: 1, value: 3.8 }])
    expect(clubLines(o, 'NOT-OURS')).toEqual([])
  })

  it('whether a subscription’s latest month was paid, from its newest invoice', () => {
    const paid = paidBySubscription([
      { id: '1', subscription_id: 'S1', status: 'UNPAID', created_at: '2026-10-01T00:00:00Z' },
      { id: '2', subscription_id: 'S1', status: 'PAID', created_at: '2026-11-01T00:00:00Z' },
      { id: '3', subscription_id: 'S2', status: 'FAILED', created_at: '2026-11-01T00:00:00Z' },
      { id: '4', status: 'PAID', created_at: '2026-11-01T00:00:00Z' },
    ])
    expect(Object.fromEntries(paid)).toEqual({ S1: true, S2: false })
  })
})
