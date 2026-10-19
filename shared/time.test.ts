// Posts go out at the instant the person meant, in their own time zone, through the clocks changing.
import { afterEach, describe, expect, it } from 'vitest'
import { isTimeZone, localDate, localTime, ownTimeZone, setOwnTimeZone, zoneCity, zoneOffset, zonedIso } from './time'

describe('time zones', () => {
  afterEach(() => setOwnTimeZone())

  it('10:00 means 10:00 where the person is', () => {
    expect(zonedIso('2026-10-20', '10:00')).toBe('2026-10-20T08:00:00.000Z') // the café: Madrid, summer time
    expect(zonedIso('2026-10-20', '10:00', 'Europe/London')).toBe('2026-10-20T09:00:00.000Z')
    expect(zonedIso('2026-10-20', '10:00', 'America/New_York')).toBe('2026-10-20T14:00:00.000Z')
  })

  it('follows the clocks going back (25 October 2026 in Europe)', () => {
    expect(zonedIso('2026-10-24', '10:00')).toBe('2026-10-24T08:00:00.000Z')
    expect(zonedIso('2026-10-26', '10:00')).toBe('2026-10-26T09:00:00.000Z')
    expect(zoneOffset('Europe/Madrid', new Date('2026-10-24T12:00:00Z'))).toBe('GMT+2')
    expect(zoneOffset('Europe/Madrid', new Date('2026-10-26T12:00:00Z'))).toBe('GMT+1')
  })

  it('shows a saved instant back as the same date and time in that zone', () => {
    const at = zonedIso('2026-12-31', '23:30', 'Europe/London')
    expect([localDate(at, 'Europe/London'), localTime(at, 'Europe/London')]).toEqual(['2026-12-31', '23:30'])
    expect([localDate(at), localTime(at)]).toEqual(['2027-01-01', '00:30']) // already New Year in Madrid
  })

  it('the person’s own zone, falling back to the café’s when unset or unknown', () => {
    setOwnTimeZone('Europe/London', 'Europe/Madrid')
    expect(ownTimeZone()).toBe('Europe/London')
    setOwnTimeZone(undefined, 'Atlantic/Canary')
    expect(ownTimeZone()).toBe('Atlantic/Canary')
    setOwnTimeZone('Mars/Olympus_Mons', 'Europe/Madrid')
    expect(ownTimeZone()).toBe('Europe/Madrid')
    expect(isTimeZone('Mars/Olympus_Mons')).toBe(false)
    expect(isTimeZone('')).toBe(false)
  })

  it('names a zone by its city', () => {
    expect(zoneCity('Europe/Madrid')).toBe('Madrid')
    expect(zoneCity('America/New_York')).toBe('New York')
    expect(zoneCity('UTC')).toBe('UTC')
  })
})
