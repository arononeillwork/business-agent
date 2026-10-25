import { describe, expect, it } from 'vitest'
import { CAFE_POINTS, dueToday, inRange, limitsText, periodStart, type SafetyCheck, type SafetyPoint } from './foodSafety'

const point = (p: Partial<SafetyPoint> & { id: string }): SafetyPoint => ({ name: p.id, kind: 'temperature', min_temp: null, max_temp: null, frequency: 'daily',
  area: null, instructions: null, active: true, sort: 0, ...p })
const check = (point_id: string, day: string, time = '08:00'): SafetyCheck & { day: string } =>
  ({ id: `${point_id}-${day}-${time}`, point_id, checked_at: `${day}T${time}:00Z`, reading: 3, ok: true, action: null, note: null, by: null, day })

describe('food safety', () => {
  it('a reading is in range inside its limits, either of which can be open', () => {
    expect(inRange({ min_temp: 0, max_temp: 4 }, 4)).toBe(true)
    expect(inRange({ min_temp: 0, max_temp: 4 }, 4.1)).toBe(false)
    expect(inRange({ min_temp: null, max_temp: -18 }, -19)).toBe(true)
    expect(inRange({ min_temp: null, max_temp: -18 }, -12)).toBe(false)
    expect(inRange({ min_temp: 65, max_temp: null }, 63)).toBe(false)
  })

  it('limits in words, with a proper minus sign', () => {
    expect(limitsText({ min_temp: 0, max_temp: 4 })).toEqual({ text: '{min} to {max} °C', vars: { min: '0', max: '4' } })
    expect(limitsText({ min_temp: null, max_temp: -18 })).toEqual({ text: '{max} °C or below', vars: { max: '−18' } })
    expect(limitsText({ min_temp: null, max_temp: null })).toBeNull()
  })

  it('a check counts for its day, its week from Monday, or its month', () => {
    expect(periodStart('daily', '2026-09-30')).toBe('2026-09-30')
    expect(periodStart('weekly', '2026-09-30')).toBe('2026-09-28')
    expect(periodStart('monthly', '2026-09-30')).toBe('2026-09-01')
  })

  it('what’s to do today: two a day for twice daily, once a week for weekly; switched-off points left out', () => {
    const points = [point({ id: 'fridge', frequency: 'twice_daily', sort: 1 }), point({ id: 'deep', kind: 'task', frequency: 'weekly', sort: 2 }),
      point({ id: 'old', active: false })]
    const due = dueToday(points, [check('fridge', '2026-09-30'), check('fridge', '2026-09-29'), check('deep', '2026-09-28')], '2026-09-30')
    expect(due.map(d => [d.point.id, d.done, d.needed])).toEqual([['fridge', 1, 2], ['deep', 1, 1]])
    expect(due[0].last?.checked_at).toBe('2026-09-30T08:00:00Z')
  })

  it('the café’s usual checks hold Spain’s limits: chilled 4 °C or below, frozen −18 °C or below, hot 65 °C or above', () => {
    const by = Object.fromEntries(CAFE_POINTS.map(p => [p.key, p]))
    expect(by.fridge.max_temp).toBe(4)
    expect(by.freezer.max_temp).toBe(-18)
    expect(by.hot.min_temp).toBe(65)
    expect(new Set(CAFE_POINTS.map(p => p.key)).size).toBe(CAFE_POINTS.length)
    expect(CAFE_POINTS.filter(p => p.kind === 'task').every(p => p.min_temp === null && p.max_temp === null)).toBe(true)
  })
})
