import { describe, expect, it } from 'vitest'
import { advise, edgeHours, hourTotals, lateStarts, salesTotals, takingsPerStaffHour, takingsWhileOn, weekdayAverages, type AdviceFormat, type AdviceInput } from './insights'
import { addDays, dayKey, zonedIso } from './time'
import type { OpeningHours, SalesDay, TimeEntry } from './types'

const TODAY = '2026-10-25' // a Sunday
const HOURS: OpeningHours = { mon: { open: '08:00', close: '18:00' }, tue: { open: '08:00', close: '18:00' }, wed: { open: '08:00', close: '18:00' },
  thu: { open: '08:00', close: '18:00' }, fri: { open: '08:00', close: '18:00' }, sat: { open: '09:00', close: '18:00' }, sun: { open: '09:00', close: '16:00' } }

/** A day's takings spread over its hours: 8–17, with a quiet first hour on weekdays and a big lunch. */
function day(date: string, gross: number, shape: (h: number) => number): SalesDay {
  const w = Array.from({ length: 24 }, (_, h) => shape(h))
  const total = w.reduce((a, b) => a + b, 0)
  return { date, gross, tips: 0, refunds: 0, payments: Math.round(gross / 6), hours: w.map(x => Math.round(gross * x / total * 100) / 100) }
}
const weekday = (h: number) => (h < 8 || h >= 18 ? 0 : h === 8 ? 0.2 : h >= 11 && h < 15 ? 3 : 1)
const weekend = (h: number) => (h < 9 || h >= 16 ? 0 : h === 9 ? 2 : 1.5)
const eightWeeks = (grossOf: (date: string, i: number) => number) => Array.from({ length: 56 }, (_, i) => {
  const date = addDays(TODAY, -55 + i)
  const k = dayKey(date)
  return day(date, grossOf(date, i), k === 'sat' || k === 'sun' ? weekend : weekday)
})
const fmt: AdviceFormat = { money: n => `€${n.toFixed(2)}`, days: d => `${d}s`, list: x => x.join(', '), hour: h => `${h}:00` }
const empty: AdviceInput = { today: TODAY, sales: null, openingHours: null, items: null, menu: null, vsArea: null, entries: null, shifts: null,
  names: new Map(), teamCost: null, waste: null, lowStock: null, reviews: null }

describe('takings', () => {
  it('adds up, averages by day of the week (closed days left out) and by hour', () => {
    const days = [day('2026-10-19', 500, weekday), day('2026-10-26', 700, weekday), { date: '2026-10-20', gross: 0, tips: 0, refunds: 0, payments: 0 }]
    expect(salesTotals(days)).toMatchObject({ gross: 1200, payments: 200, average: 6, days: 2 })
    expect(weekdayAverages(days).find(w => w.day === 'mon')).toEqual({ day: 'mon', average: 600, days: 2 })
    expect(weekdayAverages(days).find(w => w.day === 'tue')!.days).toBe(0)
    expect(hourTotals(days)[12]).toBeGreaterThan(hourTotals(days)[8] * 10)
  })

  it('compares the first and last hour open with a usual hour that day', () => {
    const e = edgeHours([day('2026-10-19', 500, weekday)], HOURS)
    expect(e).toHaveLength(1)
    expect(e[0]).toMatchObject({ day: 'mon', open: '08:00', close: '18:00', days: 1, perHour: 50 })
    expect(e[0].first / e[0].perHour).toBeLessThan(0.4)
  })
})

describe('the advisor', () => {
  it('says nothing without enough to go on', () => {
    expect(advise(empty, fmt)).toEqual([])
    expect(advise({ ...empty, sales: eightWeeks(() => 500).slice(-5), openingHours: HOURS }, fmt)).toEqual([])
  })

  it('finds quiet first hours, a weak day, the peak hours and the trend', () => {
    const sales = eightWeeks((date, i) => (dayKey(date) === 'mon' ? 200 : i >= 28 ? 600 : 500))
    const a = advise({ ...empty, sales, openingHours: HOURS }, fmt)
    const quiet = a.find(x => x.id === 'quiet-open')!
    expect(quiet.vars!.days).toBe('mons, tues, weds, thus, fris')
    expect(a.find(x => x.id === 'busy-open')!.vars!.days).toBe('sats')
    expect(a.find(x => x.id === 'quiet-close')!.vars!.days).toContain('sats')
    expect(a.find(x => x.id === 'weak-days')!.vars!.days).toBe('mons')
    expect(a.find(x => x.id === 'peak-hours')!.vars!.hours).toBe('11:00, 12:00, 13:00')
    const trend = a.find(x => x.id === 'trend')!
    expect(trend.tone).toBe('good')
    expect(trend.vars!.pct).toBe('+19%')
    // Most important first.
    expect(a.map(x => x.weight)).toEqual([...a.map(x => x.weight)].sort((x, y) => y - x))
  })

  it('reads the menu: best sellers, slow ones, margins below the aim and room to raise', () => {
    const items = [{ name: 'Flat White', quantity: 600, gross: 1920 }, { name: 'Iced Matcha Latte', quantity: 500, gross: 2250 },
      { name: 'Croissant', quantity: 400, gross: 960 }, { name: 'Lemon Tart', quantity: 5, gross: 22 }, { name: 'Brownie', quantity: 120, gross: 384 }]
    const a = advise({ ...empty, items, menu: [{ name: 'Flat white', marginPct: 58, target: 70, priceForTarget: 3.6 }, { name: 'Tea', marginPct: 80, target: 70, priceForTarget: 2 }],
      vsArea: [{ name: 'Cappuccino', ours: 2.5, avg: 2.9, n: 3 }] }, fmt)
    expect(a.find(x => x.id === 'stars')!.vars!.items).toBe('Iced Matcha Latte, Flat White, Croissant')
    expect(a.find(x => x.id === 'slow')!.vars!.items).toBe('Lemon Tart')
    const m = a.find(x => x.id === 'margins')!
    expect(m.title).toBe('A best seller makes too little')
    expect(m.vars).toMatchObject({ name: 'Flat white', pct: 58, target: 70, price: '€3.60' })
    expect(a.find(x => x.id === 'room-to-raise')!.vars).toMatchObject({ name: 'Cappuccino', ours: '€2.50', avg: '€2.90' })
  })

  it('weighs the team against the takings, and spots late starts', () => {
    const sales = eightWeeks(date => (dayKey(date) === 'tue' ? 300 : 600))
    const entries: TimeEntry[] = sales.slice(-28).flatMap(d => {
      const two = ['a', 'b'].map(p => ({ id: `${p}-${d.date}`, profile_id: p, position_id: null, shift_id: `s-${p}-${d.date}`,
        clock_in: zonedIso(d.date, p === 'a' ? '08:10' : '10:00'), clock_out: zonedIso(d.date, p === 'a' ? '14:00' : '16:00'),
        source: 'app', clock_out_source: null, flags: [], note: null, approved_at: null, work_date: d.date, total_minutes: 360, break_minutes: 0,
        unpaid_break_minutes: 0, paid_minutes: 360, on_holiday: false }))
      return dayKey(d.date) === 'tue' ? [...two, { ...two[1], id: `c-${d.date}`, profile_id: 'c' }] : two
    })
    const shifts = entries.map(e => ({ id: e.shift_id!, starts_at: zonedIso(e.work_date, e.profile_id === 'a' ? '08:00' : '10:00') }))
    expect(lateStarts(entries, shifts).get('a')).toBe(28)
    expect(lateStarts(entries, shifts).get('b')).toBeUndefined()
    const perDay = takingsPerStaffHour(sales.slice(-28), entries)
    expect(perDay.find(d => d.day === 'tue')!.perHour).toBeLessThan(perDay.find(d => d.day === 'mon')!.perHour!)
    const on = takingsWhileOn(sales.slice(-28), entries)
    expect(on.get('a')!.hours).toBe(168)
    const a = advise({ ...empty, sales, entries, shifts: shifts as never, names: new Map([['a', 'Ana'], ['b', 'Ben'], ['c', 'Cris']]), teamCost: 7000 }, fmt)
    expect(a.find(x => x.id === 'staffing')!.vars).toMatchObject({ low: 'tues' })
    expect(a.find(x => x.id === 'labour')!.tone).toBe('warn')
    expect(a.find(x => x.id === 'late')!.vars!.people).toBe('Ana (28)')
    expect(a.find(x => x.id === 'people')).toBeDefined()
  })

  it('flags waste, low stock and reviews', () => {
    const a = advise({ ...empty, waste: { cost: 80, ofPurchases: 6.5, top: [{ name: 'Croissants', cost: 40 }] }, lowStock: ['Oat milk', 'Cups'],
      reviews: { rating: 4.8, count: 120, lastMonth: 9, low: 0, unreplied: 2 } }, fmt)
    expect(a.find(x => x.id === 'waste')!.tone).toBe('warn')
    expect(a.find(x => x.id === 'low-stock')!.vars!.items).toBe('Oat milk, Cups')
    expect(a.find(x => x.id === 'unreplied')!.vars!.n).toBe(2)
    expect(a.find(x => x.id === 'rating')!.vars!.rating).toBe('4.8')
  })
})
