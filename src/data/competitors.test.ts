import { describe, expect, it } from 'vitest'
import { COMPETITORS, USD_TO_EUR, euro, savings, stackTotal } from '../../shared/competitors'
import { TRIAL_PLAN } from '../../shared/plans'

describe('comparison with Square and GoHighLevel', () => {
  it('totals are the sum of their lines, and dollar prices are converted at the stated rate', () => {
    expect(stackTotal(COMPETITORS.find(c => c.id === 'square')!)).toBe(94)
    expect(stackTotal(COMPETITORS.find(c => c.id === 'gohighlevel')!)).toBe(169.69)
    for (const c of COMPETITORS) for (const l of c.lines) {
      if (l.usd) expect(l.eur).toBeCloseTo(l.usd * USD_TO_EUR, 2)
      expect(l.source).toMatch(/^https:\/\//)
    }
  })

  it('savings against the top plan add up, by the month and the year', () => {
    expect(TRIAL_PLAN.monthly).toBe(79)
    expect(savings(COMPETITORS[0], 79)).toEqual({ theirs: 94, ours: 79, month: 15, year: 180, percent: 16 })
    expect(savings(COMPETITORS[1], 79)).toEqual({ theirs: 169.69, ours: 79, month: 90.69, year: 1088.28, percent: 53 })
    expect(euro(1088.28)).toBe('€1,088.28')
    expect(euro(94)).toBe('€94')
  })
})
