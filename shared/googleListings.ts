// Google Maps listings: telling the café's own from a duplicate when one Google account manages several
// (Connections → Google Maps). What Google says of each comes from Business Information (worker/providers/google.ts).
import type { GoogleListing } from './types'

/** The same listing, however it's written: "locations/123" and "accounts/9/locations/123". */
export const sameListing = (a: string, b: string) => a.split('/').pop() === b.split('/').pop()

/**
 * The listing that's most likely the café's when the account manages several: the only one Google says is
 * verified for the owner, not closed for good and not a duplicate of another. None when that isn't exactly one.
 */
export function likelyListing(listings: GoogleListing[]): GoogleListing | null {
  const good = listings.filter(l => l.verified && !l.duplicate_of && l.closed !== 'permanently')
  return good.length === 1 ? good[0] : null
}
