import { describe, expect, it } from 'vitest'
import { endFor, lengthOf, liveOffers, newOffer, nextChange, offerDays, offerProblem, offerState, withOffers, type ScreenOffer } from './offers'

const TZ = 'Europe/Madrid'
const offer = (p: Partial<ScreenOffer>): ScreenOffer => ({ id: 'o', title: 'Pumpkin spice latte', details: null, price: '€3.80', was_price: null, image_url: null,
  starts_at: '2026-10-30T14:00:00Z', ends_at: '2026-10-30T17:00:00Z', screen_mode: 'turns', seconds: 15, ...p })
const at = (iso: string) => Date.parse(iso)

describe('offers', () => {
  it('works out when an offer ends from how long it runs', () => {
    const starts = '2026-10-30T14:00:00Z' // 15:00 in Madrid
    expect(endFor(starts, '2h', TZ)).toBe('2026-10-30T16:00:00.000Z')
    expect(endFor(starts, '24h', TZ)).toBe('2026-10-31T14:00:00.000Z')
    expect(endFor(starts, '7d', TZ)).toBe('2026-11-06T14:00:00.000Z')
    // The end of the day is 23:59 there (Madrid is an hour ahead of UTC in October, after the clocks change).
    expect(endFor(starts, 'today', TZ)).toBe('2026-10-30T22:59:00.000Z')
    expect(lengthOf(starts, '2026-10-30T16:00:00.000Z', TZ)).toBe('2h')
    expect(lengthOf(starts, '2026-10-30T22:59:00Z', TZ)).toBe('today')
    expect(lengthOf(starts, '2026-10-30T16:30:00Z', TZ)).toBe('custom')
  })

  it('starts a new offer at the next quarter of an hour, for two hours', () => {
    const o = newOffer(at('2026-10-30T14:07:30Z'))
    expect(o.starts_at).toBe('2026-10-30T14:15:00.000Z')
    expect(o.ends_at).toBe('2026-10-30T16:15:00.000Z')
    expect(o).toMatchObject({ screen_mode: 'turns', seconds: 15, active: true, screen_ids: [] })
  })

  it('says what stops an offer being saved', () => {
    const ok = { ...newOffer(at('2026-10-30T14:00:00Z')), title: 'Happy hour' }
    expect(offerProblem(ok)).toBeNull()
    expect(offerProblem({ ...ok, title: '  ' })).toBe('Give the offer a name')
    expect(offerProblem({ ...ok, ends_at: ok.starts_at })).toBe('The offer has to end after it starts')
    expect(offerProblem({ ...ok, ends_at: '2027-03-01T00:00:00Z' })).toBe('An offer can run for up to three months')
    expect(offerProblem({ ...ok, image_url: 'http://x.es/a.jpg' })).toMatch(/https:\/\//)
    expect(offerProblem({ ...ok, image_url: 'https://x.es/a.jpg' })).toBeNull()
    expect(offerProblem({ ...ok, seconds: 2 })).toMatch(/3 seconds/)
  })

  it('knows whether an offer is coming up, on now, ended or switched off', () => {
    const o = { ...offer({}), active: true }
    expect(offerState(o, at('2026-10-30T13:59:59Z'))).toBe('coming')
    expect(offerState(o, at('2026-10-30T14:00:00Z'))).toBe('on')
    expect(offerState(o, at('2026-10-30T16:59:59Z'))).toBe('on')
    expect(offerState(o, at('2026-10-30T17:00:00Z'))).toBe('ended')
    expect(offerState({ ...o, active: false }, at('2026-10-30T15:00:00Z'))).toBe('off')
  })

  it('puts offers on a screen for exactly their time, and says when the next change is', () => {
    const a = offer({ id: 'a' }), b = offer({ id: 'b', starts_at: '2026-10-30T16:00:00Z', ends_at: '2026-10-30T18:00:00Z' })
    expect(liveOffers([b, a], at('2026-10-30T13:00:00Z'))).toEqual([])
    expect(liveOffers([b, a], at('2026-10-30T16:30:00Z')).map(o => o.id)).toEqual(['a', 'b'])
    expect(liveOffers([b, a], at('2026-10-30T17:00:00Z')).map(o => o.id)).toEqual(['b'])
    expect(nextChange([a, b], at('2026-10-30T13:00:00Z'))).toBe(at('2026-10-30T14:00:00Z'))
    expect(nextChange([a, b], at('2026-10-30T14:00:00Z'))).toBe(at('2026-10-30T16:00:00Z'))
    expect(nextChange([a, b], at('2026-10-30T16:30:00Z'))).toBe(at('2026-10-30T17:00:00Z'))
    expect(nextChange([a, b], at('2026-10-30T18:00:00Z'))).toBeNull()
  })

  it('plays offers first each time round, or on their own when they take the screen', () => {
    const slides = [{ id: 'menu' }, { id: 'photo' }]
    expect(withOffers(slides, [])).toEqual(slides)
    const inTurn = withOffers(slides, [offer({ id: 'a', seconds: 20 })])
    expect(inTurn.map(s => s.id)).toEqual(['offer-a', 'menu', 'photo'])
    expect(inTurn[0]).toMatchObject({ kind: 'offer', seconds: 20, title: 'Pumpkin spice latte' })
    const alone = withOffers(slides, [offer({ id: 'a' }), offer({ id: 'b', screen_mode: 'only' })])
    expect(alone.map(s => s.id)).toEqual(['offer-b'])
  })

  it('finds the days an offer runs on, there', () => {
    expect(offerDays(offer({}), TZ)).toEqual({ first: '2026-10-30', last: '2026-10-30' })
    // Ending at midnight there is the day before's.
    expect(offerDays(offer({ ends_at: '2026-10-31T23:00:00Z' }), TZ)).toEqual({ first: '2026-10-30', last: '2026-10-31' })
  })
})
