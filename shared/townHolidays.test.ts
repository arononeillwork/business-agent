// A town's two local holidays a year: which years are asked for and when, which count as added, and
// what's checked before they're saved.
import { describe, expect, it } from 'vitest'
import {
  isTownHoliday, sameTown, townHolidayId, townHolidaysMissing, townHolidaysProblem, townHolidaysTitle, townHolidaysToTell,
  townHolidayYears, townHolidayYearsToSet,
} from './townHolidays'

const day = (date: string, town = 'Marbella', id: string | null = townHolidayId(date)) => ({ category: 'local', external_id: id, starts_on: date, town })

describe('a town’s local holidays', () => {
  it('this year’s are asked for all year; next year’s from December', () => {
    expect(townHolidayYears('2026-01-01')).toEqual([2026])
    expect(townHolidayYears('2026-11-30')).toEqual([2026])
    expect(townHolidayYears('2026-12-01')).toEqual([2026, 2027])
    expect(townHolidayYears('2026-12-31')).toEqual([2026, 2027])
    expect(townHolidayYearsToSet('2026-11-08')).toEqual([2026, 2027])
  })

  it('a year counts as added once one of the town’s days is on the calendar for it', () => {
    const days = [day('2026-06-11'), day('2026-10-19')]
    expect(townHolidaysMissing('2026-11-08', 'Marbella', days)).toEqual([])
    expect(townHolidaysMissing('2026-12-01', 'Marbella', days)).toEqual([2027])
    expect(townHolidaysMissing('2026-12-01', 'Marbella', [...days, day('2027-06-11')])).toEqual([])
    // However its name was typed.
    expect(townHolidaysMissing('2026-11-08', '  marbella ', days)).toEqual([])
  })

  it('another town’s days, or a local holiday added by hand, don’t count; no town, nothing to ask', () => {
    expect(townHolidaysMissing('2026-11-08', 'Sevilla', [day('2026-06-11')])).toEqual([2026])
    expect(townHolidaysMissing('2026-11-08', 'Marbella', [day('2026-06-11', 'Marbella', null), day('2026-06-12', 'Marbella', 'marbella-2026-06-12')])).toEqual([2026])
    expect(townHolidaysMissing('2026-11-08', null, [])).toEqual([])
    expect(townHolidaysMissing('2026-11-08', '  ', [])).toEqual([])
  })

  it('tells admins about a year once for a town', () => {
    expect(townHolidaysToTell([2026, 2027], 'Marbella', [])).toEqual([2026, 2027])
    expect(townHolidaysToTell([2026, 2027], 'Marbella', [{ year: 2026, town: 'Marbella' }, { year: '2027', town: 'marbella' }])).toEqual([])
    // A town moved to is asked about afresh.
    expect(townHolidaysToTell([2027], 'Sevilla', [{ year: 2027, town: 'Marbella' }])).toEqual([2027])
  })

  it('knows its own: local, with a local- id', () => {
    expect(isTownHoliday(day('2027-06-11'))).toBe(true)
    expect(isTownHoliday({ category: 'local', external_id: 'marbella-2026-06-11' })).toBe(false)
    expect(isTownHoliday({ category: 'national', external_id: 'local-2026-06-11' })).toBe(false)
    expect(sameTown('Marbella', 'MARBELLA')).toBe(true)
    expect(sameTown('Marbella', null)).toBe(false)
  })

  it('takes two different days of that year, neither a public holiday already', () => {
    const holidays = [{ category: 'national', starts_on: '2027-10-12', title: 'Fiesta Nacional de España' },
      { category: 'regional', starts_on: '2027-03-01', title: 'Día de Andalucía' }, { category: 'area', starts_on: '2027-05-15', title: 'San Isidro' }]
    expect(townHolidaysProblem(2027, ['2027-06-11', '2027-10-19'], holidays)).toBeNull()
    expect(townHolidaysProblem(2027, ['2027-06-11', ''])).toEqual({ text: 'Pick both days' })
    expect(townHolidaysProblem(2027, ['2027-06-11'])).toEqual({ text: 'Pick both days' })
    expect(townHolidaysProblem(2027, ['2027-06-11', '2026-10-19'])).toEqual({ text: 'Both days must be in {year}' })
    expect(townHolidaysProblem(2027, ['2027-06-11', '2027-06-11'])).toEqual({ text: 'Pick two different days' })
    expect(townHolidaysProblem(2027, ['2027-03-01', '2027-10-12'], holidays))
      .toEqual({ text: '{date} is already a holiday: {name}', holiday: { date: '2027-03-01', name: 'Día de Andalucía' } })
    // A nearby town's day is no clash.
    expect(townHolidaysProblem(2027, ['2027-05-15', '2027-10-19'], holidays)).toBeNull()
  })

  it('says what to add', () => {
    expect(townHolidaysTitle(' Marbella ', 2027)).toBe('Add Marbella’s local holidays for 2027')
  })
})
