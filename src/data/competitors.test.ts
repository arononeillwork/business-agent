import { describe, expect, it } from 'vitest'
import { COMPETITORS, USD_TO_EUR, euro, savings, stackTotal } from '../../shared/competitors'
import { plan } from '../../shared/plans'

describe('comparison with Square and GoHighLevel', () => {
  it('totals are the sum of their lines, and dollar prices are converted at the stated rate', () => {
    expect(stackTotal(COMPETITORS.find(c => c.id === 'square')!)).toBe(94)
    expect(stackTotal(COMPETITORS.find(c => c.id === 'gohighlevel')!)).toBe(169.69)
    for (const c of COMPETITORS) for (const l of c.lines) {
      if (l.usd) expect(l.eur).toBeCloseTo(l.usd * USD_TO_EUR, 2)
      expect(l.source).toMatch(/^https:\/\//)
    }
  })

  it('each stack is set against the plan that covers it, and the savings add up by the month and the year', () => {
    const square = COMPETITORS.find(c => c.id === 'square')!, ghl = COMPETITORS.find(c => c.id === 'gohighlevel')!
    expect(plan(square.plan).monthly).toBe(79)
    expect(plan(ghl.plan).monthly).toBe(129)
    expect(savings(square, 79)).toEqual({ theirs: 94, ours: 79, month: 15, year: 180, percent: 16 })
    expect(savings(ghl, 129)).toEqual({ theirs: 169.69, ours: 129, month: 40.69, year: 488.28, percent: 24 })
    for (const c of COMPETITORS) expect(savings(c, plan(c.plan).monthly).month).toBeGreaterThan(0)
    // What we say the stack lacks, the plan we compare with has.
    expect(square.missing.join(' ')).not.toMatch(/gestoría/)
    expect(euro(1088.28)).toBe('€1,088.28')
    expect(euro(94)).toBe('€94')
  })
})
