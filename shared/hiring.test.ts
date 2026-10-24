import { describe, expect, it } from 'vitest'
import { keepUntil, overdue, stageCounts } from './hiring'

describe('hiring', () => {
  it('applicants are kept a year from applying (the month’s last day when it has fewer)', () => {
    expect(keepUntil('2025-09-12')).toBe('2026-09-12')
    expect(keepUntil('2028-02-29')).toBe('2029-02-28')
  })

  it('past their day and not hired: their details should go', () => {
    expect(overdue({ stage: 'rejected', keep_until: '2026-09-12' }, '2026-09-30')).toBe(true)
    expect(overdue({ stage: 'applied', keep_until: '2026-09-12' }, '2026-09-30')).toBe(true)
    expect(overdue({ stage: 'hired', keep_until: '2026-09-12' }, '2026-09-30')).toBe(false)
    expect(overdue({ stage: 'rejected', keep_until: '2026-09-30' }, '2026-09-30')).toBe(false)
  })

  it('counts applicants at each stage', () => {
    const n = stageCounts([{ stage: 'applied' }, { stage: 'interview' }, { stage: 'interview' }, { stage: 'hired' }])
    expect(n).toMatchObject({ applied: 1, interview: 2, hired: 1, offer: 0, rejected: 0 })
  })
})
