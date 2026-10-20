import { describe, expect, it } from 'vitest'
import { buildPnl, monthlyAmount, monthsBetween, teamCost, yearBefore, type PnlInput } from './pnl'

const base = (over: Partial<PnlInput> = {}): PnlInput => ({
  months: ['2026-07', '2026-08'], today: '2026-09-30', opened: '2026-04-01', vatRate: 10, employerMultiplier: 1.315,
  takings: [], expenses: [], entries: [], shifts: [], rates: new Map(), lines: [], ...over,
})
const row = (p: ReturnType<typeof buildPnl>, key: string) => p.rows.find(r => r.key === key)!

describe('profit and loss', () => {
  it('takings count net of refunds and IVA', () => {
    const p = buildPnl(base({ takings: [{ date: '2026-07-01', gross: 1100, refunds: 0 }, { date: '2026-07-02', gross: 230, refunds: 10 }] }))
    expect(row(p, 'takings').values).toEqual([1200, 0])
    expect(p.takingsWithVat).toBe(1320)
    expect(p.income).toEqual([1200, 0])
  })

  it('weekly, quarterly and yearly amounts become a month’s worth', () => {
    expect(monthlyAmount(120)).toBe(120)
    expect(monthlyAmount(120, 'monthly')).toBe(120)
    expect(monthlyAmount(120, 'weekly')).toBe(520)
    expect(monthlyAmount(1200, 'yearly')).toBe(100)
    expect(monthlyAmount(300, 'quarterly')).toBe(100)
  })

  it('cost of sales and running costs by category; gross and operating profit with margins', () => {
    const p = buildPnl(base({
      months: ['2026-07'],
      takings: [{ date: '2026-07-10', gross: 11000, refunds: 0 }],
      expenses: [
        { name: 'Beans', amount: 1500, category: 'Stock', active: true },
        { name: 'Cups', amount: 500, category: 'Supplies', active: true },
        { name: 'Rent', amount: 1530, category: 'Premises', active: true },
        { name: 'Old', amount: 999, category: 'Premises', active: false },
        { name: 'Licence', amount: 120, category: 'Software', active: true, frequency: 'yearly' },
      ],
    }))
    expect(row(p, 'cost-of-sales-total').values).toEqual([2000])
    expect(row(p, 'gross-profit').values).toEqual([8000])
    expect(row(p, 'gross-margin').values).toEqual([80])
    expect(row(p, 'running:Premises').values).toEqual([1530])
    expect(row(p, 'running:Software').values).toEqual([10])
    expect(p.operatingProfit).toEqual([6460])
    expect(p.totals.operatingMargin).toBe(64.6)
  })

  it('the team: paid hours × rate from timecards, rota shifts on days without one, Social Security on top', () => {
    const rates = new Map([['julio', 10], ['maria', 12]])
    const p = buildPnl(base({
      months: ['2026-09'], rates,
      entries: [{ profile_id: 'julio', work_date: '2026-09-01', paid_minutes: 480 }],
      shifts: [
        // Julio clocked in that day: the shift isn't counted again.
        { profile_id: 'julio', starts_at: '2026-09-01T06:00:00Z', ends_at: '2026-09-01T14:00:00Z', break_minutes: 0, status: 'published' },
        { profile_id: 'maria', starts_at: '2026-09-02T08:00:00Z', ends_at: '2026-09-02T13:00:00Z', break_minutes: 0, status: 'published' },
        { profile_id: 'maria', starts_at: '2026-09-03T08:00:00Z', ends_at: '2026-09-03T13:00:00Z', break_minutes: 0, status: 'draft' },
        { profile_id: null, starts_at: '2026-09-04T08:00:00Z', ends_at: '2026-09-04T13:00:00Z', break_minutes: 0, status: 'published' },
      ],
    }))
    expect(row(p, 'team-pay').values).toEqual([140]) // 8 h × 10 + 5 h × 12
    expect(row(p, 'team-social').values).toEqual([44.1])
    expect(row(p, 'team-total').values).toEqual([184.1])
    expect(row(p, 'team-pay').note).toMatch(/rota/)
  })

  it('Finances’ wages estimate fills only the days before the app has hours, never both', () => {
    const people = { name: 'Staff wages', amount: 3000, category: 'People', active: true }
    const p = buildPnl(base({
      months: ['2026-08', '2026-09'], expenses: [people], rates: new Map([['julio', 10]]),
      entries: [{ profile_id: 'julio', work_date: '2026-09-16', paid_minutes: 600 }],
    }))
    expect(row(p, 'team-estimate').values).toEqual([3000, 1500]) // all of August; 1–15 September
    expect(row(p, 'team-pay').values).toEqual([0, 100])
    expect(p.rows.some(r => r.key === 'running:People')).toBe(false)
  })

  it('this month counts its costs only so far, and nothing before the business opened', () => {
    const p = buildPnl(base({
      months: ['2026-03', '2026-04', '2026-09'], today: '2026-09-15', opened: '2026-04-16',
      expenses: [{ name: 'Rent', amount: 3000, category: 'Premises', active: true }],
    }))
    expect(row(p, 'running:Premises').values).toEqual([0, 1500, 1500])
    expect(p.partial).toEqual(['2026-04', '2026-09'])
  })

  it('one-off lines: income adds up, costs land in their section', () => {
    const p = buildPnl(base({
      months: ['2026-07'],
      lines: [
        { month: '2026-07-01', kind: 'income', category: null, label: 'Kit Digital', amount: 2000 },
        { month: '2026-07-01', kind: 'cost', category: 'Stock', label: 'Christmas stock', amount: 300 },
        { month: '2026-07-01', kind: 'cost', category: 'Equipment', label: 'Grinder repair', amount: 250 },
        { month: '2026-08-01', kind: 'cost', category: 'Equipment', label: 'Not shown', amount: 999 },
      ],
    }))
    expect(row(p, 'income-total').values).toEqual([2000])
    expect(row(p, 'cost-of-sales-total').values).toEqual([300])
    expect(row(p, 'running-total').values).toEqual([250])
    expect(p.operatingProfit).toEqual([1450])
  })

  it('an empty month: zeros, and no margin without income', () => {
    const p = buildPnl(base({ months: ['2026-07'] }))
    expect(p.income).toEqual([0])
    expect(row(p, 'gross-margin').values).toEqual([null])
    expect(p.totals.operatingMargin).toBeNull()
  })

  it('months between two, and the same months a year before', () => {
    expect(monthsBetween('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
    expect(yearBefore(['2026-01', '2026-02'])).toEqual(['2025-01', '2025-02'])
    expect(teamCost({ entries: [], shifts: [], rates: new Map(), today: '2026-09-30' }).size).toBe(0)
  })
})
