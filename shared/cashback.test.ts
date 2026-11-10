import { describe, expect, it } from 'vitest'
import { CASHBACK_DEFAULTS, cashbackDue, cashbackFor, cashbackRates, followersOver, isCashback } from './cashback'

// The database's own test (supabase/tests/zz_post_cashback.test.sql) has the same reel: they must agree.
const reel = { views: 14_200, likes: 1_180, gained: 67, usual: 15, days: 3 }

describe('Cashback for posts', () => {
  it('per 1,000 views, per new follower over the usual and per 100 likes, as the database works it out', () => {
    expect(cashbackFor(reel, CASHBACK_DEFAULTS)).toEqual({ amount: 14.66, views: 7.1, followers: 5.2, likes: 2.36 })
  })

  it('up to the most a post earns; followers count only when all three days are in, and never below the usual', () => {
    expect(cashbackFor(reel, { ...CASHBACK_DEFAULTS, cashback_max: 5 }).amount).toBe(5)
    expect(followersOver({ gained: 30, usual: 15, days: 2 })).toBeNull()
    expect(followersOver({ gained: 10, usual: 15, days: 3 })).toBe(0)
    expect(cashbackFor({ views: null, likes: null, gained: null, usual: null, days: 0 }, CASHBACK_DEFAULTS).amount).toBe(0)
  })

  it('due once its three days are in, or a week on', () => {
    expect(cashbackDue({ at: '2026-11-07T18:30:00Z', days: 3, gained: 67 }, '2026-11-10')).toBe(true)
    expect(cashbackDue({ at: '2026-11-09T18:30:00Z', days: 1, gained: null }, '2026-11-10')).toBe(false)
    expect(cashbackDue({ at: '2026-11-03T18:30:00Z', days: 0, gained: null }, '2026-11-10')).toBe(true)
  })

  it('reads the rates as the database gives them (numbers as text), the usual ones where there are none', () => {
    expect(cashbackRates({ cashback_on: false, cashback_per_1000_views: '1.50', cashback_max: '20.00' }))
      .toEqual({ ...CASHBACK_DEFAULTS, cashback_on: false, cashback_per_1000_views: 1.5, cashback_max: 20 })
    expect(cashbackRates(null)).toEqual(CASHBACK_DEFAULTS)
    expect(isCashback({ source: 'cashback:collab:DfNora0001' })).toBe(true)
    expect(isCashback({ source: 'stripe:in_1' })).toBe(false)
  })
})
