import { describe, expect, it } from 'vitest'
import { EVERYONE, audienceOf, personalise, smsParts } from './campaigns'
import type { Customer } from './types'

const person = (p: Partial<Customer>) => ({ kind: 'customer' as const, tags: [] as string[], source: 'walk_in' as const, marketing_consent: true,
  email: 'a@example.com', phone: '+34 600 000 000', ...p })

describe('campaigns', () => {
  it('only people who said yes to marketing, reachable on the channel, matching the audience', () => {
    const people = [
      person({ email: 'lucia@example.com', tags: ['regular'] }),
      person({ email: 'no@example.com', tags: ['regular'], marketing_consent: false }),
      person({ email: null, tags: ['regular'] }),
      person({ kind: 'lead', tags: ['B2B'], source: 'event' }),
      person({ phone: null, source: 'instagram' }),
    ]
    expect(audienceOf(people, EVERYONE, 'email')).toHaveLength(3)
    expect(audienceOf(people, EVERYONE, 'sms')).toHaveLength(3)
    expect(audienceOf(people, { kinds: ['customer'], tags: ['regular'], sources: [] }, 'email').map(p => p.email)).toEqual(['lucia@example.com'])
    expect(audienceOf(people, { kinds: [], tags: [], sources: ['event', 'instagram'] }, 'email')).toHaveLength(2)
    expect(audienceOf(people, { kinds: ['lead'], tags: ['regular'], sources: [] }, 'email')).toHaveLength(0)
  })

  it('each person’s first name in the message, or none, tidily', () => {
    expect(personalise('Hi [first name], oat milk is on us', 'Lucía')).toBe('Hi Lucía, oat milk is on us')
    expect(personalise('Hi [first name], oat milk is on us', null)).toBe('Hi, oat milk is on us')
  })

  it('texts: 160 plain characters in one, 153 each after; 70 and 67 with an emoji', () => {
    expect(smsParts('')).toBe(0)
    expect(smsParts('a'.repeat(160))).toBe(1)
    expect(smsParts('a'.repeat(161))).toBe(2)
    expect(smsParts('a'.repeat(306))).toBe(2)
    expect(smsParts('€'.repeat(80))).toBe(1) // the euro sign takes two
    expect(smsParts('€'.repeat(81))).toBe(2)
    expect(smsParts('☕'.repeat(70))).toBe(1)
    expect(smsParts('☕'.repeat(71))).toBe(2)
  })
})
