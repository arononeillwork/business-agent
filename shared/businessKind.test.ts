import { describe, expect, it } from 'vitest'
import { kindOfBusiness, nearbyTypes, RIVALS } from './businessKind'

describe('kindOfBusiness', () => {
  it('reads the kind from what the business says it is, in English or Spanish', () => {
    expect(['Café', 'Specialty café, drinks-first, owner-run', 'Cafetería', 'Panadería'].map(kindOfBusiness)).toEqual(['cafe', 'cafe', 'cafe', 'cafe'])
    expect(['Restaurant & bar', 'Tapas bar'].map(kindOfBusiness)).toEqual(['restaurant', 'restaurant'])
    expect(['Pub', 'Irish pub'].map(kindOfBusiness)).toEqual(['pub', 'pub'])
    expect(['Salon & beauty', 'Peluquería', 'Barber shop'].map(kindOfBusiness)).toEqual(['salon', 'salon', 'salon'])
    expect(['Real estate agency', 'Inmobiliaria'].map(kindOfBusiness)).toEqual(['real_estate', 'real_estate'])
    expect([null, '', 'Bike repairs'].map(kindOfBusiness)).toEqual(['other', 'other', 'other'])
  })
})

describe('nearbyTypes', () => {
  it('cafés around a café, salons around a salon; another kind looks for its own Google type, or cafés', () => {
    expect(nearbyTypes('cafe').types).toContain('coffee_shop')
    expect(nearbyTypes('salon').types).not.toContain('cafe')
    expect(nearbyTypes('other', 'bicycle_store')).toEqual({ types: ['bicycle_store'], core: ['bicycle_store'] })
    expect(nearbyTypes('other', null)).toEqual(nearbyTypes('cafe'))
  })

  it('every kind has words for its places', () => {
    expect(Object.keys(RIVALS).sort()).toEqual(['cafe', 'other', 'pub', 'real_estate', 'restaurant', 'salon'])
  })
})
