import { describe, expect, it } from 'vitest'
import { monthRange, registroMonth } from './registro'
import type { TimeEntry } from './types'

const entry = (id: string, clockIn: string, clockOut: string | null, paid: number, extra: Partial<TimeEntry> = {}): TimeEntry => ({
  id, profile_id: 'eva', position_id: null, shift_id: null, clock_in: clockIn, clock_out: clockOut, source: 'app',
  clock_out_source: null, flags: [], note: null, approved_at: null, work_date: clockIn.slice(0, 10),
  total_minutes: paid + 30, break_minutes: 30, unpaid_break_minutes: 30, paid_minutes: paid, on_holiday: false, ...extra,
})

describe('registro de jornada', () => {
  it('lists every day of the month with Madrid times and totals', () => {
    const m = registroMonth([
      entry('a', '2026-09-01T06:00:00Z', '2026-09-01T14:30:00Z', 480),
      entry('b', '2026-09-02T06:00:00Z', '2026-09-02T10:00:00Z', 210),
      entry('c', '2026-09-02T14:00:00Z', '2026-09-02T17:00:00Z', 150, { flags: ['edited'] }),
      entry('x', '2026-09-03T06:00:00Z', '2026-09-03T12:00:00Z', 330, { profile_id: 'someone-else' }),
      entry('d', '2026-09-30T06:00:00Z', null, 0),
    ], 'eva', '2026-09')
    expect(m.days).toHaveLength(30)
    expect(m.days[0].lines).toEqual([{ entry_id: 'a', start: '08:00', end: '16:30', break_minutes: 30, worked_minutes: 480, edited: false }])
    expect(m.days[1].lines.map(l => [l.start, l.end, l.edited])).toEqual([['08:00', '12:00', false], ['16:00', '19:00', true]])
    expect(m.days[1].worked_minutes).toBe(360)
    expect(m.days[2].lines).toEqual([]) // other people's entries are not on this sheet
    expect(m).toMatchObject({ worked_minutes: 840, days_worked: 3, open_entries: 1 })
  })
  it('knows how long each month is', () => {
    expect(monthRange('2026-02')).toMatchObject({ first: '2026-02-01', last: '2026-02-28' })
    expect(monthRange('2028-02').last).toBe('2028-02-29')
    expect(monthRange('2026-12')).toMatchObject({ last: '2026-12-31', toIso: '2027-01-02T00:00:00Z' })
  })
})
