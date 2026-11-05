import { describe, expect, it } from 'vitest'
import { lowestFirst, takingsSoFar, topJobs } from './todayGlance'

const hours = (byHour: Record<number, number>) => Array.from({ length: 24 }, (_, h) => byHour[h] ?? 0)

describe('takings today against breakeven', () => {
  it('runs the total up hour by hour from opening, to now', () => {
    const day = { gross: 600, hours: hours({ 8: 50, 9: 80, 10: 120, 11: 150, 12: 200 }) }
    const r = takingsSoFar(day, 300, 11.5, { open: '08:00', close: '18:00' })
    expect(r.points).toEqual([{ at: 8, total: 0 }, { at: 9, total: 50 }, { at: 10, total: 130 }, { at: 11, total: 250 }, { at: 11.5, total: 400 }])
    // Only what's come in so far: the 12:00 hour hasn't happened (a till that sends the whole day at once).
    expect(r.takings).toBe(400)
    expect(r).toMatchObject({ from: 8, to: 18, breakeven: 300, over: 100, short: 0, reachedAt: '12:00' })
    expect(r.share).toBeCloseTo(4 / 3)
  })

  it('says how far short it is before breakeven', () => {
    const r = takingsSoFar({ gross: 90, hours: hours({ 8: 40, 9: 50 }) }, 375.5, 9.25, { open: '08:00', close: '18:00' })
    expect(r).toMatchObject({ takings: 90, over: 0, short: 285.5, reachedAt: null })
    expect(r.share).toBeCloseTo(90 / 375.5)
  })

  it('stretches the day to sales outside the opening hours', () => {
    const r = takingsSoFar({ gross: 30, hours: hours({ 7: 30 }) }, 100, 7.5, { open: '08:00', close: '14:00' })
    expect(r).toMatchObject({ from: 7, to: 14, takings: 30 })
  })

  it('without hours from the till, the day’s total is all there is', () => {
    const r = takingsSoFar({ gross: 250 }, 200, 12, null)
    expect(r).toMatchObject({ takings: 250, points: [], over: 50, reachedAt: null })
  })

  it('before opening there is nothing to draw; with no breakeven, no share', () => {
    expect(takingsSoFar({ gross: 0, hours: hours({}) }, 300, 7, { open: '08:00', close: '18:00' })).toMatchObject({ points: [], takings: 0, short: 300 })
    expect(takingsSoFar({ gross: 50, hours: hours({ 9: 50 }) }, 0, 10, { open: '08:00', close: '18:00' })).toMatchObject({ share: null, reachedAt: null, over: 50 })
    expect(takingsSoFar(undefined, 300, 12, null)).toMatchObject({ takings: 0, points: [], short: 300 })
  })
})

describe('the jobs to do first', () => {
  const job = (title: string, x: Partial<{ done: boolean; pinned: boolean; starred: boolean; status: 'todo' | 'doing' | 'done'; position: number }> = {}) =>
    ({ title, done: false, pinned: false, starred: false, status: 'todo' as const, position: 0, ...x })
  it('pinned, starred and being done first, in the list’s order; three of them, never done ones', () => {
    const list = [job('Mop', { position: 1 }), job('Order milk', { starred: true, position: 5 }), job('Fix the tap', { status: 'doing', position: 2 }),
      job('Old', { done: true, pinned: true }), job('Call the bank', { pinned: true, position: 9 }), job('Bins', { position: 0 })]
    expect(topJobs(list).map(x => x.title)).toEqual(['Call the bank', 'Order milk', 'Fix the tap'])
    expect(topJobs(list, 10).map(x => x.title)).toEqual(['Call the bank', 'Order milk', 'Fix the tap', 'Bins', 'Mop'])
  })
})

describe('what’s low, the most urgent first', () => {
  it('none left first, then the furthest below its own reorder level, whatever the units', () => {
    const items = [{ name: 'Lids', on_hand: 300, reorder_at: 500 }, { name: 'Beans', on_hand: 2, reorder_at: 10 }, { name: 'Oat milk', on_hand: 0, reorder_at: 12 },
      { name: 'Cups', on_hand: 2, reorder_at: 10 }, { name: 'Syrup', on_hand: 1, reorder_at: null }]
    expect(lowestFirst(items).map(i => i.name)).toEqual(['Oat milk', 'Beans', 'Cups', 'Lids', 'Syrup'])
  })
})
