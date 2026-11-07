// The back-office's funnel: each step's count and share, week two out of the businesses old enough to
// tell, and the cancellations of the last 12 months by month.
import { describe, expect, it } from 'vitest'
import { hqFunnel, lastMonths, share, type FunnelBusiness, type HqFunnelRow } from './hqFunnel'

const now = new Date(2026, 10, 7, 12) // 7 November 2026, noon where it's looked at
const b = (id: number, status: string, set_up_at: string | null = '2026-01-01T10:00:00Z', is_hq = false): FunnelBusiness => ({ id, status, set_up_at, is_hq })
const f = (id: number, active_week_two: boolean | null, cancelled_at: string | null = null, cancelled = !!cancelled_at): HqFunnelRow =>
  ({ id, active_week_two, cancelled, cancelled_at })

describe('the funnel', () => {
  const list = [
    b(1, 'comped', '2025-01-01T10:00:00Z', true), // HQ: not one of them
    b(2, 'none', null),
    b(3, 'none'),
    b(4, 'trialing'),
    b(5, 'active'),
    b(6, 'past_due'),
    b(7, 'canceled'),
    b(8, 'canceled'),
    b(9, 'active'),
  ]
  const rows = [
    f(1, true),
    f(2, null),
    f(3, false),
    f(4, null),
    f(5, true),
    f(6, true),
    f(7, true, '2026-11-03T12:00:00Z'),
    f(8, false, null, true),
    f(9, true, '2026-06-15T12:00:00Z'), // set to end with the period: still paying until then
  ]

  it('counts each step, HQ left out', () => {
    const { steps } = hqFunnel(list, rows, now)
    expect(steps.map(s => [s.id, s.count, s.of])).toEqual([
      ['signed_up', 8, 8],
      ['set_up', 7, 8],
      ['week_two', 4, 6],
      ['trial', 1, 8],
      ['paying', 3, 8],
      ['cancelled', 3, 8],
    ])
    expect(share(steps[1])).toBe(7 / 8)
  })

  it('week two: a business younger than 14 days is not yet, not no', () => {
    const fn = hqFunnel(list, rows, now)
    expect(fn.weekTwoNotYet).toBe(2)
    expect(share(fn.steps[2])).toBe(4 / 6)
    // One hq_funnel() hasn't answered for yet (it signed up between the two) is too new to tell.
    expect(hqFunnel([...list, b(10, 'none', null)], rows, now).weekTwoNotYet).toBe(3)
  })

  it('cancellations by month, the last 12, this month last; one with no date yet counts, in no month', () => {
    const fn = hqFunnel(list, [...rows.filter(r => r.id !== 3), f(3, false, '2025-12-15T12:00:00Z'), f(10, true, '2026-11-01T12:00:00Z')], now)
    expect(fn.byMonth.map(m => m.month)).toEqual(lastMonths(now))
    expect(fn.byMonth).toHaveLength(12)
    expect(fn.byMonth[0]).toEqual({ month: '2025-12', count: 1 })
    expect(fn.byMonth[6]).toEqual({ month: '2026-06', count: 1 })
    // Business 10 isn't on HQ's list: not counted.
    expect(fn.byMonth[11]).toEqual({ month: '2026-11', count: 1 })
    expect(fn.byMonth.reduce((n, m) => n + m.count, 0)).toBe(3)
    expect(fn.undated).toBe(1)
    expect(fn.steps[5].count).toBe(4)
    // Older than a year: in the step, not in the months.
    expect(hqFunnel(list, [f(7, true, '2025-11-15T12:00:00Z')], now).byMonth.every(m => m.count === 0)).toBe(true)
  })

  it('with nobody signed up, nothing to share', () => {
    const fn = hqFunnel([b(1, 'comped', null, true)], [], now)
    expect(fn.steps.every(s => s.count === 0 && share(s) === 0)).toBe(true)
  })
})

describe('the last 12 months', () => {
  it('cross the new year', () => {
    expect(lastMonths(new Date(2027, 0, 31))).toEqual(['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08',
      '2026-09', '2026-10', '2026-11', '2026-12', '2027-01'])
  })
})
