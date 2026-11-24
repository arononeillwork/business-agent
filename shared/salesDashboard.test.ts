import { describe, expect, it } from 'vitest'
import { mostSold, percentOf, repsBetween, salesPace } from './salesDashboard'
import { addDays } from './time'
import type { RepReward, SalesRep } from './reps'
import type { SalesDay } from './types'

const day = (date: string, gross: number): SalesDay => ({ date, gross, tips: 0, refunds: 0, payments: Math.round(gross / 5) })
/** Eight weeks to 2026-09-29 (a Tuesday): Mondays 300, Saturdays 900, Sundays closed, the rest 500. */
const history: SalesDay[] = []
for (let d = '2026-08-04'; d <= '2026-09-29'; d = addDays(d, 1)) {
  const dow = new Date(`${d}T12:00:00Z`).getUTCDay()
  history.push(day(d, dow === 0 ? 0 : dow === 1 ? 300 : dow === 6 ? 900 : 500))
}

describe('sales dashboard: on course for', () => {
  it('this week, on a Wednesday: Monday and Tuesday as taken, today a usual Wednesday, then a usual day of each to Sunday', () => {
    const days = [day('2026-09-28', 320), day('2026-09-29', 480), day('2026-09-30', 120)]
    // Today: 120 taken of a usual 500 → 380 to come; Thursday and Friday 500, Saturday 900, Sunday closed.
    expect(salesPace(days, history, '2026-09-28', '2026-10-04', '2026-09-30')).toEqual({ soFar: 920, toCome: 380 + 500 + 500 + 900, total: 3200, daysLeft: 4 })
  })

  it('today counts what it took when that’s more than a usual day', () => {
    const days = [day('2026-09-30', 640)]
    expect(salesPace(days, history, '2026-09-30', '2026-09-30', '2026-09-30')).toEqual({ soFar: 640, toCome: 0, total: 640, daysLeft: 0 })
  })

  it('today itself isn’t part of the usual day (it’s still going)', () => {
    const halfDay = [...history, day('2026-09-30', 50)]
    expect(salesPace([], halfDay, '2026-09-30', '2026-09-30', '2026-09-30').toCome).toBe(500)
  })

  it('a period that’s over is what it took; with no history the days left add nothing', () => {
    expect(salesPace(history, history, '2026-09-01', '2026-09-06', '2026-09-30')).toEqual({ soFar: 500 * 4 + 900, toCome: 0, total: 2900, daysLeft: 0 })
    expect(salesPace([day('2026-09-30', 200)], [], '2026-09-28', '2026-10-04', '2026-09-30')).toEqual({ soFar: 200, toCome: 0, total: 200, daysLeft: 4 })
  })
})

describe('sales dashboard: most sold, shares and the reps', () => {
  it('most sold goes by how many, the bigger seller first on a tie, and leaves out what didn’t sell', () => {
    const items = [{ name: 'Açaí Bowl', quantity: 6, gross: 51 }, { name: 'Flat White', quantity: 24, gross: 76.8 }, { name: 'Croissant', quantity: 24, gross: 57.6 },
      { name: 'Lemon Tart', quantity: 0, gross: 0 }]
    expect(mostSold(items).map(i => i.name)).toEqual(['Flat White', 'Croissant', 'Açaí Bowl'])
    expect(mostSold(items, 1).map(i => i.name)).toEqual(['Flat White'])
  })

  it('a share of the takings, or nothing to compare', () => {
    expect(percentOf(4.2, 520)).toBe(1)
    expect(percentOf(52, 520)).toBe(10)
    expect(percentOf(3, 0)).toBeNull()
  })

  it('the reps who brought most in the period: earned, approved or waiting; not turned down, spent or paid out', () => {
    const rep = (id: string, name: string) => ({ id, name } as SalesRep)
    const reward = (rep_id: string, amount: number, occurred_on: string, o: Partial<RepReward> = {}) =>
      ({ id: `${rep_id}${occurred_on}${amount}`, rep_id, amount, occurred_on, kind: 'earn', status: 'approved', ...o } as RepReward)
    const reps = [rep('a', 'Lucía'), rep('b', 'Marco'), rep('c', 'Inés'), rep('d', 'Dani')]
    const rewards = [
      reward('a', 0.5, '2026-09-02'), reward('a', 0.5, '2026-09-05'), reward('a', -1.5, '2026-09-05', { kind: 'redeem' }),
      reward('b', 3, '2026-09-03'), reward('b', 45, '2026-09-29', { status: 'pending' }), reward('b', 38, '2026-08-10'), reward('b', -38, '2026-09-01', { kind: 'payout' }),
      reward('c', 3, '2026-09-04'), reward('c', 3, '2026-09-11'), reward('c', 3, '2026-09-19'),
      reward('d', 25, '2026-09-01', { status: 'rejected' }),
    ]
    expect(repsBetween(reps, rewards, '2026-09-01', '2026-09-30').map(s => [s.rep.name, s.earned, s.rewards])).toEqual([['Marco', 48, 2], ['Inés', 9, 3], ['Lucía', 1, 2]])
    expect(repsBetween(reps, rewards, '2026-09-28', '2026-10-04').map(s => s.rep.name)).toEqual(['Marco'])
    expect(repsBetween(reps, rewards, '2026-10-01', '2026-10-31')).toEqual([])
  })
})
