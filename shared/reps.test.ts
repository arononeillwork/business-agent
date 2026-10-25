import { describe, expect, it } from 'vitest'
import {
  REWARD_IDEAS, balanceOf, cleanInstagram, cleanRepCode, codeFor, leaderboard, limitReached, mentionsToReward, outstanding, rewardAmount, ruleFits,
  type RepReward, type SalesRep,
} from './reps'
import type { Mention } from './mentions'

const rep = (id: string, kind: SalesRep['kind'], more: Partial<SalesRep> = {}): SalesRep => ({ id, name: id, kind, profile_id: null, customer_id: null,
  code: id.toUpperCase(), instagram: null, phone: null, email: null, notes: null, active: true, created_at: '2026-09-01T10:00:00Z', ...more })
let n = 0
const reward = (rep_id: string, amount: number, more: Partial<RepReward> = {}): RepReward => ({ id: `r${++n}`, rep_id, kind: amount > 0 ? 'earn' : 'redeem',
  rule_id: 'story', label: 'Reposted our story', sale_amount: null, amount, status: 'approved', proof_url: null, mention_id: null, note: null,
  occurred_on: '2026-09-20', logged_by: null, created_at: '2026-09-20T10:00:00Z', ...more })

describe('sales reps and rewards', () => {
  it('customers earn credit rewards, reps commission ones; everyone both', () => {
    expect(ruleFits({ who: 'customers' }, 'customer')).toBe(true)
    expect(ruleFits({ who: 'customers' }, 'ambassador')).toBe(false)
    expect(ruleFits({ who: 'reps' }, 'team')).toBe(true)
    expect(ruleFits({ who: 'reps' }, 'customer')).toBe(false)
    expect(ruleFits({ who: 'everyone' }, 'customer')).toBe(true)
  })

  it('a reward is its amount, or its share of the sale (nothing without one)', () => {
    expect(rewardAmount({ basis: 'fixed', amount: 1 })).toBe(1)
    expect(rewardAmount({ basis: 'percent', amount: 10 }, 245.5)).toBe(24.55)
    expect(rewardAmount({ basis: 'percent', amount: 10 }, null)).toBe(0)
  })

  it('a balance is what’s approved: earned, less spent or paid out; waiting and turned-down rewards don’t count', () => {
    const rewards = [reward('lucia', 1), reward('lucia', 3), reward('lucia', -2.5), reward('lucia', 2, { status: 'pending' }),
      reward('lucia', 5, { status: 'rejected' }), reward('marco', 40), reward('marco', -40, { kind: 'payout' }), reward('ines', 9)]
    expect(balanceOf(rewards, 'lucia')).toBe(1.5)
    expect(balanceOf(rewards, 'marco')).toBe(0)
    const reps = [rep('lucia', 'customer'), rep('marco', 'ambassador'), rep('ines', 'ambassador'), rep('julio', 'team')]
    expect(outstanding(reps, rewards)).toEqual({ credit: 1.5, commission: 9 })
  })

  it('a monthly limit counts this month’s rewards of that kind, not turned-down ones', () => {
    const rule = { id: 'story', monthly_limit: 2 }
    const rewards = [reward('lucia', 1), reward('lucia', 1, { status: 'rejected' }), reward('lucia', 1, { occurred_on: '2026-08-31' })]
    expect(limitReached(rule, rewards, 'lucia', '2026-09-30')).toBe(false)
    expect(limitReached(rule, [...rewards, reward('lucia', 1, { status: 'pending' })], 'lucia', '2026-09-30')).toBe(true)
    expect(limitReached({ id: 'story', monthly_limit: null }, rewards, 'lucia', '2026-09-30')).toBe(false)
  })

  it('the month’s leaderboard: what each rep earned, approved or waiting, most first', () => {
    const reps = [rep('lucia', 'customer'), rep('marco', 'ambassador'), rep('ines', 'ambassador'), rep('julio', 'team')]
    const rewards = [reward('lucia', 1), reward('lucia', 1), reward('lucia', -2), reward('marco', 3), reward('marco', 45, { status: 'pending' }),
      reward('ines', 9), reward('ines', 50, { occurred_on: '2026-08-15' }), reward('julio', 3, { status: 'rejected' })]
    expect(leaderboard(reps, rewards, '2026-09').map(s => [s.rep.id, s.earned, s.rewards])).toEqual([['marco', 48, 2], ['ines', 9, 1], ['lucia', 2, 2]])
  })

  it('handles and codes are tidied, or turned down', () => {
    expect(cleanInstagram(' @Lucia.MBL ')).toBe('lucia.mbl')
    expect(cleanInstagram('not a handle')).toBeNull()
    expect(cleanRepCode(' lucia 27 ')).toBe('LUCIA27')
    expect(cleanRepCode('EB')).toBeNull()
    expect(cleanRepCode('LUCIA-27')).toBeNull()
  })

  it('a code comes from the first name, accents dropped, with two digits that aren’t taken', () => {
    const seq = [0.27, 0.27, 0.5]
    const random = () => seq.shift() ?? 0.99
    expect(codeFor('Lucía García', new Set(['LUCIA27']), random)).toBe('LUCIA50')
    expect(codeFor('  ', new Set(), () => 0.05)).toBe('EB05')
    expect(codeFor('Bartholomew', new Set(), () => 0.1)).toBe('BARTHO10')
  })

  it('stories about the café are matched to reps by their handle, and rewarded once', () => {
    const mention = (id: string, username: string | null): Mention => ({ id, kind: 'story', username, media_url: null, permalink: null, caption: null, mentioned_at: '2026-09-29T10:00:00Z' })
    const reps = [rep('eats', 'customer', { instagram: 'sanpedro.eats' }), rep('old', 'customer', { instagram: 'gone.away', active: false })]
    const out = mentionsToReward([mention('story:1', 'SanPedro.Eats'), mention('story:2', 'tom_runs'), mention('story:3', null),
      mention('story:4', 'sanpedro.eats'), mention('story:5', 'gone.away'), { ...mention('story:6', 'sanpedro.eats'), mentioned_at: '2026-09-20T10:00:00Z' }],
      reps, [reward('eats', 1, { mention_id: 'story:4' })], Date.parse('2026-09-30T09:00:00Z'))
    // A week old is too old; the rep who's no longer one isn't matched.
    expect(out.map(m => [m.mention.id, m.rep?.id ?? null])).toEqual([['story:1', 'eats'], ['story:2', null], ['story:5', null]])
  })

  it('the usual rewards: a story for customers counts at once; an event is a share of the sale and waits for an admin', () => {
    const story = REWARD_IDEAS.find(i => i.key === 'story')!
    expect([story.who, story.basis, story.needs_approval]).toEqual(['customers', 'fixed', false])
    const event = REWARD_IDEAS.find(i => i.key === 'event')!
    expect([event.who, event.basis, event.needs_approval]).toEqual(['reps', 'percent', true])
    expect(new Set(REWARD_IDEAS.map(i => i.key)).size).toBe(REWARD_IDEAS.length)
  })
})
