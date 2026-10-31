import { describe, expect, it } from 'vitest'
import { checklistFrom, everyOf, fallsOn, fromEvery, routineOn, routineOnWeekday, routineProblem, shownRoutine, slotOf, type RoutineItem } from './routine'

const item = (p: Partial<RoutineItem>): RoutineItem => ({ id: p.name ?? 'x', name: 'Stock take', category: 'stock', weekdays: [1], every_weeks: 1, month_week: null,
  starts_on: '2026-01-05', starts_at: null, ends_at: null, profile_id: null, job_role_id: null, checklist: [], notes: null, active: true, sort: 0, ...p })

describe('weekly routine', () => {
  it('falls on its weekdays, every week, from when it starts', () => {
    const stock = item({ weekdays: [1, 4] })
    expect(fallsOn(stock, '2026-09-28')).toBe(true) // Monday
    expect(fallsOn(stock, '2026-10-01')).toBe(true) // Thursday
    expect(fallsOn(stock, '2026-09-29')).toBe(false)
    expect(fallsOn(item({ starts_on: '2026-10-01' }), '2026-09-28')).toBe(false) // before it starts
  })

  it('every 2 weeks counts from the week it starts', () => {
    const fortnightly = item({ weekdays: [3], every_weeks: 2, starts_on: '2026-09-28' }) // that week's Wednesday is the first
    expect(fallsOn(fortnightly, '2026-09-30')).toBe(true)
    expect(fallsOn(fortnightly, '2026-10-07')).toBe(false)
    expect(fallsOn(fortnightly, '2026-10-14')).toBe(true)
    // Across the clocks going back (25 October) and the turn of the year.
    expect(fallsOn(fortnightly, '2026-10-28')).toBe(true)
    expect(fallsOn(fortnightly, '2027-01-06')).toBe(true)
    expect(fallsOn(item({ weekdays: [1], every_weeks: 3, starts_on: '2026-09-28' }), '2026-10-19')).toBe(true)
    expect(fallsOn(item({ weekdays: [1], every_weeks: 3, starts_on: '2026-09-28' }), '2026-10-12')).toBe(false)
  })

  it('one week of the month: the first, or the last, of that weekday', () => {
    const first = item({ weekdays: [1], month_week: 1 })
    expect(fallsOn(first, '2026-10-05')).toBe(true) // the first Monday in October
    expect(fallsOn(first, '2026-10-12')).toBe(false)
    expect(fallsOn(first, '2026-09-07')).toBe(true)
    expect(fallsOn(item({ weekdays: [1], month_week: 2 }), '2026-10-12')).toBe(true)
    const last = item({ weekdays: [5], month_week: 5 })
    expect(fallsOn(last, '2026-10-30')).toBe(true) // the last Friday in October
    expect(fallsOn(last, '2026-10-23')).toBe(false)
    expect(fallsOn(last, '2026-09-25')).toBe(true)
  })

  it('lists a day’s activities in time order, untimed first, switched-off ones left out', () => {
    const items = [
      item({ name: 'Meeting', starts_at: '15:30' }), item({ name: 'Stock take', starts_at: '09:00' }),
      item({ name: 'Off', starts_at: '08:00', active: false }), item({ name: 'Any time' }), item({ name: 'Tuesday', weekdays: [2] }),
    ]
    expect(routineOn(items, '2026-09-28').map(r => r.name)).toEqual(['Any time', 'Stock take', 'Meeting'])
    // The Routine tab lists them all, switched off too.
    expect(routineOnWeekday(items, 1).map(r => r.name)).toEqual(['Any time', 'Off', 'Stock take', 'Meeting'])
  })

  it('keeps what someone hid for themselves off their calendar', () => {
    const items = [item({ id: 'a', category: 'stock' }), item({ id: 'b', category: 'cleaning' }), item({ id: 'c', category: 'meetings' })]
    expect(shownRoutine(items, undefined).map(r => r.id)).toEqual(['a', 'b', 'c'])
    expect(shownRoutine(items, { hiddenCategories: ['cleaning'] }).map(r => r.id)).toEqual(['a', 'c'])
    expect(shownRoutine(items, { hiddenItems: ['c'] }).map(r => r.id)).toEqual(['a', 'b'])
    expect(shownRoutine(items, { routine: false })).toEqual([])
  })

  it('reads and writes how often', () => {
    expect(everyOf({ every_weeks: 1, month_week: null })).toBe('w1')
    expect(everyOf({ every_weeks: 2, month_week: null })).toBe('w2')
    expect(everyOf({ every_weeks: 1, month_week: 5 })).toBe('m5')
    expect(fromEvery('m1')).toEqual({ every_weeks: 1, month_week: 1 })
    expect(fromEvery('w3')).toEqual({ every_weeks: 3, month_week: null })
  })

  it('says what stops an activity being saved', () => {
    const ok = { name: 'Stock take', category: 'stock' as const, weekdays: [1 as const] }
    expect(routineProblem(ok)).toBeNull()
    expect(routineProblem({ ...ok, name: ' ' })).toBe('Give the activity a name')
    expect(routineProblem({ ...ok, weekdays: [] })).toBe('Pick at least one day')
    expect(routineProblem({ ...ok, starts_at: '9:00' })).toBe('Times are like 09:30')
    expect(routineProblem({ ...ok, ends_at: '10:00' })).toBe('Give it a start time before the end')
    expect(routineProblem({ ...ok, starts_at: '10:00', ends_at: '09:00' })).toBe('It ends after it starts')
    expect(routineProblem({ ...ok, profile_id: 'p', job_role_id: 'r' })).toBe('Someone or a role, not both')
    expect(routineProblem({ ...ok, month_week: 1, every_weeks: 2 })).toBe('Pick the week of the month')
  })

  it('tidies a checklist and writes the time slot', () => {
    expect(checklistFrom('- Count the milk\n\n• Check the cups  \n  ')).toEqual(['Count the milk', 'Check the cups'])
    expect(slotOf({ starts_at: '09:00', ends_at: '09:45' })).toBe('09:00–09:45')
    expect(slotOf({ starts_at: '15:30:00', ends_at: null })).toBe('15:30')
    expect(slotOf({ starts_at: null, ends_at: null })).toBe('')
  })
})
