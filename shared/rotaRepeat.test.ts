import { describe, expect, it } from 'vitest'
import { addable, asWeekShift, isoWeekday, repeatUntil, shiftOn, type AddContext } from './rotaRepeat'
import { zonedIso } from './time'
import type { Shift } from './types'

const shift = (x: Partial<Shift>): Shift => ({ id: 's', profile_id: 'ana', position_id: 1, starts_at: zonedIso('2026-11-23', '08:30'),
  ends_at: zonedIso('2026-11-23', '14:00'), break_minutes: 0, note: null, status: 'published', ...x })

describe('repeating the rota', () => {
  it('knows the day of the week', () => {
    expect(['2026-11-23', '2026-11-26', '2026-11-29'].map(isoWeekday)).toEqual([1, 4, 7])
  })

  it('goes onto the weeks after the one copied: so many, or to the end of the fourth week after this one', () => {
    expect(repeatUntil('2026-11-23', 1, '2026-11-24')).toBe('2026-12-06')
    expect(repeatUntil('2026-11-23', 2, '2026-11-24')).toBe('2026-12-13')
    expect(repeatUntil('2026-11-23', null, '2026-11-24')).toBe('2026-12-27')
    // A week further on than that: at least the week after it.
    expect(repeatUntil('2027-01-04', null, '2026-11-24')).toBe('2027-01-17')
  })

  it('keeps the day and the times of day, across the clocks changing and past midnight', () => {
    const w = asWeekShift(shift({ starts_at: zonedIso('2026-03-29', '22:00'), ends_at: zonedIso('2026-03-30', '02:00'), note: 'Close' }))
    expect(w).toEqual({ weekday: 7, starts: '22:00', ends: '02:00', profile_id: 'ana', position_id: 1, break_minutes: 0, note: 'Close' })
    expect(shiftOn(w, '2026-11-29')).toEqual({ profile_id: 'ana', position_id: 1, break_minutes: 0, note: 'Close',
      starts_at: zonedIso('2026-11-29', '22:00'), ends_at: zonedIso('2026-11-30', '02:00') })
    const morning = asWeekShift(shift({}))
    expect(shiftOn(morning, '2027-04-05').starts_at).toBe(zonedIso('2027-04-05', '08:30'))
  })

  it('leaves out what has started, days the café is closed, whoever is off or away, and whoever is on already', () => {
    const c: AddContext = {
      now: zonedIso('2026-11-24', '10:00'),
      closed: day => day === '2026-12-25',
      shifts: [shift({ profile_id: 'ben', starts_at: zonedIso('2026-11-26', '12:00'), ends_at: zonedIso('2026-11-26', '16:00') }),
        shift({ profile_id: null, starts_at: zonedIso('2026-11-28', '17:00'), ends_at: zonedIso('2026-11-28', '20:00') })],
      onRota: id => id !== 'gone',
      away: (id, day) => id === 'ana' && day === '2026-11-27',
    }
    const on = (profile_id: string | null, day: string, from = '08:30', to = '14:00') =>
      addable({ ...shift({ profile_id }), starts_at: zonedIso(day, from), ends_at: zonedIso(day, to) }, day, c)
    expect(on('ana', '2026-11-24')).toBe('past')
    expect(on('ana', '2026-11-25')).toBe('added')
    expect(on('ana', '2026-12-25')).toBe('closed')
    expect(on(null, '2026-12-25', '17:00', '20:00')).toBe('closed')
    expect(on('gone', '2026-11-25')).toBe('off')
    expect(on('ana', '2026-11-27')).toBe('away')
    expect(on('ben', '2026-11-26')).toBe('busy')
    expect(on('ben', '2026-11-26', '08:00', '12:00')).toBe('added')
    expect(on(null, '2026-11-28', '17:00', '20:00')).toBe('busy')
    expect(on(null, '2026-11-28', '17:30', '20:00')).toBe('added')
  })
})
