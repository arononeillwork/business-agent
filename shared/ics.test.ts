import { describe, expect, it } from 'vitest'
import { buildIcs, icsEscape, icsFold } from './ics'

describe('calendar feeds (iCalendar)', () => {
  it('writes timed and all-day events with CRLF line endings', () => {
    const ics = buildIcs('Easy Beans · my shifts', [
      { uid: 'shift-1@easybeans', title: 'Barista shift', start: '2026-10-03T07:00:00.000Z', end: '2026-10-03T15:00:00.000Z', location: 'C. Pizarro, 8' },
      { uid: 'off-1@easybeans', title: 'Holiday', day: '2026-10-12', lastDay: '2026-10-13' },
    ], '2026-09-27T10:00:00Z')
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('DTSTART:20261003T070000Z\r\nDTEND:20261003T150000Z')
    expect(ics).toContain('LOCATION:C. Pizarro\\, 8')
    expect(ics).toContain('DTSTART;VALUE=DATE:20261012\r\nDTEND;VALUE=DATE:20261014') // end is exclusive
    expect(ics).toContain('DTSTAMP:20260927T100000Z')
    expect(ics.split('\r\n').filter(l => l === 'BEGIN:VEVENT')).toHaveLength(2)
  })
  it('escapes text and folds long lines without splitting characters', () => {
    expect(icsEscape('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne')
    const long = `SUMMARY:${'Café · '.repeat(20)}`
    const folded = icsFold(long)
    for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    expect(folded.split('\r\n').map((l, i) => (i ? l.slice(1) : l)).join('')).toBe(long)
  })
})
