// What kind of business it is, read from what it says it is (business.business_type: set at sign-up
// from the kind picked, "Café", "Salon & beauty"…, and editable on Business). Competitors uses it for
// the places around it worth following: other cafés for a café, other salons for a salon.
import { msg } from './i18n.ts'

export type BusinessKindGroup = 'cafe' | 'restaurant' | 'pub' | 'salon' | 'real_estate' | 'other'

export function kindOfBusiness(businessType: string | null | undefined): BusinessKindGroup {
  const type = (businessType ?? '').toLowerCase()
  if (/caf|coffee|tea\b|bakery|panader|cafeter/.test(type)) return 'cafe'
  if (/\bpub\b|tavern|taberna/.test(type)) return 'pub'
  if (/restaurant|\bbar\b|bistro|tapas|kitchen|cocina/.test(type)) return 'restaurant'
  if (/salon|salón|beauty|hair|nail|barber|peluquer|estética|spa\b/.test(type)) return 'salon'
  if (/real estate|estate agen|inmobiliaria|property|letting/.test(type)) return 'real_estate'
  return 'other'
}

/** "Follow {places} around you": the places like this business, article included (Spanish needs it). */
export const RIVALS: Record<BusinessKindGroup, string> = {
  cafe: msg('the cafés'),
  restaurant: msg('the restaurants and bars'),
  pub: msg('the pubs'),
  salon: msg('the salons'),
  real_estate: msg('the estate agencies'),
  other: msg('the businesses'),
}

/**
 * Google's place types for the places around it (Places API, table A), widest first, then the few
 * Google has always had, asked instead should it stop knowing one. A business of another kind looks
 * for its own place's type on Google, when it has one; failing that, cafés, as before.
 */
export const NEARBY_TYPES: Record<Exclude<BusinessKindGroup, 'other'>, { types: string[]; core: string[] }> = {
  cafe: { types: ['cafe', 'coffee_shop', 'bakery', 'breakfast_restaurant', 'brunch_restaurant', 'juice_shop', 'tea_house', 'cafeteria'], core: ['cafe', 'coffee_shop', 'bakery'] },
  restaurant: { types: ['restaurant', 'bar', 'wine_bar', 'bar_and_grill', 'pub'], core: ['restaurant', 'bar'] },
  pub: { types: ['pub', 'bar', 'wine_bar', 'bar_and_grill'], core: ['bar'] },
  salon: { types: ['beauty_salon', 'hair_salon', 'hair_care', 'nail_salon', 'barber_shop', 'spa'], core: ['beauty_salon', 'hair_care'] },
  real_estate: { types: ['real_estate_agency'], core: ['real_estate_agency'] },
}

export function nearbyTypes(kind: BusinessKindGroup, ownType?: string | null): { types: string[]; core: string[] } {
  if (kind !== 'other') return NEARBY_TYPES[kind]
  return ownType ? { types: [ownType], core: [ownType] } : NEARBY_TYPES.cafe
}
