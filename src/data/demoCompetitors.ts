// Sample competitors for the demo café: five places around San Pedro de Alcántara (made up, so no
// real business is shown with invented prices or ratings), what they've charged for the basket
// these last months, what they offer, their hours, their Google ratings week by week, notes from
// visits with ideas worth borrowing, and what Google lists nearby. Dates are relative to today.
import { addDays } from '../../shared/time'
import { BASKET, matchRecipe, type Competitor, type CompetitorData, type CompetitorKind, type NearbyPlace, type PriceSource } from '../../shared/localCompetitors'
import type { OpeningHours } from '../../shared/types'

/** Calle Pizarro, San Pedro de Alcántara. */
export const DEMO_CAFE_AT = { lat: 36.4867, lng: -4.9918 }

const week = (open: string, close: string, sat: [string, string] | null = [open, close], sun: [string, string] | null = sat): OpeningHours => ({
  mon: { open, close }, tue: { open, close }, wed: { open, close }, thu: { open, close }, fri: { open, close },
  sat: sat && { open: sat[0], close: sat[1] }, sun: sun && { open: sun[0], close: sun[1] },
})

/** A place Google "knows" in the demo: what a search or a look around shows, and what following it fills in. */
export interface DemoPlace extends Omit<NearbyPlace, 'first_seen' | 'dismissed'> {
  kind: CompetitorKind
  lat: number
  lng: number
  website: string | null
  features: Record<string, boolean>
  hours: OpeningHours | null
  /** Days ago Google first listed it nearby (null: not within the usual look around). */
  seen: number | null
  dismissed?: boolean
}

const place = (p: Omit<DemoPlace, 'maps_url' | 'address'> & { street: string; town?: string }): DemoPlace => {
  const { street, town = '29670 San Pedro de Alcántara', ...rest } = p
  return { ...rest, address: `${street}, ${town}`, maps_url: `https://www.google.com/maps/place/?q=place_id:${p.place_id}` }
}

export const DEMO_PLACES: DemoPlace[] = [
  place({ place_id: 'demo-molino', name: 'Molino Coffee Lab', kind: 'specialty', street: 'C. Marqués del Duero, 12', distance_m: 180, lat: 36.4881, lng: -4.9925,
    rating: 4.7, review_count: 410, price_level: 2, primary_type: 'coffee_shop', website: 'https://molino-coffee.example', seen: 50,
    features: { terrace: true, dogs: true, breakfast: true, brunch: true, vegetarian: true, takeaway: true, cards: true, toilets: true },
    hours: week('07:30', '19:00', ['08:30', '19:00'], ['09:00', '14:00']) }),
  place({ place_id: 'demo-plaza', name: 'Café Bar La Plaza', kind: 'cafe_bar', street: 'Plaza de la Iglesia, 3', distance_m: 310, lat: 36.4886, lng: -4.9946,
    rating: 4.3, review_count: 812, price_level: 1, primary_type: 'bar', website: null, seen: 50,
    features: { terrace: true, breakfast: true, brunch: false, alcohol: true, sports_tv: true, takeaway: true, cards: true, dogs: false, delivery: false, toilets: true },
    hours: week('07:00', '22:00', ['07:00', '22:00'], ['08:00', '22:00']) }),
  place({ place_id: 'demo-brunch', name: 'The Brunch Garden', kind: 'brunch', street: 'Av. Oriental, 21', distance_m: 650, lat: 36.4832, lng: -4.9860,
    rating: 4.6, review_count: 530, price_level: 2, primary_type: 'brunch_restaurant', website: 'https://brunchgarden.example', seen: 50,
    features: { breakfast: true, brunch: true, lunch: true, vegetarian: true, terrace: true, dogs: true, kids: true, bookings: true, delivery: true, cards: true, takeaway: false },
    hours: week('09:00', '16:00') }),
  place({ place_id: 'demo-horno', name: 'Horno de Santa Ana', kind: 'bakery', street: 'C. Lagasca, 40', distance_m: 420, lat: 36.4900, lng: -4.9935,
    rating: 4.5, review_count: 290, price_level: 1, primary_type: 'bakery', website: null, seen: 50,
    features: { breakfast: true, pastries: true, takeaway: true, cards: true, terrace: false, brunch: false },
    hours: week('07:00', '14:00', ['07:00', '14:00'], ['08:00', '13:00']) }),
  place({ place_id: 'demo-verde', name: 'Verde Juice Bar', kind: 'juice', street: 'Bulevar de la Libertad, 9', distance_m: 900, lat: 36.4795, lng: -4.9890,
    rating: 4.4, review_count: 96, price_level: 2, primary_type: 'juice_shop', website: 'https://verdejuice.example', seen: 50,
    features: { vegetarian: true, takeaway: true, delivery: true, cards: true, breakfast: false, dogs: false },
    hours: week('09:00', '20:00', ['09:00', '20:00'], null) }),
  // Nearby, not followed: a bar and an ice-cream parlour from the first look, a new café last week, a hotel bar put aside.
  place({ place_id: 'demo-puerto', name: 'Bar El Puerto', kind: 'cafe_bar', street: 'C. Pizarro, 30', distance_m: 240, lat: 36.4884, lng: -4.9913,
    rating: 4.1, review_count: 350, price_level: 1, primary_type: 'bar', website: null, seen: 50,
    features: { breakfast: true, alcohol: true, sports_tv: true, terrace: true, cards: true }, hours: week('07:00', '23:00') }),
  place({ place_id: 'demo-rincon', name: 'Nuevo Rincón Café', kind: 'cafe', street: 'C. Andalucía, 5', distance_m: 150, lat: 36.4878, lng: -4.9927,
    rating: 4.9, review_count: 7, price_level: 2, primary_type: 'cafe', website: null, seen: 7,
    features: { plant_milk: true, takeaway: true, cards: true }, hours: week('08:00', '17:00', ['09:00', '15:00'], null) }),
  place({ place_id: 'demo-costa', name: 'Heladería Costa', kind: 'other', street: 'Paseo Marítimo, 2', distance_m: 760, lat: 36.4815, lng: -4.9902,
    rating: 4.5, review_count: 210, price_level: 1, primary_type: 'ice_cream_shop', website: null, seen: 50,
    features: { takeaway: true, terrace: true }, hours: week('11:00', '23:00') }),
  place({ place_id: 'demo-hotel', name: 'Hotel Alcántara Lounge', kind: 'other', street: 'Av. Luis Braille, 1', distance_m: 520, lat: 36.4850, lng: -4.9965,
    rating: 4.0, review_count: 120, price_level: 3, primary_type: 'bar', website: null, seen: 50, dismissed: true,
    features: { alcohol: true, terrace: true }, hours: week('10:00', '23:30') }),
  // Further away: found by name.
  place({ place_id: 'demo-lisboa', name: 'Café Lisboa Marbella', kind: 'specialty', street: 'C. Ancha, 4', town: '29601 Marbella', distance_m: 9200, lat: 36.5100, lng: -4.8860,
    rating: 4.8, review_count: 1250, price_level: 2, primary_type: 'coffee_shop', website: 'https://cafelisboa.example', seen: null,
    features: { terrace: true, brunch: true, breakfast: true, vegetarian: true, cards: true }, hours: week('08:00', '20:00') }),
]

/** The five followed, the business itself, the basket and its prices, notes, ratings week by week, and the look around. */
export function demoCompetitors(today: string, recipes: { id: string; name: string; active: boolean }[], self: { name: string }): CompetitorData {
  const ago = (n: number) => addDays(today, -n)
  const stamp = (n: number) => `${ago(n)}T10:00:00.000Z`
  const followed = DEMO_PLACES.slice(0, 5)
  const id = (p: DemoPlace) => p.place_id.replace('demo-', 'c-')
  const base = { address: null, distance_m: null, lat: null, lng: null, place_id: null, website: null, instagram: null, maps_url: null, price_level: null,
    hours: null, google_hours: null, features: {}, google_features: {}, google_rating: null, google_count: null, google_status: 'open' as const,
    google_checked_at: stamp(3), strengths: null, weaknesses: null, notes: null, active: true, created_at: stamp(50) }
  const own: Record<string, Partial<Competitor>> = {
    'c-molino': { threat: 'high', instagram: 'molino.coffee', features: { specialty: true, plant_milk: true, cold_coffee: true, retail: true, matcha: false, laptop: false, loyalty: true },
      strengths: 'Roasts its own beans and sells them; great latte art; very busy at weekends.', weaknesses: 'Small inside, queues at weekends; no matcha; no laptops at weekends.' },
    'c-plaza': { threat: 'medium', features: { specialty: false, plant_milk: false, matcha: false, vegan: false, laptop: false },
      strengths: 'Cheap breakfasts on the square, open early to late, every day.', weaknesses: 'Commercial coffee, no plant milks; noisy when football is on.' },
    'c-brunch': { threat: 'high', instagram: 'thebrunchgarden', features: { plant_milk: true, smoothies: true, healthy: true, matcha: true, vegan: true, gluten_free: true, specialty: false, laptop: false },
      strengths: 'The brunch place: big garden terrace, dogs and children welcome, books tables.', weaknesses: 'Closes at 16:00; coffee is fine, not special; €€ for a coffee alone.' },
    'c-horno': { threat: 'low', features: { specialty: false, plant_milk: false, matcha: false },
      strengths: 'Fresh bread and pastries from 7:00; locals’ morning stop.', weaknesses: 'No seating to speak of; closes at 14:00.' },
    'c-verde': { threat: 'medium', instagram: 'verde.juicebar', features: { smoothies: true, healthy: true, vegan: true, plant_milk: true, matcha: true, specialty: false },
      strengths: 'Smoothies and açaí bowls; strong on Instagram; delivers through Glovo.', weaknesses: 'Small, a bit far from the centre; no real coffee offer.' },
  }
  const competitors: Competitor[] = [
    { ...base, id: 'c-self', is_self: true, name: self.name, kind: 'specialty', threat: null, place_id: 'demo-easybeans', lat: DEMO_CAFE_AT.lat, lng: DEMO_CAFE_AT.lng,
      price_level: 2, google_rating: 4.8, google_count: 64, address: 'C. Pizarro, 8, 29670 San Pedro de Alcántara',
      features: { specialty: true, plant_milk: true, matcha: true, cold_coffee: true, smoothies: true, healthy: true, vegan: true, vegetarian: true, pastries: true,
        terrace: true, laptop: true, takeaway: true, cards: true, loyalty: true, breakfast: false, brunch: false, dogs: false, delivery: false, alcohol: false, sports_tv: false },
      google_features: { terrace: true, takeaway: true, cards: true } },
    ...followed.map((p): Competitor => ({ ...base, id: id(p), is_self: false, name: p.name, kind: p.kind, threat: 'medium', address: p.address, distance_m: p.distance_m,
      lat: p.lat, lng: p.lng, place_id: p.place_id, website: p.website, maps_url: p.maps_url, price_level: p.price_level, google_hours: p.hours, google_features: p.features,
      google_rating: p.rating, google_count: p.review_count, ...own[id(p)] })),
  ]

  // The usual basket, linked to the café's own menu where there's no doubt (Flat white, Matcha latte → Iced matcha latte…).
  const items = BASKET.filter(name => !['Latte', 'Iced latte', 'Chai latte', 'Plant milk (extra)'].includes(name))
    .map((name, i) => ({ id: `i-${i + 1}`, name, recipe_id: matchRecipe(name, recipes)?.id ?? null, sort: i + 1 }))
  const item = (name: string) => items.find(i => i.name === name)!.id
  let n = 0
  const price = (competitor: string, name: string, value: number, daysAgo: number, source: PriceSource = 'visit', note: string | null = null) =>
    ({ id: `pr-${++n}`, competitor_id: competitor, item_id: item(name), price: value, observed_on: ago(daysAgo), source, note, created_at: stamp(daysAgo) })
  const prices = [
    price('c-molino', 'Espresso', 1.6, 110), price('c-molino', 'Espresso', 1.7, 25, 'menu'),
    price('c-molino', 'Flat white', 3, 110), price('c-molino', 'Flat white', 3.2, 25, 'menu', 'Autumn menu: pumpkin spice flat white €3.80 too'),
    price('c-molino', 'Cappuccino', 2.9, 25, 'menu'), price('c-molino', 'Café con leche', 2.2, 25, 'menu'), price('c-molino', 'Croissant', 2.2, 25),
    price('c-plaza', 'Espresso', 1.2, 133), price('c-plaza', 'Espresso', 1.3, 18), price('c-plaza', 'Café con leche', 1.6, 133), price('c-plaza', 'Café con leche', 1.7, 18),
    price('c-plaza', 'Cappuccino', 2, 18), price('c-plaza', 'Croissant', 1.5, 18), price('c-plaza', 'Tostada con tomate', 2.5, 18), price('c-plaza', 'Fresh orange juice', 3, 18),
    price('c-brunch', 'Espresso', 1.8, 33, 'website'), price('c-brunch', 'Flat white', 3.5, 33, 'website'), price('c-brunch', 'Cappuccino', 3.2, 33, 'website'),
    price('c-brunch', 'Café con leche', 2.6, 33, 'website'), price('c-brunch', 'Matcha latte', 4.8, 33, 'website'), price('c-brunch', 'Croissant', 2.5, 33, 'website'),
    price('c-brunch', 'Tostada con tomate', 3.9, 33, 'website'), price('c-brunch', 'Fresh orange juice', 4.2, 33, 'website'), price('c-brunch', 'Smoothie', 6.5, 33, 'website'),
    price('c-horno', 'Croissant', 1.3, 180), price('c-horno', 'Croissant', 1.4, 10), price('c-horno', 'Café con leche', 1.8, 10), price('c-horno', 'Espresso', 1.3, 10),
    price('c-horno', 'Tostada con tomate', 2.2, 10),
    price('c-verde', 'Smoothie', 5.9, 77, 'delivery'), price('c-verde', 'Smoothie', 6.2, 12), price('c-verde', 'Matcha latte', 4.5, 12), price('c-verde', 'Fresh orange juice', 3.8, 12),
    price('c-verde', 'Açaí bowl', 8.5, 12),
    // The café's own smoothie price (it isn't on Menu costing yet).
    price('c-self', 'Smoothie', 5.5, 40, 'menu'),
  ]

  let m = 0
  const note = (competitor: string | null, kind: CompetitorData['notes'][number]['kind'], text: string, daysAgo: number, status: CompetitorData['notes'][number]['status'] = null) =>
    ({ id: `n-${++m}`, competitor_id: competitor, kind, text, observed_on: ago(daysAgo), status, created_at: stamp(daysAgo) })
  const notes = [
    note('c-horno', 'price', 'Croissant up to €1.40 (was €1.30).', 10),
    note('c-verde', 'social', 'Posting açaí bowls every day on Instagram reels; 2x1 smoothies on Mondays.', 12),
    note('c-plaza', 'price', 'Café con leche up to €1.70 (was €1.60) and espresso €1.30.', 18),
    note('c-molino', 'visit', 'Saturday 10:30: queue to the door. New autumn menu with a pumpkin spice flat white at €3.80.', 25),
    note('c-molino', 'idea', '10% off when you bring your own cup: an easy win for our wellbeing crowd.', 25, 'new'),
    note(null, 'other', 'Oat milk is the default in three cafés now; the Brunch Garden doesn’t charge extra for it.', 29),
    note('c-brunch', 'promotion', 'Weekday breakfast deal: coffee, juice and toast €9.90 before 11:00.', 33),
    note('c-brunch', 'idea', 'Water bowls and dog treats at the door: half their terrace had dogs.', 33, 'trying'),
    note('c-plaza', 'idea', 'Football on a big screen: not for us.', 82, 'dropped'),
    note('c-horno', 'idea', 'Coffee and croissant at €3.20 before 10:00.', 102, 'adopted'),
  ]

  // Google's rating and reviews every week for four months: how fast each one's reviews come in.
  const pace: Record<string, number> = { 'c-self': 2.2, 'c-molino': 3, 'c-plaza': 4.6, 'c-brunch': 5.8, 'c-horno': 1.2, 'c-verde': 1.4 }
  const snapshots = competitors.flatMap(c => Array.from({ length: 17 }, (_, w) => ({
    competitor_id: c.id, taken_on: ago(3 + w * 7), rating: c.id === 'c-brunch' && w > 8 ? 4.7 : c.google_rating,
    review_count: Math.max(0, Math.round(c.google_count! - pace[c.id] * w)),
  })))

  const nearby: NearbyPlace[] = DEMO_PLACES.filter(p => p.seen !== null).map(p => ({ place_id: p.place_id, name: p.name, address: p.address, distance_m: p.distance_m,
    rating: p.rating, review_count: p.review_count, price_level: p.price_level, primary_type: p.primary_type, maps_url: p.maps_url,
    first_seen: stamp(p.seen!), dismissed: !!p.dismissed }))

  return { competitors, items, prices, notes, snapshots, nearby, settings: { radius_m: 1000, scan_weekly: true, scanned_at: stamp(7) } }
}
