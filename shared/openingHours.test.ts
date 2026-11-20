import { describe, expect, it } from 'vitest'
import { breakOf, fromPeriods, hoursKey, hoursLabel, hoursProblem, periodsOf } from './openingHours'

const split = { open: '09:00', close: '20:00', break: { from: '14:00', to: '17:00' } }

describe('Opening hours that close for a break', () => {
  it('splits a day around its break, and leaves a day without one as it is', () => {
    expect(periodsOf(split)).toEqual([{ open: '09:00', close: '14:00' }, { open: '17:00', close: '20:00' }])
    expect(periodsOf({ open: '09:00', close: '15:00' })).toEqual([{ open: '09:00', close: '15:00' }])
    expect(periodsOf(null)).toEqual([])
    expect(hoursLabel(split)).toBe('09:00–14:00, 17:00–20:00')
    expect(hoursLabel({ open: '09:00', close: '15:00' })).toBe('09:00–15:00')
  })

  it('only counts a break inside the day', () => {
    expect(breakOf(split)).toEqual({ from: '14:00', to: '17:00' })
    expect(breakOf({ ...split, break: { from: '8:00', to: '10:00' } })).toBeNull()
    expect(breakOf({ ...split, break: { from: '17:00', to: '14:00' } })).toBeNull()
    expect(breakOf({ ...split, break: null })).toBeNull()
    expect(periodsOf({ ...split, break: { from: '19:00', to: '21:00' } })).toEqual([{ open: '09:00', close: '20:00' }])
  })

  it('makes a day from the stretches it opens, in any order', () => {
    expect(fromPeriods([{ open: '17:00', close: '20:00' }, { open: '09:00', close: '14:00' }])).toEqual(split)
    expect(fromPeriods([{ open: '9:00', close: '15:00' }])).toEqual({ open: '9:00', close: '15:00' })
    expect(fromPeriods([])).toBeNull()
  })

  it('compares hours however the times are written', () => {
    expect(hoursKey({ ...split, open: '9:00' })).toBe(hoursKey(split))
    expect(hoursKey({ open: '09:00', close: '20:00' })).not.toBe(hoursKey(split))
    expect(hoursKey(null)).toBe('closed')
  })

  it('says what’s wrong with a day as typed', () => {
    expect(hoursProblem(split)).toBeNull()
    expect(hoursProblem(null)).toBeNull()
    expect(hoursProblem({ open: '15:00', close: '09:00' })).toMatch('after opening')
    expect(hoursProblem({ ...split, break: { from: '14:00', to: '21:00' } })).toMatch('break')
  })
})
