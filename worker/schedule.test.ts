// The minute job's outside-service work, spread out (worker/schedule.ts): a run may make only 50 outside
// requests, so at their usual times no two of a business's jobs share a minute, the quarter hours are
// the Google hours sync's alone, each runs as often as it should, and businesses take turns.
import { describe, expect, it } from 'vitest'
import { OFFSETS, dueJobs, shiftOf, type Every, type Periodic } from './schedule'
import { CHOICES } from '../shared/refresh'

const USUAL: Every = { hours: CHOICES.hours.usual, mentions: CHOICES.mentions.usual, customers: CHOICES.customers.usual, menu: CHOICES.menu.usual,
  reviews: 60, cameras: 60, music: 5, reps: 15 }
/** A whole day of minutes, from midnight UTC. */
const DAY = Array.from({ length: 1440 }, (_, m) => Date.UTC(2026, 10, 6) / 60_000 + m)

describe('the minute job’s outside-service work', () => {
  it('at the usual times, never two of a business’s jobs in one minute, and each as often as it should', () => {
    for (let id = 1; id <= 40; id++) {
      const runs: Record<Periodic, number> = { hours: 0, mentions: 0, customers: 0, menu: 0, reviews: 0, cameras: 0, music: 0, reps: 0 }
      for (const minute of DAY) {
        const now = dueJobs(minute, id, USUAL)
        expect(now.length, `business ${id} at minute ${minute % 60}: ${now.join(', ')}`).toBeLessThanOrEqual(1)
        for (const j of now) runs[j]++
      }
      expect(runs).toEqual({ hours: 96, mentions: 96, customers: 24, menu: 24, reviews: 24, cameras: 24, music: 288, reps: 96 })
    }
  })

  it('the hourly jobs are off the quarter hours that the Google hours sync has', () => {
    const quarter = (minute: number, id: number) => (minute - shiftOf(id)) % 15 === 0
    for (const minute of DAY) {
      const now = dueJobs(minute, 1, USUAL)
      if (quarter(minute, 1)) expect(now).toEqual(['hours'])
    }
    expect(new Set(Object.values(OFFSETS)).size).toBe(Object.keys(OFFSETS).length)
  })

  it('businesses take turns: the same job a minute or more apart', () => {
    const first = (id: number, job: Periodic) => DAY.find(m => dueJobs(m, id, USUAL).includes(job))!
    expect(first(2, 'menu') - first(1, 'menu')).toBe(1)
    expect(new Set([1, 2, 3, 4, 5].map(id => first(id, 'hours') % 15)).size).toBe(5)
  })

  it('follows a business’s own time', () => {
    const every = { ...USUAL, menu: 7 }
    const menus = DAY.filter(m => dueJobs(m, 1, every).includes('menu'))
    expect([Math.floor(1440 / 7), Math.ceil(1440 / 7)]).toContain(menus.length)
    for (let i = 1; i < menus.length; i++) expect(menus[i] - menus[i - 1]).toBe(7)
  })
})
