import { describe, expect, it } from 'vitest'
import {
  adjustProblem, giftCardAmountProblem, giftCardMatches, giftCardStatus, giftCardTotals, last4, loyaltyByDay, loyaltyTotals, sortGiftCards, stampCard, stampsOf,
  type GiftCard, type LoyaltyProgram, type LoyaltyState,
} from './loyalty'

const stamps: LoyaltyProgram = { one: 'Stamp', other: 'Stamps', per_visit: 1, minimum_spend: null, per_spend: null,
  tiers: [{ id: 'b', name: 'Free cake', points: 15 }, { id: 'a', name: 'Free coffee', points: 9 }] }
const points: LoyaltyProgram = { ...stamps, one: 'Bean', other: 'Beans', per_visit: null, per_spend: { points: 1, amount: 1 } }

describe('loyalty', () => {
  it('a programme with points per visit is a stamp card, filled at its first reward', () => {
    expect(stampCard(stamps)).toEqual({ per_visit: 1, size: 9, reward: 'Free coffee' })
    expect(stampCard({ ...stamps, per_visit: 2, tiers: [{ id: 'a', name: 'Free coffee', points: 20 }] })).toMatchObject({ size: 10 })
    expect(stampCard(points)).toBeNull()
    expect(stampCard(null)).toBeNull()
  })

  it('stamps on a card now, and the rewards a full card already holds', () => {
    expect(stampsOf(7, stamps)).toEqual({ stamps: 7, rewards: 0, size: 9 })
    expect(stampsOf(11, stamps)).toEqual({ stamps: 2, rewards: 1, size: 9 })
    expect(stampsOf(-2, stamps)).toEqual({ stamps: 0, rewards: 0, size: 9 })
    expect(stampsOf(40, points)).toBeNull()
  })

  it('totals: members, points outstanding, this month’s points earned and rewards redeemed', () => {
    const s: LoyaltyState = { status: 'ok', program: stamps, members: [
      { id: '1', customer_id: null, name: null, balance: 7, lifetime: 20, enrolled_at: null, last_visit: null },
      { id: '2', customer_id: null, name: null, balance: -1, lifetime: 2, enrolled_at: null, last_visit: null },
    ], events: [
      { id: 'a', kind: 'earn', points: 1, at: '2026-09-28T08:00:00Z', account_id: '1' },
      { id: 'b', kind: 'earn', points: 1, at: '2026-08-28T08:00:00Z', account_id: '1' },
      { id: 'c', kind: 'redeem', points: 0, at: '2026-09-10T08:00:00Z', account_id: '1' },
    ] }
    expect(loyaltyTotals(s, '2026-09')).toEqual({ members: 2, outstanding: 7, earned_this_month: 1, redeemed_this_month: 1 })
    expect(loyaltyByDay(s.events, '2026-09-27', '2026-09-29')).toEqual([
      { date: '2026-09-27', earned: 0, redeemed: 0 }, { date: '2026-09-28', earned: 1, redeemed: 0 }, { date: '2026-09-29', earned: 0, redeemed: 0 }])
  })
})

describe('gift cards', () => {
  it('only the last 4 digits of a card number', () => {
    expect(last4('7783 3200 0123 4567')).toBe('4567')
    expect(last4(undefined)).toBe('')
  })

  const card = (c: Partial<GiftCard> & Pick<GiftCard, 'id' | 'last4' | 'state' | 'balance'>): GiftCard =>
    ({ type: 'DIGITAL', created_at: '', customer_id: null, customer: null, original: null, last_used: null, ...c })

  it('what’s owed on live cards, what was sold this month, and how many were used up this month', () => {
    const g = { status: 'ok' as const, currency: 'EUR', cards: [
      card({ id: '1', last4: '1111', state: 'ACTIVE', balance: 20.5 }),
      card({ id: '2', last4: '2222', state: 'DEACTIVATED', balance: 10 }),
      card({ id: '3', last4: '3333', state: 'ACTIVE', balance: 0, last_used: '2026-09-21T10:00:00Z' }),
      card({ id: '4', last4: '4444', state: 'ACTIVE', balance: 0, last_used: '2026-08-21T10:00:00Z' }),
      card({ id: '5', last4: '5555', state: 'PENDING', balance: 0 }),
    ], activities: [
      { id: 'a', kind: 'activate' as const, amount: 25, at: '2026-09-02T10:00:00Z', last4: '1111', balance: 25 },
      { id: 'b', kind: 'redeem' as const, amount: 4.5, at: '2026-09-03T10:00:00Z', last4: '1111', balance: 20.5 },
      { id: 'c', kind: 'load' as const, amount: 10, at: '2026-08-03T10:00:00Z', last4: '2222', balance: 10 },
    ] }
    expect(giftCardTotals(g, '2026-09')).toEqual({ active: 3, available: 1, outstanding: 20.5, sold_this_month: 25, used_up_this_month: 1 })
  })

  it('where each card stands: can be spent, used up, not activated yet, or switched off', () => {
    expect(giftCardStatus({ state: 'ACTIVE', balance: 0.5 })).toBe('available')
    expect(giftCardStatus({ state: 'ACTIVE', balance: 0 })).toBe('used_up')
    expect(giftCardStatus({ state: 'PENDING', balance: 0 })).toBe('not_activated')
    expect(giftCardStatus({ state: 'DEACTIVATED', balance: 12 })).toBe('deactivated')
    expect(giftCardStatus({ state: 'BLOCKED', balance: 12 })).toBe('deactivated')
  })

  it('found by some of its last digits, or by its whole number as printed', () => {
    const c = { last4: '4567' }
    expect(giftCardMatches(c, '')).toBe(true)
    expect(giftCardMatches(c, '56')).toBe(true)
    expect(giftCardMatches(c, '•••• 4567')).toBe(true)
    expect(giftCardMatches(c, '7783 3200 0123 4567')).toBe(true)
    expect(giftCardMatches(c, '7783 3200 0123 4568')).toBe(false)
    expect(giftCardMatches(c, '99')).toBe(false)
    expect(giftCardMatches(c, 'Lucía')).toBe(false)
  })

  it('sorted by money left, newest, or last used (never used last)', () => {
    const cards = [
      card({ id: 'a', last4: '1', state: 'ACTIVE', balance: 10, created_at: '2026-09-01', last_used: null }),
      card({ id: 'b', last4: '2', state: 'ACTIVE', balance: 40, created_at: '2026-08-01', last_used: '2026-09-10' }),
      card({ id: 'c', last4: '3', state: 'ACTIVE', balance: 25, created_at: '2026-09-20', last_used: '2026-09-25' }),
    ]
    expect(sortGiftCards(cards, 'balance').map(c => c.id)).toEqual(['b', 'c', 'a'])
    expect(sortGiftCards(cards, 'newest').map(c => c.id)).toEqual(['c', 'a', 'b'])
    expect(sortGiftCards(cards, 'last_used').map(c => c.id)).toEqual(['c', 'b', 'a'])
  })

  it('amounts and adjustments the app will make', () => {
    expect(giftCardAmountProblem(25)).toBeNull()
    expect(giftCardAmountProblem(10.1)).toBeNull()
    expect(giftCardAmountProblem(4)).toBe('Gift cards start at €5')
    expect(giftCardAmountProblem(1500)).toBe('Gift cards go up to €1,000')
    expect(giftCardAmountProblem(10.555)).toBe('Use euros and cents')
    expect(adjustProblem(3)).toBeNull()
    expect(adjustProblem(-2)).toBeNull()
    expect(adjustProblem(1.5)).toBe('Give a whole number of points, not zero')
  })
})
