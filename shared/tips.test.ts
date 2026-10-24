import { describe, expect, it } from 'vitest'
import { minutesWorked, myTips, splitTips, type TipPool } from './tips'

describe('tips', () => {
  it('by hours worked, to the cent, always adding up to the total', () => {
    const shares = splitTips(100, [{ profile_id: 'a', minutes: 600 }, { profile_id: 'b', minutes: 600 }, { profile_id: 'c', minutes: 600 }], 'hours')
    expect(shares.map(s => s.amount)).toEqual([33.34, 33.33, 33.33])
    const uneven = splitTips(103, [{ profile_id: 'julio', minutes: 2013 }, { profile_id: 'maria', minutes: 1874 }, { profile_id: 'cleaner', minutes: 333 }], 'hours')
    expect(Math.round(uneven.reduce((s, x) => s + x.amount, 0) * 100)).toBe(10300)
    expect(uneven[0].amount).toBeGreaterThan(uneven[1].amount)
  })

  it('by hours, someone with none gets nothing; equally, everyone ticked gets the same', () => {
    expect(splitTips(50, [{ profile_id: 'a', minutes: 300 }, { profile_id: 'b', minutes: 0 }], 'hours')).toEqual([{ profile_id: 'a', minutes: 300, amount: 50 }])
    expect(splitTips(10, [{ profile_id: 'a', minutes: 300 }, { profile_id: 'b', minutes: 0 }, { profile_id: 'c', minutes: 60 }], 'equal').map(s => s.amount)).toEqual([3.34, 3.33, 3.33])
    expect(splitTips(0, [{ profile_id: 'a', minutes: 300 }], 'hours')).toEqual([{ profile_id: 'a', minutes: 300, amount: 0 }])
  })

  it('minutes worked come from the timecards in the period', () => {
    const m = minutesWorked([
      { profile_id: 'a', work_date: '2026-09-21', paid_minutes: 420 }, { profile_id: 'a', work_date: '2026-09-27', paid_minutes: 300 },
      { profile_id: 'a', work_date: '2026-09-28', paid_minutes: 999 }, { profile_id: 'b', work_date: '2026-09-22', paid_minutes: 240 },
    ], '2026-09-21', '2026-09-27')
    expect([...m]).toEqual([['a', 720], ['b', 240]])
  })

  it('my tips: from pools shared out with me, and what’s still to be paid', () => {
    const pool = (status: TipPool['status'], amount: number): TipPool => ({ id: status, starts_on: '2026-09-21', ends_on: '2026-09-27', cash: amount, card: 0,
      split: 'hours', status, notes: null, created_at: '', shares: [{ profile_id: 'me', minutes: 60, amount }, { profile_id: 'other', minutes: 60, amount: 1 }] })
    const mine = myTips([pool('paid', 40), pool('shared', 12.5), pool('draft', 99)], 'me')
    expect(mine.total).toBe(52.5)
    expect(mine.unpaid).toBe(12.5)
    expect(mine.list).toHaveLength(2)
  })
})
