import { describe, expect, it } from 'vitest'
import { dailyCosts, isOwner, isWagesExpense, monthlyCosts, openDaysPerMonth, openOn, overBreakeven, ownersPayOff, payrollRates, rotaMonth } from './dailyCost'
import type { OpeningHours, Shift } from './types'
import { zonedIso } from './time'

const MON_SAT: OpeningHours = { mon: { open: '08:30', close: '17:00' }, tue: { open: '08:30', close: '17:00' }, wed: { open: '08:30', close: '17:00' },
  thu: { open: '08:30', close: '17:00' }, fri: { open: '08:30', close: '17:00' }, sat: { open: '09:00', close: '15:00' }, sun: null }
const expense = (name: string, amount: number, category: string | null = null, active = true) => ({ name, amount, category, active })
const shift = (profile_id: string, date: string, from = '09:00', to = '15:00', status: Shift['status'] = 'published') =>
  ({ profile_id, starts_at: zonedIso(date, from), ends_at: zonedIso(date, to), break_minutes: 0, status })
const EXPENSES = [expense('Staff wages', 4300, 'People'), expense('Rent', 1530, 'Premises'), expense('Electricity', 200), expense('Old', 999, null, false)]

describe('the cost of running the business each day', () => {
  it('knows the wages line and the open days', () => {
    expect(isWagesExpense({ name: 'Staff wages', category: null })).toBe(true)
    expect(isWagesExpense({ name: 'Anything', category: 'People' })).toBe(true)
    expect(isWagesExpense({ name: 'Rent', category: 'Premises' })).toBe(false)
    expect(monthlyCosts(EXPENSES)).toEqual({ fixed: 1730, wages: 4300, total: 6030 })
    expect(openDaysPerMonth(MON_SAT)).toBe(26)
    expect(openDaysPerMonth(undefined)).toBe(26)
    expect(openOn('2026-11-01', MON_SAT)).toBe(false) // a Sunday
    expect(openOn('2026-11-02', MON_SAT)).toBe(true)
  })

  it('costs the team from the rota when everyone on it has a pay rate', () => {
    const shifts = [shift('mark', '2026-11-02'), shift('maria', '2026-11-02'), shift('maria', '2026-11-03', '09:00', '13:00', 'draft')]
    const rates = new Map([['mark', 0], ['maria', 10]])
    const [sun, mon, tue] = dailyCosts('2026-11-01', '2026-11-03', { expenses: EXPENSES, shifts, rates, multiplier: 1.3, openingHours: MON_SAT })
    expect(sun).toMatchObject({ open: false, total: 0, teamFrom: 'none' })
    expect(mon.teamFrom).toBe('rota')
    expect(mon.hours).toBe(12)
    expect(mon.team).toBeCloseTo(6 * 10 * 1.3) // Mark draws no pay
    expect(mon.fixed).toBeCloseTo(1730 / 26)
    // Tuesday's shift is still a draft: the estimate stands in.
    expect(tue.teamFrom).toBe('estimate')
    expect(tue.team).toBeCloseTo(4300 / 26)
  })

  it('takes the wages estimate when someone on the rota has no pay rate', () => {
    const [mon] = dailyCosts('2026-11-02', '2026-11-02', { expenses: EXPENSES, shifts: [shift('mark', '2026-11-02'), shift('maria', '2026-11-02')], rates: new Map([['maria', 10]]), openingHours: MON_SAT })
    expect(mon.teamFrom).toBe('estimate')
    expect(mon.unpriced).toEqual(['mark'])
    expect(mon.total).toBeCloseTo(6030 / 26)
  })

  it('adds up a month of the rota, per person', () => {
    const shifts = ['2026-11-02', '2026-11-03', '2026-12-01'].flatMap(d => [shift('mark', d), shift('maria', d)])
    const m = rotaMonth('2026-11', { shifts, rates: new Map([['maria', 10]]) })
    expect(m.hours).toBe(24)
    expect(m.cost).toBe(120)
    expect(m.complete).toBe(false)
    expect(m.unpriced).toEqual(['mark'])
    expect(m.days).toHaveLength(30)
    expect(rotaMonth('2026-11', { shifts, rates: new Map([['maria', 10], ['mark', 0]]) }).complete).toBe(true)
  })

  it('gives the kitty 10% of what’s taken above breakeven, and nothing on a day below it', () => {
    const costs = dailyCosts('2026-11-02', '2026-11-03', { expenses: [expense('Rent', 2600)], shifts: [], rates: new Map(), openingHours: MON_SAT })
    const k = overBreakeven([{ date: '2026-11-02', takings: 300 }, { date: '2026-11-03', takings: 50 }], costs)
    expect(k.rows.map(r => r.breakeven)).toEqual([100, 100])
    expect(k.over).toBe(200)
    expect(k.share).toBeCloseTo(20)
    expect(k.daysOver).toBe(1)
  })
})

describe('owner pay', () => {
  const people = [{ id: 'mark', role: 'admin', can_see_pay: true }, { id: 'aron', role: 'admin', can_see_pay: true }, { id: 'maria', role: 'employee', can_see_pay: false }]
  const rates = new Map([['mark', 10], ['maria', 9]])
  it('on: everyone at their rate; off: the owners’ hours cost nothing, rate or not', () => {
    expect(payrollRates(rates, people, true)).toBe(rates)
    expect([...payrollRates(rates, people, false)]).toEqual([['mark', 0], ['maria', 9], ['aron', 0]])
  })
  it('off takes the owners’ pay this month off the monthly costs, no more than the wages line holds', () => {
    expect(ownersPayOff(true, 300, 4000)).toBe(0)
    expect(ownersPayOff(false, 300.456, 4000)).toBe(300.46)
    expect(ownersPayOff(false, 5000, 4000)).toBe(4000)
    expect(ownersPayOff(false, 300, 0)).toBe(0)
    expect(ownersPayOff(false, 0, 4000)).toBe(0)
    expect(people.filter(isOwner).map(p => p.id)).toEqual(['mark', 'aron'])
  })
  it('breakeven counts the owner at their rate whatever the payroll says', () => {
    const shifts = [shift('mark', '2026-11-02'), shift('maria', '2026-11-02')]
    const [mon] = dailyCosts('2026-11-02', '2026-11-02', { expenses: EXPENSES, shifts, rates, openingHours: MON_SAT })
    expect(mon.team).toBe(6 * 10 + 6 * 9)
    expect(rotaMonth('2026-11', { shifts, rates: payrollRates(rates, people, false) }).cost).toBe(6 * 9)
  })
})
