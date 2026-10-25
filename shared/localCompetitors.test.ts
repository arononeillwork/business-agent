import { describe, expect, it } from 'vitest'
import {
  BASKET, FEATURES, analyse, compareHours, distanceM, featureMatrix, featuresFromGoogle, hoursFromGoogle, insightText, insights, kindFromGoogle,
  matchRecipe, priceBoard, priceChanges, priceHistory, priceIndex, priceLevelFromGoogle, ourPrices, ratingRows, suggestedThreat, walkMinutes,
  type Competitor, type CompetitorData, type CompetitorPrice, type PriceItem,
} from './localCompetitors'
import type { OpeningHours } from './types'

const place = (p: Partial<Competitor> & { id: string; name: string }): Competitor => ({
  is_self: false, kind: 'cafe', threat: 'medium', address: null, distance_m: null, lat: null, lng: null, place_id: null, website: null,
  instagram: null, maps_url: null, price_level: null, hours: null, google_hours: null, features: {}, google_features: {}, google_rating: null,
  google_count: null, google_status: null, google_checked_at: null, strengths: null, weaknesses: null, notes: null, active: true, ...p,
})
let n = 0
const price = (competitor_id: string, item_id: string, value: number, observed_on: string): CompetitorPrice =>
  ({ id: `p${n++}`, competitor_id, item_id, price: value, observed_on, source: 'visit', note: null })
const item = (id: string, name: string, sort: number, recipe_id: string | null = null): PriceItem => ({ id, name, sort, recipe_id })
const week = (open: string, close: string, sunday: { open: string; close: string } | null = null): OpeningHours =>
  ({ mon: { open, close }, tue: { open, close }, wed: { open, close }, thu: { open, close }, fri: { open, close }, sat: { open, close }, sun: sunday })

describe('competitors: from Google', () => {
  it('reads what a place offers from its details, an admin’s answer winning, and leaves out what Google doesn’t say', () => {
    const f = featuresFromGoogle({ outdoorSeating: true, allowsDogs: false, servesBeer: false, servesWine: true, takeout: true,
      paymentOptions: { acceptsCreditCards: false, acceptsNfc: true }, parkingOptions: { freeStreetParking: false } })
    expect(f).toEqual({ terrace: true, dogs: false, alcohol: true, takeaway: true, cards: true, parking: false })
    expect(f).not.toHaveProperty('vegetarian')
    const keys = FEATURES.map(x => x.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('turns Google’s periods into a day each: a lunch break bridged, past midnight closing at 23:59', () => {
    const h = hoursFromGoogle([
      { open: { day: 1, hour: 8 }, close: { day: 1, hour: 14 } }, { open: { day: 1, hour: 17, minute: 30 }, close: { day: 1, hour: 21 } },
      { open: { day: 5, hour: 7, minute: 30 }, close: { day: 6, hour: 1 } },
      { open: { day: 0, hour: 9 }, close: { day: 0, hour: 15 } },
    ])!
    expect(h.mon).toEqual({ open: '08:00', close: '21:00' })
    expect(h.fri).toEqual({ open: '07:30', close: '23:59' })
    expect(h.sun).toEqual({ open: '09:00', close: '15:00' })
    expect(h.tue).toBeNull()
    expect(hoursFromGoogle([{ open: { day: 0, hour: 0, minute: 0 } }])!.wed).toEqual({ open: '00:00', close: '23:59' }) // always open
    expect(hoursFromGoogle(undefined)).toBeNull()
  })

  it('price level, kind, distance and a first guess at how much it competes', () => {
    expect(priceLevelFromGoogle('PRICE_LEVEL_MODERATE')).toBe(2)
    expect(priceLevelFromGoogle('PRICE_LEVEL_UNSPECIFIED')).toBeNull()
    expect(kindFromGoogle('coffee_shop')).toBe('cafe')
    expect(kindFromGoogle('brunch_restaurant')).toBe('brunch')
    expect(kindFromGoogle('bakery')).toBe('bakery')
    expect(kindFromGoogle('wine_bar')).toBe('cafe_bar')
    expect(kindFromGoogle('juice_shop')).toBe('juice')
    expect(kindFromGoogle('barber_shop')).toBe('other')
    // Calle Pizarro to the Plaza de la Iglesia in San Pedro: about 300 m.
    const d = distanceM({ lat: 36.4867, lng: -4.9918 }, { lat: 36.4885, lng: -4.9944 })
    expect(d).toBeGreaterThan(280)
    expect(d).toBeLessThan(330)
    expect(walkMinutes(d)).toBe(4)
    expect(suggestedThreat('cafe', 300)).toBe('high')
    expect(suggestedThreat('cafe', 1200)).toBe('medium')
    expect(suggestedThreat('cafe_bar', 300)).toBe('medium')
    expect(suggestedThreat('cafe_bar', 1200)).toBe('low')
    expect(suggestedThreat('specialty', null)).toBe('low')
  })
})

describe('competitors: prices', () => {
  const items = [item('fw', 'Flat white', 2, 'r-fw'), item('esp', 'Espresso', 1), item('cro', 'Croissant', 3, 'r-cro')]
  const prices = [
    price('a', 'fw', 2.8, '2026-05-10'), price('a', 'fw', 3, '2026-09-01'), price('b', 'fw', 2.6, '2026-08-20'), price('c', 'fw', 3.4, '2025-12-01'),
    price('a', 'esp', 1.5, '2026-09-01'), price('b', 'esp', 1.3, '2026-08-20'), price('me', 'esp', 1.6, '2026-09-15'),
    price('a', 'cro', 2, '2026-09-01'), price('b', 'cro', 2.2, '2026-07-01'), price('b', 'cro', 2.2, '2026-08-20'),
  ]
  const recipes = [{ id: 'r-fw', sell_price: 3.2 }, { id: 'r-cro', sell_price: 1.8 }]
  const history = priceHistory(prices)
  const ours = ourPrices(items, recipes, history, 'me')
  const rows = priceBoard(items, [{ id: 'a' }, { id: 'b' }, { id: 'c' }], history, ours, '2026-09-30')

  it('yours from Menu costing when linked, else typed in here', () => {
    expect(ours.get('fw')).toEqual({ price: 3.2, from: 'menu' })
    expect(ours.get('esp')).toEqual({ price: 1.6, from: 'typed' })
  })

  it('each place’s latest price, the range and average, where yours sits, and old prices shaded', () => {
    expect(rows.map(r => r.item.name)).toEqual(['Espresso', 'Flat white', 'Croissant'])
    const fw = rows[1]
    expect(fw.cells.a).toMatchObject({ price: 3, previous: 2.8, stale: false })
    expect(fw.cells.c.stale).toBe(true) // ten months old
    expect([fw.n, fw.min, fw.max, fw.avg]).toEqual([3, 2.6, 3.4, 3])
    expect(fw.vsAvg).toBeCloseTo(0.0667, 3)
    expect([fw.cheaper, fw.dearer]).toEqual([2, 1])
  })

  it('like for like against the area: 100 is the average', () => {
    // Espresso 1.6 / 1.4, flat white 3.2 / 3, croissant 1.8 / 2.1.
    expect(priceIndex(rows, r => r.ours?.price)).toEqual({ index: Math.round(((1.6 / 1.4 + 3.2 / 3 + 1.8 / 2.1) / 3) * 100), items: 3 })
    expect(priceIndex(rows, r => r.cells.c?.price)).toEqual({ index: 113, items: 1 })
    expect(priceIndex([], () => 1)).toEqual({ index: null, items: 0 })
  })

  it('what moved in the last 90 days: changes only, not the same price seen again, nor your own', () => {
    expect(priceChanges(history, new Set(['a', 'b', 'c']), '2026-09-30')).toEqual([{ competitor_id: 'a', item_id: 'fw', from: 2.8, to: 3, on: '2026-09-01' }])
    expect(priceChanges(history, new Set(['a', 'b', 'c']), '2026-09-30', 30)).toHaveLength(1)
    expect(priceChanges(history, new Set(['a', 'b', 'c']), '2026-12-31')).toHaveLength(0)
  })

  it('matches basket items to the menu only when there’s no doubt', () => {
    const menu = [{ id: '1', name: 'Flat white' }, { id: '2', name: 'Iced matcha latte' }, { id: '3', name: 'Chai latte' }, { id: '4', name: 'Caramel latte' },
      { id: '5', name: 'Cafe con leche' }, { id: '6', name: 'Old croissant', active: false }]
    expect(matchRecipe('flat  white', menu)?.id).toBe('1')
    expect(matchRecipe('Matcha latte', menu)?.id).toBe('2')
    expect(matchRecipe('Café con leche', menu)?.id).toBe('5') // accents aside
    expect(matchRecipe('Latte', menu)).toBeNull() // three lattes
    expect(matchRecipe('Croissant', menu)).toBeNull() // off the menu
    expect(new Set(BASKET).size).toBe(BASKET.length)
  })
})

describe('competitors: what they offer, Google and hours', () => {
  const self = place({ id: 'me', name: 'Easy Beans', is_self: true, threat: null, features: { matcha: true, terrace: true, breakfast: false, specialty: true } })
  const a = place({ id: 'a', name: 'Molino', features: { matcha: true }, google_features: { terrace: true, breakfast: true, sports_tv: true } })
  const b = place({ id: 'b', name: 'La Plaza', google_features: { terrace: true, breakfast: true, matcha: false, specialty: false, sports_tv: true } })
  const c = place({ id: 'c', name: 'Horno', features: { breakfast: true, terrace: false, specialty: false }, google_features: { terrace: true, sports_tv: false } })

  it('gaps (most offer it, you don’t), edges (only you, or you and one other) and what you all share', () => {
    const rows = featureMatrix([a, b, c], self)
    const verdict = (k: string) => rows.find(r => r.feature.key === k)!
    expect(verdict('breakfast')).toMatchObject({ verdict: 'gap', have: ['a', 'b', 'c'], ours: false })
    expect(verdict('terrace')).toMatchObject({ verdict: 'shared', have: ['a', 'b'], lack: ['c'] }) // the admin's "no" wins over Google
    expect(verdict('matcha')).toMatchObject({ verdict: 'edge', have: ['a'], lack: ['b'] })
    expect(verdict('specialty')).toMatchObject({ verdict: 'edge', have: [], lack: ['b', 'c'] })
    expect(verdict('sports_tv')).toMatchObject({ verdict: 'gap', ours: null })
    expect(verdict('vegan').verdict).toBeNull()
  })

  it('ratings in order, with reviews a month and the change from the weekly snapshots', () => {
    const rows = ratingRows([
      { ...self, google_rating: 4.8, google_count: 60 }, { ...a, google_rating: 4.6, google_count: 412 }, { ...b, google_rating: 4.6, google_count: 90 }, c,
    ], [
      { competitor_id: 'a', taken_on: '2026-05-01', rating: 4.7, review_count: 300 }, // over four months ago: not used
      { competitor_id: 'a', taken_on: '2026-07-02', rating: 4.7, review_count: 352 },
      { competitor_id: 'a', taken_on: '2026-09-30', rating: 4.6, review_count: 412 },
      { competitor_id: 'me', taken_on: '2026-09-20', rating: 4.8, review_count: 58 },
      { competitor_id: 'me', taken_on: '2026-09-30', rating: 4.8, review_count: 60 }, // ten days apart: too short
    ], '2026-09-30')
    expect(rows.map(r => r.competitor.id)).toEqual(['me', 'a', 'b', 'c'])
    expect(rows[1]).toMatchObject({ perMonth: 20, change: -0.1 }) // 60 reviews in 90 days
    expect(rows[0].perMonth).toBeNull()
    expect(rows[3]).toMatchObject({ rating: null, perMonth: null })
  })

  it('who opens before you, closes after you, and opens on Sundays', () => {
    const h = compareHours(week('08:00', '18:00', { open: '09:00', close: '16:00' }),
      [week('07:00', '22:00'), week('07:30', '14:00', { open: '08:00', close: '13:00' }), week('09:00', '17:00'), null])!
    expect(h).toEqual({ known: 3, ours: { open: '08:00', close: '18:00' }, earlier: { n: 2, time: '07:00' }, later: { n: 1, time: '22:00' }, sunday: { n: 1, ours: true } })
    expect(compareHours(null, [week('07:00', '22:00')])).toBeNull()
  })
})

describe('competitors: the analysis in plain words', () => {
  const data: CompetitorData = {
    competitors: [
      place({ id: 'me', name: 'Easy Beans', is_self: true, threat: null, google_rating: 4.8, google_count: 64, features: { matcha: true, specialty: true, breakfast: false } }),
      place({ id: 'a', name: 'Molino Coffee Lab', google_rating: 4.9, google_count: 410, features: { specialty: true }, google_features: { breakfast: true, matcha: false },
        google_hours: week('07:30', '19:00') }),
      place({ id: 'b', name: 'Café Bar La Plaza', google_rating: 4.3, google_count: 800, google_features: { breakfast: true, matcha: false, specialty: false }, google_hours: week('07:00', '22:00', { open: '08:00', close: '22:00' }) }),
      place({ id: 'c', name: 'Gone', active: false, google_rating: 5 }),
    ],
    items: [item('fw', 'Flat white', 1, 'r-fw'), item('esp', 'Espresso', 2, 'r-esp')],
    prices: [price('a', 'fw', 3, '2026-09-01'), price('b', 'fw', 2.2, '2026-09-01'), price('b', 'fw', 2, '2026-06-01'),
      price('a', 'esp', 1.6, '2026-09-01'), price('b', 'esp', 1.2, '2026-09-01')],
    notes: [], snapshots: [],
    nearby: [
      { place_id: 'x', name: 'Old Bar', address: null, distance_m: 200, rating: 4, review_count: 30, price_level: 1, primary_type: 'bar', maps_url: null, first_seen: '2026-07-01T10:00:00Z', dismissed: false },
      { place_id: 'y', name: 'Nuevo Café', address: null, distance_m: 150, rating: 5, review_count: 3, price_level: null, primary_type: 'cafe', maps_url: null, first_seen: '2026-09-23T10:00:00Z', dismissed: false },
      { place_id: 'z', name: 'Put aside', address: null, distance_m: 90, rating: null, review_count: null, price_level: null, primary_type: null, maps_url: null, first_seen: '2026-09-23T10:00:00Z', dismissed: true },
    ],
    settings: { radius_m: 1000, scanned_at: '2026-09-23T10:00:00Z', scan_weekly: true },
  }
  const a = analyse(data, [{ id: 'r-fw', sell_price: 3.2 }, { id: 'r-esp', sell_price: 1.5 }], week('08:00', '18:00', { open: '09:00', close: '16:00' }), '2026-09-30')
  const said = insights(a, { money: n => `€${n.toFixed(2)}`, rating: n => n.toFixed(1), label: s => s }).map(insightText)

  it('compares only the competitors still followed, and lists what Google found that isn’t', () => {
    expect(a.rivals.map(c => c.id)).toEqual(['a', 'b'])
    expect(a.ourIndex).toEqual({ index: Math.round(((3.2 / 2.6 + 1.5 / 1.4) / 2) * 100), items: 2 })
    expect(a.untracked.map(p => p.place_id)).toEqual(['x', 'y'])
    expect(a.newNearby.map(p => p.place_id)).toEqual(['y']) // the first look's places aren't "new"
  })

  it('says it in plain words', () => {
    expect(said).toEqual([
      'On 2 like-for-like items your prices are 15% above the area average.',
      'Flat white: you charge €3.20; nearby it’s €2.60 on average (€2.20–€3.00).',
      '1 price rise nearby in the last 90 days: Café Bar La Plaza’s Flat white, €2.00 → €2.20.',
      'Breakfast: 2 of 2 nearby offer it and you don’t.',
      'Matcha: only you offer it nearby. Make it known.',
      'Specialty coffee: only you and Molino Coffee Lab offer it nearby.',
      '2 of 2 open before you on weekdays (the earliest at 07:00); you open at 08:00.',
      '2 of 2 stay open after you close on weekdays (until 22:00); you close at 18:00.',
      '1 place rates higher than your 4.8★ on Google: Molino Coffee Lab.',
      'New on Google nearby: Nuevo Café.',
    ])
  })
})
