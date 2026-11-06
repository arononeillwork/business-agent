import { describe, expect, it } from 'vitest'
import { CHOICES, MINUTES, SOURCES, allowedOptions, due, everyText, fastestFor, isChoosable, refreshMinutes, takingsMinutes, type Choosable } from './refresh'
import { PLANS } from './plans'

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

  it('takings for today at the business’s own rate', () => {
    const now = Date.parse('2026-10-23T14:00:00Z')
    expect(takingsMinutes('2026-10-24T00:00:00+02:00', now, 5)).toBe(5)
    expect(takingsMinutes('2026-10-01T00:00:00+02:00', now, 5)).toBe(MINUTES.takingsPast)
  })
})

describe('the business’s own refresh rates', () => {
  const ids = Object.keys(CHOICES) as Choosable[]

  it('each choice has its usual time among its options, fastest first, and Business’s range takes them in', () => {
    for (const id of ids) {
      const c = CHOICES[id]
      expect(c.options, id).toContain(c.usual)
      expect([...c.options].sort((a, b) => a - b), id).toEqual(c.options)
      expect(c.min, id).toBe(c.options[0])
      expect(c.max, id).toBeGreaterThanOrEqual(c.options[c.options.length - 1])
      expect(c.phrase, id).toContain('{every}')
      expect(SOURCES.some(s => s.id === id), id).toBe(true)
    }
    expect(isChoosable('takings')).toBe(true)
    expect(isChoosable('reviews')).toBe(false)
  })

  it('the usual times are what every business had before it could choose', () => {
    expect(CHOICES.takings.usual).toBe(MINUTES.takings)
    expect(CHOICES.email.usual).toBe(MINUTES.email)
    expect(CHOICES.social.usual).toBe(MINUTES.social)
    for (const id of ids) for (const p of PLANS) expect(refreshMinutes({}, p.id, id)).toBe(CHOICES[id].usual)
  })

  it('Free keeps the usual or slower; each plan up goes a step faster; Business the fastest', () => {
    expect(allowedOptions('takings', 'free')).toEqual([15, 30, 60])
    expect(allowedOptions('takings', 'starter')).toEqual([10, 15, 30, 60])
    expect(allowedOptions('takings', 'pro')).toEqual([5, 10, 15, 30, 60])
    expect(allowedOptions('takings', 'business')).toEqual([2, 5, 10, 15, 30, 60])
    for (const id of ids) {
      const fastest = PLANS.map(p => fastestFor(id, p.id))
      expect([...fastest].sort((a, b) => b - a), id).toEqual(fastest) // never slower going up a plan
      expect(fastestFor(id, 'free'), id).toBe(CHOICES[id].usual)
    }
  })

  it('a choice the plan doesn’t allow becomes the nearest one it does, never faster', () => {
    expect(refreshMinutes({ takings: 2 }, 'business', 'takings')).toBe(2)
    expect(refreshMinutes({ takings: 2 }, 'pro', 'takings')).toBe(5)
    expect(refreshMinutes({ takings: 2 }, 'free', 'takings')).toBe(15) // back on Free from the trial
    expect(refreshMinutes({ takings: 45 }, 'pro', 'takings')).toBe(60)
    expect(refreshMinutes({ takings: 600 }, 'free', 'takings')).toBe(60)
    expect(refreshMinutes({ takings: 30 }, 'free', 'takings')).toBe(30) // slower is always fine
  })

  it('Business types its own minutes, kept within the service’s limits', () => {
    expect(refreshMinutes({ menu: 7 }, 'business', 'menu')).toBe(7)
    expect(refreshMinutes({ menu: 1 }, 'business', 'menu')).toBe(CHOICES.menu.min)
    expect(refreshMinutes({ menu: 99999 }, 'business', 'menu')).toBe(CHOICES.menu.max)
    expect(refreshMinutes({ menu: 'fast' }, 'business', 'menu')).toBe(CHOICES.menu.usual)
    expect(refreshMinutes(null, 'business', 'menu')).toBe(CHOICES.menu.usual)
  })

  it('says each time in words', () => {
    expect(everyText(1)).toEqual({ text: 'every minute' })
    expect(everyText(15)).toEqual({ text: 'every {n} minutes', n: 15 })
    expect(everyText(90)).toEqual({ text: 'every {n} minutes', n: 90 })
    expect(everyText(60)).toEqual({ text: 'every hour' })
    expect(everyText(360)).toEqual({ text: 'every {n} hours', n: 6 })
    expect(everyText(1440)).toEqual({ text: 'every day' })
    expect(everyText(2880)).toEqual({ text: 'every {n} days', n: 2 })
    expect(everyText(10080)).toEqual({ text: 'every week' })
  })

  it('a job is due once a round, on the minute it was before for the usual time', () => {
    const at = (min: number, n: number, off = 0) => Array.from({ length: 180 }, (_, m) => m).filter(m => due(min + m, n, off)).length
    expect(at(0, 60, 15)).toBe(3)
    expect(due(15, 60, 15)).toBe(true)
    expect(due(75, 60, 15)).toBe(true)
    expect(due(30, 15, 15)).toBe(true) // an offset beyond the round wraps
    expect(at(0, 7)).toBe(26)
  })
})
