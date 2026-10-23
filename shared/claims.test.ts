import { describe, expect, it } from 'vitest'
import { DEFAULT_MILEAGE_RATE, claimTotals, mileageAmount, tripKm } from './claims'

describe('expenses and mileage', () => {
  it('a trip: the kilometres (twice there and back) times the rate', () => {
    expect(DEFAULT_MILEAGE_RATE).toBe(0.26)
    expect(mileageAmount(9.5, 0.26, true)).toBe(4.94)
    expect(mileageAmount(62, 0.26)).toBe(16.12)
    expect(tripKm({ km: 62, return_trip: true })).toBe(124)
    expect(tripKm({ km: null, return_trip: false })).toBe(0)
  })

  it('what waits on an admin, what’s owed back, and what was paid back and driven since a day', () => {
    const c = (status: 'submitted' | 'approved' | 'rejected' | 'paid', amount: number, extra: object = {}) =>
      ({ status, amount, paid_on: null, spent_on: '2026-09-20', kind: 'expense' as const, km: null, return_trip: false, ...extra })
    expect(claimTotals([
      c('submitted', 4.94, { kind: 'mileage', km: 9.5, return_trip: true }), c('submitted', 10), c('approved', 6),
      c('paid', 8.4, { paid_on: '2026-09-28' }), c('paid', 50, { paid_on: '2026-08-31' }),
      c('rejected', 23.5, { kind: 'mileage', km: 100 }), c('paid', 16.12, { kind: 'mileage', km: 62, spent_on: '2026-08-30', paid_on: '2026-09-02' }),
    ], '2026-09-01')).toEqual({ toApprove: 14.94, toPayBack: 6, paidSince: 24.52, km: 19 })
  })
})
