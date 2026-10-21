import { describe, expect, it } from 'vitest'
import { CAFE_PRESETS, addMonths, renewedUntil, statusOf, yearlyCost } from './licences'

describe('licences and renewals', () => {
  it('ran out, renew soon (within its reminder days), up to date, or doesn’t run out', () => {
    expect(statusOf({ expires_on: '2026-09-29', reminder_days: 30 }, '2026-09-30')).toBe('expired')
    expect(statusOf({ expires_on: '2026-09-30', reminder_days: 30 }, '2026-09-30')).toBe('due') // its last day
    expect(statusOf({ expires_on: '2026-10-30', reminder_days: 30 }, '2026-09-30')).toBe('due')
    expect(statusOf({ expires_on: '2026-10-31', reminder_days: 30 }, '2026-09-30')).toBe('valid')
    expect(statusOf({ expires_on: null, reminder_days: 30 }, '2026-09-30')).toBe('permanent')
  })

  it('months on keep the day, or the month’s last day when it has fewer', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-12-31', 12)).toBe('2027-12-31')
    expect(addMonths('2026-10-15', 60)).toBe('2031-10-15')
  })

  it('renewed: one period on from when it ran out, so early or late renewals keep the usual day', () => {
    expect(renewedUntil({ expires_on: '2026-10-15', renew_every_months: 12 }, '2026-09-30')).toBe('2027-10-15') // early
    expect(renewedUntil({ expires_on: '2026-09-01', renew_every_months: 12 }, '2026-09-30')).toBe('2027-09-01') // late
    expect(renewedUntil({ expires_on: '2023-03-01', renew_every_months: 12 }, '2026-09-30')).toBe('2027-03-01') // years behind
    expect(renewedUntil({ expires_on: null, renew_every_months: 12 }, '2026-09-30')).toBe('2027-09-30') // none yet: from today
    expect(renewedUntil({ expires_on: null, renew_every_months: null }, '2026-09-30')).toBeNull()
  })

  it('a year’s cost: each renewal’s cost times how often a year; one-offs and switched-off ones left out', () => {
    expect(yearlyCost([
      { cost: 350, renew_every_months: 12, active: true }, { cost: 50, renew_every_months: 3, active: true },
      { cost: 900, renew_every_months: 60, active: true }, { cost: 600, renew_every_months: null, active: true },
      { cost: 100, renew_every_months: 12, active: false }, { cost: null, renew_every_months: 12, active: true },
    ])).toBe(350 + 200 + 180)
  })

  it('a café’s usual licences include the opening licence and both music licences', () => {
    const keys = CAFE_PRESETS.map(p => p.key)
    expect(keys).toEqual(expect.arrayContaining(['apertura', 'sgae', 'agedi', 'terraza']))
    expect(new Set(keys).size).toBe(keys.length)
    expect(CAFE_PRESETS.find(p => p.key === 'apertura')!.renew_every_months).toBeNull()
  })
})
