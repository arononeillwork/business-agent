import { describe, expect, it } from 'vitest'
import { likelyListing, sameListing } from './googleListings'

// Easy Beans' own two, as the Google account lists them (same café, same street, written two ways).
const typed = { name: 'locations/4539185446876349308', title: 'Easy Beans Coffee', address: 'Calle Pizarro, 8, San Pedro Alcántara' }
const maps = { name: 'locations/12223469214864747439', title: 'Easy Beans Coffee', address: 'C. Pizarro, 8, San Pedro Alcántara, Marbella' }

describe('likelyListing', () => {
  it('is the only verified one that isn’t a duplicate or closed for good', () => {
    expect(likelyListing([{ ...typed, verified: false }, { ...maps, verified: true }])).toEqual({ ...maps, verified: true })
    expect(likelyListing([{ ...typed, verified: true, duplicate_of: maps.name }, { ...maps, verified: true }])?.name).toBe(maps.name)
    expect(likelyListing([{ ...typed, verified: true, closed: 'permanently' }, { ...maps, verified: true }])?.name).toBe(maps.name)
  })

  it('says nothing when Google hasn’t been asked, or when both (or neither) look like the café’s', () => {
    expect(likelyListing([typed, maps])).toBeNull()
    expect(likelyListing([{ ...typed, verified: true }, { ...maps, verified: true }])).toBeNull()
    expect(likelyListing([{ ...typed, verified: false }, { ...maps, verified: false }])).toBeNull()
  })
})

describe('sameListing', () => {
  it('matches a listing however Google writes its name', () => {
    expect(sameListing('locations/123', 'accounts/9/locations/123')).toBe(true)
    expect(sameListing('locations/123', 'locations/124')).toBe(false)
  })
})
