import { describe, expect, it } from 'vitest'
import { KITTY_IDEAS, addMonths, fillJars, forecast, kittyBalance, monthlyPace, monthsNotPaidIn, profitShare, type KittyEntry, type KittyGoal } from './kitty'

const goal = (id: string, target: number, more: Partial<KittyGoal> = {}): KittyGoal => ({ id, name: id, icon: 'gift', target, due_on: null, sort: 0,
  link: null, notes: null, spent: null, bought_on: null, created_at: '2026-06-01T10:00:00Z', ...more })
const entry = (kind: KittyEntry['kind'], amount: number, when: string, month: string | null = null): KittyEntry => ({ id: `${kind}-${when}-${amount}`, kind,
  month, percent: kind === 'profit' ? 5 : null, amount, note: null, created_at: `${when}T10:00:00Z` })

describe('staff kitty', () => {
  it('a month’s share of profit; a month with a loss puts nothing in', () => {
    expect(profitShare(4102, 5)).toBe(205.1)
    expect(profitShare(-800, 5)).toBe(0)
  })

  it('what’s in it: everything put in, less what’s been bought', () => {
    expect(kittyBalance([{ amount: 300 }, { amount: 46.5 }, { amount: -5 }], [{ spent: 175 }, { spent: null }])).toBe(166.5)
  })

  it('the jars fill in order, the first until it’s full; bought ones come after, newest first', () => {
    const goals = [goal('rayban', 160, { sort: 2 }), goal('party', 500, { sort: 1 }), goal('course', 240, { sort: 3 }),
      goal('bbq', 300, { spent: 280, bought_on: '2026-08-24' }), goal('cake', 40, { spent: 38, bought_on: '2026-09-02' })]
    const jars = fillJars(goals, 560)
    expect(jars.map(j => [j.goal.id, j.saved, j.full, j.bought])).toEqual([
      ['party', 500, true, false], ['rayban', 60, false, false], ['course', 0, false, false], ['cake', 38, true, true], ['bbq', 280, true, true],
    ])
    expect(jars[1].share).toBeCloseTo(0.375)
    expect(fillJars(goals, -10)[0].saved).toBe(0)
  })

  it('the pace: what went in a month over the last three whole months, or since it started', () => {
    const entries = [entry('profit', 120, '2026-06-02', '2026-05-01'), entry('profit', 150, '2026-07-02', '2026-06-01'),
      entry('profit', 180, '2026-08-03', '2026-07-01'), entry('top_up', 30, '2026-08-20'), entry('adjust', 500, '2026-08-21'),
      entry('profit', 210, '2026-09-01', '2026-08-01'), entry('top_up', 99, '2026-09-25')]
    // June, July and August (September's tips are this month: not a whole month yet).
    expect(monthlyPace(entries, '2026-09-30')).toBe(190)
    // Started last month: one month.
    expect(monthlyPace([entry('profit', 210, '2026-09-01', '2026-08-01')], '2026-09-30')).toBe(210)
    expect(monthlyPace([], '2026-09-30')).toBe(0)
  })

  it('when each goal is full at that pace, in order, and whether it makes its date', () => {
    const jars = fillJars([goal('party', 500, { sort: 1, due_on: '2026-12-18' }), goal('rayban', 160, { sort: 2, due_on: '2026-11-01' }),
      goal('trip', 400, { sort: 3 })], 400)
    const f = forecast(jars, 100, '2026-10-23')
    // The party needs 100 more: November (October's money). The Ray-Bans 260: 3 months, after their date.
    expect(f.get('party')).toEqual({ months: 1, by: '2026-11', inTime: true, perMonth: 50 })
    expect(f.get('rayban')).toEqual({ months: 3, by: '2027-01', inTime: false, perMonth: 260 })
    expect(f.get('trip')).toMatchObject({ months: 7, by: '2027-05', inTime: null, perMonth: null })
    expect(forecast(jars, 0, '2026-10-23').get('party')).toMatchObject({ months: null, by: null, inTime: false })
    expect(forecast(fillJars([goal('party', 500)], 600), 0, '2026-10-23').get('party')).toMatchObject({ months: 0, by: '2026-10' })
  })

  it('months still to have their share put in', () => {
    expect(monthsNotPaidIn(['2026-09', '2026-08', '2026-07'], [entry('profit', 10, '2026-08-02', '2026-07-01'), entry('top_up', 5, '2026-09-02')]))
      .toEqual(['2026-09', '2026-08'])
    expect(addMonths('2026-11', 2)).toBe('2027-01')
  })

  it('ideas to save for include the Christmas party and Ray-Bans for the café', () => {
    expect(KITTY_IDEAS.map(i => i.icon)).toEqual(expect.arrayContaining(['party', 'sunglasses']))
  })
})
