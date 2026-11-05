// Business Agent's own reps: where each business a rep brought is, and HQ's numbers by kind of business.
import { describe, expect, it } from 'vitest'
import { byCategory, introStage } from './hqReps'

const b = (status: string, plan = 'free', set_up_at: string | null = null) => ({ status, plan, set_up_at })

describe('Where a business a rep brought is', () => {
  it('follows its billing, then its set-up', () => {
    expect(introStage(b('none'))).toBe('signed_up')
    expect(introStage(b('none', 'free', '2026-11-05T10:00:00Z'))).toBe('set_up')
    expect(introStage(b('trialing', 'business'))).toBe('trial')
    expect(introStage(b('active', 'pro'))).toBe('paying')
    expect(introStage(b('past_due', 'pro'))).toBe('behind')
    expect(introStage(b('unpaid', 'pro'))).toBe('behind')
    expect(introStage(b('canceled', 'pro'))).toBe('cancelled')
    expect(introStage(b('comped', 'business'))).toBe('complimentary')
  })
})

describe('HQ by kind of business', () => {
  it('signed up, set up and paying, and the reps who lead each; only kinds with either', () => {
    const intros = [
      { kind: 'cafe' as const, ...b('active', 'pro', '2026-11-01') },
      { kind: 'cafe' as const, ...b('none', 'free', '2026-11-02') },
      { kind: 'cafe' as const, ...b('none') },
      { kind: 'salon' as const, ...b('trialing', 'business') },
    ]
    const reps = [{ categories: ['cafe'], active: true }, { categories: ['cafe', 'pub'], active: true }, { categories: ['pub'], active: false }]
    expect(byCategory(intros, reps)).toEqual([
      { kind: 'cafe', signedUp: 3, setUp: 2, paying: 1, reps: 2 },
      { kind: 'pub', signedUp: 0, setUp: 0, paying: 0, reps: 1 },
      { kind: 'salon', signedUp: 1, setUp: 1, paying: 0, reps: 0 },
    ])
  })
})
