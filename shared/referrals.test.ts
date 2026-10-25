import { describe, expect, it } from 'vitest'
import { MAX_FREE_MONTHS, cleanCode, freeMonths, progression, referralLink, stageOf, type Referral } from './referrals'

const r = (joined: string, setUp: string | null = null, i = 0): Referral => ({ id: `${joined}-${i}`, business_name: 'Café', joined_at: joined, set_up_at: setUp })

describe('Referral rules', () => {
  it('a month per business that finished set-up, never more than 12', () => {
    expect(freeMonths([r('2026-10-01T10:00:00Z'), r('2026-10-02T10:00:00Z', '2026-10-09T10:00:00Z')])).toBe(1)
    const lots = Array.from({ length: 15 }, (_, i) => r('2026-09-01T10:00:00Z', '2026-09-10T10:00:00Z', i))
    expect(freeMonths(lots)).toBe(MAX_FREE_MONTHS)
  })

  it('joined until set-up is done', () => {
    expect(stageOf(r('2026-10-01T10:00:00Z'))).toBe('joined')
    expect(stageOf(r('2026-10-01T10:00:00Z', '2026-10-05T10:00:00Z'))).toBe('set_up')
  })

  it('the link carries the code; only plain codes are accepted from a link', () => {
    expect(referralLink('https://businesssagent.com', 'AB12CD34')).toBe('https://businesssagent.com/?ref=AB12CD34')
    expect(cleanCode(' ab12cd34 ')).toBe('AB12CD34')
    expect(cleanCode('<script>')).toBeNull()
    expect(cleanCode(null)).toBeNull()
  })

  it('progression: week by week, running totals, at least 8 weeks ending this week', () => {
    const now = Date.parse('2026-10-18T12:00:00Z') // a Sunday; its week starts Monday 12 Oct
    const weeks = progression([r('2026-09-30T10:00:00Z'), r('2026-10-06T10:00:00Z', '2026-10-14T10:00:00Z')], now)
    expect(weeks).toHaveLength(8)
    expect(weeks.at(-1)).toEqual({ week: '2026-10-12', joined: 2, setUp: 1, months: 1 })
    expect(weeks.at(-2)).toEqual({ week: '2026-10-05', joined: 2, setUp: 0, months: 0 })
    expect(weeks.at(-3)).toEqual({ week: '2026-09-28', joined: 1, setUp: 0, months: 0 })
    expect(weeks[0]).toMatchObject({ week: '2026-08-24', joined: 0 })
  })

  it('an older first referral starts the chart earlier', () => {
    const weeks = progression([r('2026-06-01T10:00:00Z')], Date.parse('2026-10-18T12:00:00Z'))
    expect(weeks[0].week).toBe('2026-06-01')
    expect(weeks.every(w => w.joined === 1)).toBe(true)
  })
})
