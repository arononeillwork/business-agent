import { describe, expect, it } from 'vitest'
import { ENTITLEMENTS, allocated, awayOn, belowLaw, daysBetween, leaveYear, proRata } from './benefits'
import { TIME_OFF_KINDS, type TimeOff } from './types'

const off = (p: Partial<TimeOff>): TimeOff => ({ id: 'x', profile_id: 'julio', starts_on: '2026-08-03', ends_on: '2026-08-07', kind: 'vacation',
  note: null, status: 'approved', created_at: '2026-06-01T10:00:00Z', decision_note: null, ...p })

describe('staff benefits', () => {
  it('lists Spain’s entitlements as the Estatuto sets them', () => {
    const es = Object.fromEntries(ENTITLEMENTS.ES.map(e => [e.key, e]))
    expect(es.holidays.amount).toBe(30)
    expect(es.public_holidays.amount).toBe(14)
    expect(es.birth.amount).toBe(19)
    expect(es.marriage.amount).toBe(15)
    expect(es.family.amount).toBe(5)
    expect(es.bereavement.amount).toBe(2)
    expect(es.urgent.amount).toBe(4)
    expect(es.parental.payer).toBe('unpaid')
    expect(new Set(ENTITLEMENTS.ES.map(e => e.key)).size).toBe(ENTITLEMENTS.ES.length)
    // Every kind it's recorded as exists on Time off, and a number goes with every {n}.
    for (const e of ENTITLEMENTS.ES) {
      if (e.leave) expect(TIME_OFF_KINDS).toContain(e.leave)
      expect(e.allowance.includes('{n}'), e.key).toBe(e.amount !== null)
    }
  })

  it('the business can give more than the law, never less', () => {
    expect(allocated({ amount: 30 }, null)).toBe(30)
    expect(allocated({ amount: 30 }, { amount: 31 })).toBe(31)
    expect(belowLaw({ amount: 30 }, 29)).toBe(true)
    expect(belowLaw({ amount: 30 }, 30)).toBe(false)
    expect(belowLaw({ amount: null }, 2)).toBe(false)
  })

  it('counts calendar days within a period, both ends included', () => {
    expect(daysBetween({ starts_on: '2026-08-03', ends_on: '2026-08-07' }, '2026-01-01', '2026-12-31')).toBe(5)
    expect(daysBetween({ starts_on: '2026-12-28', ends_on: '2027-01-03' }, '2027-01-01', '2027-12-31')).toBe(3)
    expect(daysBetween({ starts_on: '2026-08-03', ends_on: '2026-08-07' }, '2026-09-01', '2026-12-31')).toBe(0)
  })

  it('someone who starts part-way through the year gets their share, rounded up', () => {
    expect(proRata(30, 2026)).toBe(30)
    expect(proRata(30, 2026, '2026-07-01')).toBe(16) // 184 of 365 days: 15.1
    expect(proRata(30, 2026, '2026-04-01', '2026-09-30')).toBe(16) // 183 days: 15.04
    expect(proRata(30, 2026, '2026-01-01', '2026-06-30')).toBe(15) // 181 days: 14.9
    expect(proRata(30, 2026, '2025-11-01')).toBe(30)
  })

  it('holiday taken so far, booked ahead (approved or waiting), and other leave by kind', () => {
    const list = [
      off({ starts_on: '2026-08-03', ends_on: '2026-08-07' }),
      off({ starts_on: '2026-09-29', ends_on: '2026-10-02' }), // half taken by the 30th
      off({ starts_on: '2026-11-02', ends_on: '2026-11-03', status: 'pending' }),
      off({ starts_on: '2026-12-01', ends_on: '2026-12-02', status: 'declined' }),
      off({ starts_on: '2026-02-09', ends_on: '2026-02-11', kind: 'sick' }),
      off({ starts_on: '2026-12-30', ends_on: '2027-01-02', kind: 'sick' }),
      off({ starts_on: '2026-05-04', ends_on: '2026-05-05', kind: 'sick', status: 'cancelled' }),
      off({ starts_on: '2026-03-02', ends_on: '2026-03-03', kind: 'bereavement' }),
      off({ starts_on: '2026-03-02', ends_on: '2026-03-30', kind: 'sick', profile_id: 'maria' }),
    ]
    expect(leaveYear(list, 'julio', 2026, '2026-09-30')).toEqual({ holidayTaken: 7, holidayBooked: 4, days: { sick: 5, bereavement: 2 } })
    // A year ahead: everything is still to come.
    expect(leaveYear(list, 'julio', 2027, '2026-09-30')).toEqual({ holidayTaken: 0, holidayBooked: 0, days: { sick: 2 } })
    expect(leaveYear([off({ starts_on: '2027-07-01', ends_on: '2027-07-10' })], 'julio', 2027, '2026-09-30').holidayBooked).toBe(10)
  })

  it('who is away on a day: approved time off only', () => {
    const list = [off({ starts_on: '2026-09-28', ends_on: '2026-10-02' }), off({ starts_on: '2026-09-30', ends_on: '2026-09-30', status: 'pending' })]
    expect(awayOn(list, '2026-09-30')).toHaveLength(1)
    expect(awayOn(list, '2026-10-03')).toHaveLength(0)
  })
})
