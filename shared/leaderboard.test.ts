import { describe, expect, it } from 'vitest'
import {
  clockStats, currentStreak, leaders, longestStreak, myPlaces, onTimeRate, periodRange, ranked, standings, type ClockStats,
} from './leaderboard'
import { zonedIso } from './time'

const stats = (id: string, p: Partial<ClockStats> = {}): ClockStats =>
  ({ profile_id: id, clock_ins: 0, on_shift: 0, on_time: 0, late: 0, minutes: 0, days: 0, starts: '', ticks: 0, ...p })

describe('leaderboard periods', () => {
  it('this week from Monday, last week Monday to Sunday, this month from the 1st, last month whole', () => {
    // 5 November 2026 is a Thursday.
    expect(periodRange('week', '2026-11-05')).toEqual({ from: '2026-11-02', to: '2026-11-05' })
    expect(periodRange('last_week', '2026-11-05')).toEqual({ from: '2026-10-26', to: '2026-11-01' })
    expect(periodRange('month', '2026-11-05')).toEqual({ from: '2026-11-01', to: '2026-11-05' })
    expect(periodRange('last_month', '2026-11-05')).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(periodRange('last_month', '2026-03-01')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(periodRange('last_month', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  })
})

describe('streaks', () => {
  it('the longest run of on-time starts, and the one going now', () => {
    expect(longestStreak('')).toBe(0)
    expect(longestStreak('ooloooll')).toBe(3)
    expect(currentStreak('ooloooll')).toBe(0)
    expect(currentStreak('lloo')).toBe(2)
    expect(currentStreak('ooo')).toBe(3)
  })

  it('the on-time share only counts clock-ins for a shift', () => {
    expect(onTimeRate({ on_shift: 4, on_time: 3 })).toBe(0.75)
    expect(onTimeRate({ on_shift: 0, on_time: 0 })).toBeNull()
  })
})

describe('ranking', () => {
  it('people level on everything share a place, and the next comes after them all', () => {
    const r = ranked([{ id: 'a', value: 5 }, { id: 'b', value: 9 }, { id: 'c', value: 9 }, { id: 'd', value: 1 }])
    expect(r.map(x => [x.id, x.rank])).toEqual([['b', 1], ['c', 1], ['a', 3], ['d', 4]])
  })

  it('a tie on the figure is broken by the next ones', () => {
    const r = ranked([{ id: 'a', value: 1, n: 1 }, { id: 'b', value: 1, n: 5 }], x => [x.n])
    expect(r.map(x => [x.id, x.rank])).toEqual([['b', 1], ['a', 2]])
  })

  it('on time: the share, then how many, then the longest streak; nobody without a shift', () => {
    const clock = [
      stats('julio', { on_shift: 5, on_time: 5, late: 0, starts: 'ooooo' }),
      stats('aron', { on_shift: 5, on_time: 5, starts: 'ooooo' }),
      stats('mark', { on_shift: 1, on_time: 1, starts: 'o' }),
      stats('maria', { on_shift: 6, on_time: 5, late: 1, starts: 'oolooo' }),
      stats('owner', { clock_ins: 2, minutes: 300 }),
    ]
    const s = standings('on_time', clock)
    expect(s.map(x => [x.profile_id, x.rank])).toEqual([['julio', 1], ['aron', 1], ['mark', 3], ['maria', 4]])
    expect(s.find(x => x.profile_id === 'maria')).toMatchObject({ value: 0.8333, detail: { on_time: 5, on_shift: 6, late: 1 } })
    expect(standings('streak', clock).map(x => [x.profile_id, x.value])).toEqual([['julio', 5], ['aron', 5], ['maria', 3], ['mark', 1]])
  })

  it('hours in hours, checklists by ticks, sales by how many and then how much (when it shows)', () => {
    const clock = [stats('a', { minutes: 615, days: 3, ticks: 4 }), stats('b', { minutes: 90, days: 1 })]
    expect(standings('hours', clock).map(x => [x.profile_id, x.value, x.detail.days])).toEqual([['a', 10.3, 3], ['b', 1.5, 1]])
    expect(standings('checklists', clock).map(x => x.profile_id)).toEqual(['a'])
    const till = [{ profile_id: 'a', sales: 40, gross: 200 }, { profile_id: 'b', sales: 40, gross: 260 }, { profile_id: 'c', sales: 0, gross: 0 }]
    expect(standings('sales', [], till).map(x => [x.profile_id, x.rank])).toEqual([['b', 1], ['a', 2]])
    // Without amounts (an employee's view), level on sales is level.
    expect(standings('sales', [], till.map(x => ({ ...x, gross: null }))).map(x => x.rank)).toEqual([1, 1])
  })

  it('who leads each board, and my place on each', () => {
    const clock = [stats('a', { on_shift: 2, on_time: 2, starts: 'oo', minutes: 60 }), stats('b', { on_shift: 2, on_time: 1, starts: 'lo', minutes: 600 })]
    const top = leaders(clock, [{ profile_id: 'b', sales: 3, gross: null }])
    expect(top.on_time?.map(x => x.profile_id)).toEqual(['a'])
    expect(top.hours?.map(x => x.profile_id)).toEqual(['b'])
    expect(top.sales?.map(x => x.profile_id)).toEqual(['b'])
    expect(top.checklists).toBeUndefined()
    expect(myPlaces('a', clock)).toEqual({ on_time: 1, streak: 1, hours: 2, sales: null, checklists: null })
  })
})

describe('clock stats (the demo, as the database works them out)', () => {
  it('on time within 5 minutes of the shift, late after; hours on finished timecards; days; ticks in the period', () => {
    const shift = (id: string, date: string) => ({ id, starts_at: zonedIso(date, '09:00') })
    const entry = (profile: string, shiftId: string | null, date: string, at: string, out: boolean, paid = 240) =>
      ({ profile_id: profile, shift_id: shiftId, clock_in: zonedIso(date, at), clock_out: out ? zonedIso(date, '13:00') : null, paid_minutes: paid, work_date: date })
    const shifts = [shift('s1', '2026-11-02'), shift('s2', '2026-11-03'), shift('s3', '2026-11-04'), shift('s4', '2026-10-30')]
    const entries = [
      entry('ana', 's1', '2026-11-02', '09:05', true), // exactly 5 minutes: on time
      entry('ana', 's2', '2026-11-03', '09:06', true), // late
      entry('ana', 's3', '2026-11-04', '08:58', false), // still clocked in: no hours yet
      entry('ana', null, '2026-11-04', '15:00', true, 60), // no shift: hours, not punctuality
      entry('ana', 's4', '2026-10-30', '09:00', true), // before the period
    ]
    const ticks = [{ done_by: 'ana', day: '2026-11-03' }, { done_by: 'ben', day: '2026-11-04' }, { done_by: null, day: '2026-11-04' }, { done_by: 'ana', day: '2026-10-30' }]
    const s = clockStats(entries, shifts, ticks, '2026-11-02', '2026-11-08')
    expect(s.find(x => x.profile_id === 'ana')).toEqual({ profile_id: 'ana', clock_ins: 4, on_shift: 3, on_time: 2, late: 1, minutes: 540, days: 3, starts: 'olo', ticks: 1 })
    expect(s.find(x => x.profile_id === 'ben')).toMatchObject({ clock_ins: 0, ticks: 1 })
  })
})
