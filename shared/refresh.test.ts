import { describe, expect, it } from 'vitest'
import { MINUTES, SOURCES, takingsMinutes } from './refresh'

describe('how often outside services are read', () => {
  it('takings: a period that takes in yesterday or today every 15 minutes, one over before then once a day', () => {
    const now = Date.parse('2026-10-23T14:00:00Z')
    expect(takingsMinutes('2026-10-24T00:00:00+02:00', now)).toBe(MINUTES.takings) // up to today
    expect(takingsMinutes('2026-10-23T00:00:00+02:00', now)).toBe(MINUTES.takings) // up to yesterday
    expect(takingsMinutes('2026-10-22T00:00:00+02:00', now)).toBe(MINUTES.takingsPast) // over before yesterday
    expect(takingsMinutes('2026-10-01T00:00:00+02:00', now)).toBe(MINUTES.takingsPast)
  })

  it('Places, which Google charges for past 1,000 look-ups a month, stays well inside that', () => {
    expect(31 * 24 * 60 / MINUTES.reviewsPlaces).toBeLessThanOrEqual(250)
  })

  it('every service has its own entry, said in words', () => {
    expect(new Set(SOURCES.map(s => s.id)).size).toBe(SOURCES.length)
    for (const s of SOURCES) expect(s.what && s.from && s.every && s.why).toBeTruthy()
  })
})
