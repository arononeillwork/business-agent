import { describe, expect, it } from 'vitest'
import { dayCoverage, shiftPaidMinutes, shiftWarnings, weeklyCheck } from './rules'
import type { CalendarEvent, OpeningHours, Shift } from './types'
import { addDays, formatDuration, weekStart, zonedIso } from './time'

const hours: OpeningHours = {
  mon: { open: '08:00', close: '18:00' }, tue: { open: '08:00', close: '18:00' },
  wed: { open: '08:00', close: '18:00' }, thu: { open: '08:00', close: '18:00' },
  fri: { open: '08:00', close: '18:00' }, sat: { open: '09:00', close: '18:00' },
  sun: null,
}

let n = 0
const shift = (date: string, from: string, to: string, breakMinutes = 0, profile = 'maria'): Shift => ({
  id: String(++n), profile_id: profile, position_id: 1, status: 'published', note: null,
  starts_at: zonedIso(date, from), ends_at: zonedIso(date, to), break_minutes: breakMinutes,
})

const holidays: CalendarEvent[] = [{
  id: 'h', starts_on: '2026-10-12', ends_on: null, starts_at: null, title: 'Fiesta Nacional',
  category: 'national', town: null, competition: null, source: 'import', confirmed: true, visibility: 'all',
}]

const codes = (s: Shift, all: Shift[] = [s]) =>
  shiftWarnings(s, { shifts: all, openingHours: hours, events: holidays }).map(w => w.code)

describe('time helpers', () => {
  it('finds Monday and formats durations', () => {
    expect(weekStart('2026-10-01')).toBe('2026-09-28') // Thursday -> Monday
    expect(weekStart('2026-09-28')).toBe('2026-09-28')
    expect(weekStart('2026-10-04')).toBe('2026-09-28') // Sunday
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(formatDuration(450)).toBe('7h 30m')
    expect(formatDuration(480)).toBe('8h')
  })
  it('converts Madrid local times across the DST change', () => {
    expect(zonedIso('2026-07-01', '08:00')).toBe('2026-07-01T06:00:00.000Z')
    expect(zonedIso('2026-11-02', '08:00')).toBe('2026-11-02T07:00:00.000Z')
  })
})

describe('shift warnings', () => {
  it('flags over 6h with no 15-min break, but not with one', () => {
    expect(codes(shift('2026-09-29', '08:00', '15:30'))).toContain('no_break')
    expect(codes(shift('2026-09-29', '08:00', '15:30', 15))).not.toContain('no_break')
  })
  it('flags overlaps for the same person only', () => {
    const a = shift('2026-09-29', '08:00', '12:00')
    const b = shift('2026-09-29', '11:00', '14:00')
    const c = shift('2026-09-29', '11:00', '14:00', 0, 'julio')
    expect(codes(a, [a, b, c])).toContain('overlap')
    expect(codes(c, [a, b, c])).not.toContain('overlap')
  })
  it('flags less than 12h rest between a close and an early open', () => {
    const close = shift('2026-09-29', '13:00', '19:00')
    const open = shift('2026-09-30', '06:30', '12:00')
    expect(codes(open, [close, open])).toContain('short_rest')
  })
  it('flags closed days, opening hours and holidays', () => {
    expect(codes(shift('2026-10-04', '10:00', '14:00'))).toContain('closed_day')
    expect(codes(shift('2026-09-29', '05:00', '09:00'))).toContain('outside_hours')
    expect(codes(shift('2026-10-12', '08:00', '12:00'))).toContain('holiday')
    expect(codes(shift('2026-09-29', '07:30', '15:00', 15))).toEqual([])
  })
  it('flags over 9 paid hours', () => {
    expect(codes(shift('2026-09-29', '08:00', '18:00', 30))).toContain('over_daily')
    expect(shiftPaidMinutes(shift('2026-09-29', '08:00', '18:00', 30))).toBe(570)
  })
})

describe('weekly check', () => {
  it('warns over 40h and on 7 working days', () => {
    const week = Array.from({ length: 7 }, (_, i) => shift(addDays('2026-09-28', i), '08:00', '14:00'))
    const res = weeklyCheck(week)
    expect(res.paidMinutes).toBe(42 * 60)
    expect(res.warnings).toEqual(['Over 40h this week', 'No weekly rest day'])
  })
})

describe('coverage', () => {
  it('shows gaps and thin peak cover', () => {
    const segs = dayCoverage('2026-09-29', [shift('2026-09-29', '08:00', '13:00')], hours)
    expect(segs[0]).toMatchObject({ from: '08:00', to: '11:00', level: 'ok', staff: 1 })
    expect(segs[1]).toMatchObject({ from: '11:00', to: '13:00', level: 'thin' })
    expect(segs[2]).toMatchObject({ from: '13:00', to: '18:00', level: 'none' })
  })
})
