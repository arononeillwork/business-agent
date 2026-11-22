import { describe, expect, it } from 'vitest'
import { CASHBACK_DEFAULTS, CASHBACK_KEYS, cashbackDue, cashbackFor, cashbackRates, followersIn, isCashback, pausesAfterSwitch, postedWhileOff } from './cashback'

// The database's own test (supabase/tests/zz_post_cashback.test.sql) has the same reel: they must agree.
const reel = { views: 14_200, likes: 1_180, gained: 67, usual: 15, days: 3 }

describe('Cashback for posts', () => {
  it('per 1,000 views, per new follower in its three days (every one, not only those over the usual) and per 100 likes, up to the most a post earns, as the database works it out', () => {
    expect(cashbackFor(reel, CASHBACK_DEFAULTS)).toEqual({ amount: 15, views: 7.1, followers: 6.7, likes: 2.36 })
    expect(cashbackFor(reel, { ...CASHBACK_DEFAULTS, cashback_max: 20 }).amount).toBe(16.16)
  })

  it('followers count only when all three days are in', () => {
    expect(cashbackFor(reel, { ...CASHBACK_DEFAULTS, cashback_max: 5 }).amount).toBe(5)
    expect(followersIn({ gained: 30, days: 2 })).toBeNull()
    expect(followersIn({ gained: 10, days: 3 })).toBe(10)
    expect(cashbackFor({ views: null, likes: null, gained: null, days: 0 }, CASHBACK_DEFAULTS).amount).toBe(0)
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

  it('switched off for the whole business: a post made while it was off never earns it, one made before or after does', () => {
    const offAt = '2026-11-10T09:00:00.123456+00:00'
    const onAt = '2026-11-14T18:00:00+00:00'
    // As the database keeps them (the cashback_switch migration): off starts a time off, on ends it, nothing else changes them.
    const off = pausesAfterSwitch([], true, false, offAt)
    expect(off).toEqual([{ from: offAt, until: null }])
    expect(pausesAfterSwitch(off, false, false, onAt)).toBe(off)
    const back = pausesAfterSwitch(off, false, true, onAt)
    expect(back).toEqual([{ from: offAt, until: onAt }])
    expect(pausesAfterSwitch(back, true, true, onAt)).toBe(back)
    expect(postedWhileOff('2026-11-12T20:15:00Z', back)).toBe(true)
    expect(postedWhileOff('2026-11-10T08:59:00Z', back)).toBe(false)
    expect(postedWhileOff('2026-11-14T18:00:00Z', back)).toBe(false)
    // Still off: everything since.
    expect(postedWhileOff('2026-12-01T10:00:00Z', off)).toBe(true)
    expect(postedWhileOff('2026-11-12T20:15:00Z', [])).toBe(false)
    expect(postedWhileOff('2026-11-12T20:15:00Z', undefined)).toBe(false)
  })

  it('reads when it was off as the database gives it, and asks for it with the rates', () => {
    expect(cashbackRates({ cashback_paused: [{ from: '2026-11-10T09:00:00+00:00', until: null }, { nope: 1 }, null] }).cashback_paused)
      .toEqual([{ from: '2026-11-10T09:00:00+00:00', until: null }])
    expect(cashbackRates({ cashback_paused: null }).cashback_paused).toEqual([])
    expect(CASHBACK_KEYS).toContain('cashback_paused')
  })
})
