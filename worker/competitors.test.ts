// Competitors, Google's side, through the Worker's routes and nightly job against stand-ins for
// Supabase and Google Places; and the AI tools. What must never break:
//   - only admins look anything up, and nothing is asked of Google without the Places key
//   - lists ask Google only for what a list shows; everything (billed higher) only to follow or check a place
//   - a followed place gets Google's rating, hours, price level and what it offers, and a snapshot for the trend
//   - each place is checked once a week, not more; one Google no longer finds doesn't stop the rest
//   - admins hear about new places nearby (not the ones that were always there) and closures, once
//   - the AI can read the comparison and record prices and notes
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkDue, competitors, lookAround, watchCompetitors } from './competitors'
import { TOOLS, runTool } from './tools'
import { serviceClient, type Env } from './supabase'
import { FakeSupabase, type Row } from './test/fakeSupabase'
import { FakeProviders, type Json } from './test/fakeProviders'
import type { Profile } from '../shared/types'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key', GOOGLE_PLACES_API_KEY: 'places-key', GOOGLE_PLACE_ID: 'ChIJeasybeans',
} as unknown as Env
const noPlaces = { ...env, GOOGLE_PLACES_API_KEY: undefined } as Env

let db: FakeSupabase
let apis: FakeProviders
const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext
const admin = { authorization: 'Bearer admin-token', 'content-type': 'application/json' }
const staff = { authorization: 'Bearer staff-token', 'content-type': 'application/json' }
const call = (path: string, init: RequestInit = {}, e = env) => competitors.request(`${APP}${path}`, init, e, ctx())
const post = (path: string, body: unknown, e = env) => call(path, { method: 'POST', headers: admin, body: JSON.stringify(body) }, e)
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

// Easy Beans on Calle Pizarro, and the places around it as Google answers for them.
const HOME = { latitude: 36.4867, longitude: -4.9918 }
const listing = (id: string, name: string, at: { latitude: number; longitude: number }, more: Json = {}): Json => ({
  id, displayName: { text: name }, formattedAddress: `${name}, San Pedro de Alcántara`, location: at, rating: 4.5, userRatingCount: 120,
  priceLevel: 'PRICE_LEVEL_INEXPENSIVE', primaryType: 'cafe', googleMapsUri: `https://maps.google.com/?cid=${id}`, businessStatus: 'OPERATIONAL', ...more,
})
const MOLINO = listing('p-molino', 'Molino Coffee Lab', { latitude: 36.4880, longitude: -4.9930 }, {
  rating: 4.8, userRatingCount: 410, primaryType: 'coffee_shop', priceLevel: 'PRICE_LEVEL_MODERATE', websiteUri: 'https://molino.example',
  outdoorSeating: true, allowsDogs: true, servesBreakfast: true, servesVegetarianFood: true, takeout: true, paymentOptions: { acceptsNfc: true },
  regularOpeningHours: { periods: [1, 2, 3, 4, 5].map(day => ({ open: { day, hour: 7, minute: 30 }, close: { day, hour: 19, minute: 0 } })) },
})
const PLAZA = listing('p-plaza', 'Café Bar La Plaza', { latitude: 36.4885, longitude: -4.9944 }, { primaryType: 'bar', rating: 4.3, userRatingCount: 800 })

beforeEach(() => {
  db = new FakeSupabase()
  apis = new FakeProviders()
  db.people.set('admin-token', { id: 'u-admin', role: 'admin' })
  db.people.set('staff-token', { id: 'u-staff', role: 'employee' })
  db.tables.profiles = [{ id: 'u-admin', role: 'admin', active: true }, { id: 'u-admin2', role: 'admin', active: true }, { id: 'u-staff', role: 'employee', active: true }]
  db.table('business')[0] = { id: 1, name: 'Easy Beans Coffee', address: 'C. Pizarro, 8, 29670 San Pedro de Alcántara', opening_hours: {} }
  db.tables.competitors = [{ id: 'self', is_self: true, name: 'Easy Beans Coffee', kind: 'specialty', threat: null, place_id: null, lat: null, lng: null,
    active: true, features: {}, google_features: {}, google_status: null, google_checked_at: null, address: null, website: null, maps_url: null }]
  db.tables.competitor_settings = [{ id: 1, radius_m: 1000, scan_weekly: true, scanned_at: null }]
  db.tables.competitor_radar = []
  db.tables.competitor_snapshots = []
  db.tables.notifications = []
  apis.places.own = { id: 'ChIJeasybeans', displayName: { text: 'Easy Beans Coffee' }, location: HOME, priceLevel: 'PRICE_LEVEL_MODERATE', outdoorSeating: true }
  apis.places.listings = { 'p-molino': MOLINO, 'p-plaza': PLAZA }
  apis.places.nearby = ['p-molino', 'p-plaza', 'ChIJeasybeans']
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init) ?? apis.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => vi.unstubAllGlobals())

const row = (id: string) => db.table('competitors').find(c => c.id === id || c.place_id === id)!
const notified = () => db.table('notifications').map(n => `${n.profile_id}: ${n.title}`)

describe('Competitors: Google', () => {
  it('only admins look anything up; without the Places key nothing is asked of Google', async () => {
    expect((await call('/api/competitors/google')).status).toBe(403)
    expect((await call('/api/competitors/look', { method: 'POST', headers: staff, body: '{}' })).status).toBe(403)
    expect(await (await call('/api/competitors/google', { headers: admin })).json()).toEqual({ places: true, own_place: true })
    const res = await post('/api/competitors/look', {}, noPlaces)
    expect(res.status).toBe(409)
    expect((await res.json() as { error: string }).error).toMatch(/Places API key/)
    expect((await post('/api/competitors/look', { radius_m: 50 })).status).toBe(400)
    expect(apis.places.calls).toBe(0)
    await watchCompetitors(noPlaces, serviceClient(noPlaces))
    expect(apis.places.calls).toBe(0)
  })

  it('looks around the business: where it is from its own listing, the nearest cafés kept with their distance, the business left out', async () => {
    const res = await post('/api/competitors/look', { radius_m: 500 })
    expect(await res.json()).toEqual({ found: 2, fresh: 0 })
    expect(row('self')).toMatchObject({ place_id: 'ChIJeasybeans', lat: HOME.latitude, lng: HOME.longitude, google_rating: 4.7, google_count: 38, price_level: 2,
      google_features: { terrace: true } })
    const radar = db.table('competitor_radar')
    expect(radar.map(p => p.place_id)).toEqual(['p-molino', 'p-plaza'])
    expect(radar[0]).toMatchObject({ name: 'Molino Coffee Lab', rating: 4.8, review_count: 410, price_level: 2, primary_type: 'coffee_shop' })
    expect(Number(radar[0].distance_m)).toBeGreaterThan(150)
    expect(Number(radar[0].distance_m)).toBeLessThan(200)
    expect(db.table('competitor_settings')[0]).toMatchObject({ radius_m: 500 })
    expect(db.table('competitor_settings')[0].scanned_at).toBeTruthy()
    // The list asks only for what a list shows (Google bills by the most detailed field), nearest first, within the radius.
    const [nearby] = apis.places.searches
    expect(nearby.path).toBe('/v1/places:searchNearby')
    expect(nearby.body).toMatchObject({ rankPreference: 'DISTANCE', maxResultCount: 20, locationRestriction: { circle: { radius: 500 } } })
    expect(nearby.fields).not.toMatch(/outdoorSeating|regularOpeningHours|reviews/)
    expect(notified()).toEqual([]) // the first look finds what was always there
  })

  it('the weekly look tells every admin about a new place nearby, once; not one that was always there just further out, nor one followed', async () => {
    await post('/api/competitors/look', {})
    apis.places.listings['p-nuevo'] = listing('p-nuevo', 'Nuevo Café', { latitude: 36.4870, longitude: -4.9920 }, { userRatingCount: 3, rating: 5 })
    apis.places.listings['p-old'] = listing('p-old', 'Horno de Siempre', { latitude: 36.4900, longitude: -4.9960 }, { userRatingCount: 950, primaryType: 'bakery' })
    apis.places.nearby = ['p-nuevo', 'p-molino', 'p-plaza', 'p-old']
    db.table('competitor_settings')[0].scanned_at = daysAgo(7)
    await watchCompetitors(env, serviceClient(env))
    expect(notified()).toEqual(['u-admin: New on Google nearby: Nuevo Café', 'u-admin2: New on Google nearby: Nuevo Café'])
    expect(db.table('notifications')[0]).toMatchObject({ link: '/competitors' })
    expect(db.table('competitor_radar').map(p => p.place_id)).toEqual(['p-molino', 'p-plaza', 'p-nuevo', 'p-old'])
    // The day after: not due again.
    const before = apis.places.calls
    await watchCompetitors(env, serviceClient(env))
    expect(apis.places.calls).toBe(before)
    expect(db.table('notifications')).toHaveLength(2)
  })

  it('follows a place with everything Google knows, a first guess at how much it competes, and a snapshot', async () => {
    const res = await post('/api/competitors/follow', { place_id: 'p-molino' })
    const { id } = await res.json() as { id: string }
    const m = row(id)
    expect(m).toMatchObject({ name: 'Molino Coffee Lab', kind: 'cafe', threat: 'high', place_id: 'p-molino', google_rating: 4.8, google_count: 410, price_level: 2,
      google_status: 'open', website: 'https://molino.example', address: 'Molino Coffee Lab, San Pedro de Alcántara',
      google_features: { terrace: true, dogs: true, breakfast: true, vegetarian: true, takeaway: true, cards: true } })
    expect((m.google_hours as Row).mon).toEqual({ open: '07:30', close: '19:00' })
    expect((m.google_hours as Row).sun).toBeNull()
    expect(Number(m.distance_m)).toBeLessThan(200)
    expect(db.table('competitor_snapshots').filter(x => x.competitor_id === id)).toEqual([expect.objectContaining({ rating: 4.8, review_count: 410 })])
    // Where the business is came from its own listing, once, with its own rating kept too.
    expect(db.table('competitor_snapshots').filter(x => x.competitor_id === 'self')).toEqual([expect.objectContaining({ rating: 4.7, review_count: 38 })])
    // Following it again is the same place; your own isn't a competitor.
    expect(await (await post('/api/competitors/follow', { place_id: 'p-molino' })).json()).toEqual({ id })
    expect(db.table('competitors').filter(c => c.place_id === 'p-molino')).toHaveLength(1)
    expect((await post('/api/competitors/follow', { place_id: 'ChIJeasybeans' })).status).toBe(400)
    // A place added by hand is matched to its listing.
    db.table('competitors').push({ id: 'by-hand', is_self: false, name: 'La Plaza', kind: 'cafe', threat: 'low', place_id: null, active: true, features: {}, google_features: {} })
    expect(await (await post('/api/competitors/follow', { place_id: 'p-plaza', id: 'by-hand' })).json()).toEqual({ id: 'by-hand' })
    expect(row('by-hand')).toMatchObject({ name: 'La Plaza', threat: 'low', place_id: 'p-plaza', google_rating: 4.3 }) // the admin's name and threat stay
  })

  it('checks each place once a week, keeps a snapshot, says once when one closes, and carries on past one Google no longer finds', async () => {
    await post('/api/competitors/follow', { place_id: 'p-molino' })
    await post('/api/competitors/follow', { place_id: 'p-plaza' })
    db.table('competitors').push({ id: 'gone', is_self: false, name: 'Old Café', kind: 'cafe', place_id: 'p-gone', active: true, features: {}, google_features: {},
      google_checked_at: daysAgo(30) })
    apis.places.gone.add('p-gone')
    const dbc = serviceClient(env)
    // Only Old Café is due (the others were just read, the business itself too), and Google no longer finds it.
    expect(await checkDue(env, dbc)).toBe(0)
    for (const c of db.table('competitors')) if (c.id !== 'gone') c.google_checked_at = daysAgo(8)
    apis.places.listings['p-plaza'] = { ...PLAZA, businessStatus: 'CLOSED_PERMANENTLY', rating: 4.2 }
    db.tables.competitor_snapshots = []
    expect(await checkDue(env, dbc)).toBe(3)
    expect(row('p-plaza')).toMatchObject({ google_status: 'closed_permanently', google_rating: 4.2 })
    expect(notified()).toEqual(['u-admin: Café Bar La Plaza has closed for good, says Google', 'u-admin2: Café Bar La Plaza has closed for good, says Google'])
    expect(db.table('competitor_snapshots')).toHaveLength(3)
    expect(Date.parse(String(row('gone').google_checked_at))).toBeGreaterThan(Date.now() - 60_000) // tried again in a week
    for (const c of db.table('competitors')) c.google_checked_at = daysAgo(8)
    await checkDue(env, dbc)
    expect(db.table('notifications')).toHaveLength(2) // closed once is said once
  })

  it('reads one place again when asked, but not twice in ten minutes', async () => {
    const { id } = await (await post('/api/competitors/follow', { place_id: 'p-molino' })).json() as { id: string }
    const before = apis.places.calls
    expect(await (await post('/api/competitors/refresh', { id })).json()).toEqual({ ok: true, kept: true })
    expect(apis.places.calls).toBe(before)
    row(id).google_checked_at = daysAgo(1)
    expect(await (await post('/api/competitors/refresh', { id })).json()).toEqual({ ok: true })
    expect(apis.places.calls).toBe(before + 1)
    expect((await post('/api/competitors/refresh', { id: 'nope' })).status).toBe(404)
  })

  it('finds places by name, with their distance, the business left out', async () => {
    await lookAround(env, serviceClient(env))
    const res = await call('/api/competitors/search?q=molino%20coffee', { headers: admin })
    const { places } = await res.json() as { places: Row[] }
    expect(places.map(p => p.name)).toEqual(['Molino Coffee Lab'])
    expect(places[0]).toMatchObject({ place_id: 'p-molino', rating: 4.8, dismissed: false })
    expect(Number(places[0].distance_m)).toBeGreaterThan(0)
    expect((await call('/api/competitors/search?q=m', { headers: admin })).status).toBe(400)
  })
})

describe('Competitors: the AI tools', () => {
  const me = { id: 'u-admin', full_name: 'Aron', role: 'admin', active: true, can_see_pay: true } as Profile
  const run = (name: string, args: unknown) => runTool(TOOLS.find(t => t.name === name)!, { sb: serviceClient(env), me }, args)
  beforeEach(() => {
    db.table('business')[0].opening_hours = { mon: { open: '08:00', close: '18:00' } }
    db.tables.recipes = [{ id: 'r-fw', name: 'Flat white', sell_price: 3.2, active: true }]
    db.tables.competitor_items = []
    db.tables.competitor_prices = []
    db.tables.competitor_notes = []
    db.tables.competitors.push({ id: 'molino', is_self: false, name: 'Molino Coffee Lab', kind: 'specialty', threat: 'high', active: true, features: { matcha: true },
      google_features: {}, google_rating: 4.8, google_count: 410, google_hours: { mon: { open: '07:30', close: '19:00' } } })
  })

  it('records prices (adding the item to the basket, linked to the menu) and reads the comparison back in plain words', async () => {
    expect(await run('record_competitor_price', { competitor: 'molino', item: 'Flat white', price_eur: 2.8, seen_on: '2026-06-01' }))
      .toEqual({ ok: true, competitor: 'Molino Coffee Lab', item: 'Flat white', added_to_basket: true })
    expect(db.table('competitor_items')[0]).toMatchObject({ name: 'Flat white', recipe_id: 'r-fw' })
    await run('record_competitor_price', { competitor: 'Molino Coffee Lab', item: 'flat white', price_eur: 3, source: 'menu' })
    expect(db.table('competitor_items')).toHaveLength(1)
    await expect(run('record_competitor_price', { competitor: 'Nobody', item: 'Flat white', price_eur: 3 })).rejects.toThrow(/No competitor matches "Nobody". Followed: Molino Coffee Lab/)

    const out = await run('list_competitors', {}) as { competitors: Row[]; basket: Row[]; findings: string[]; recent_price_changes: Row[] }
    expect(out.competitors[0]).toMatchObject({ name: 'Molino Coffee Lab', threat: 'high', offers: ['Matcha'],
      latest_prices: [expect.objectContaining({ item: 'Flat white', price_eur: 3, before_eur: 2.8 })] })
    expect(out.basket).toEqual([expect.objectContaining({ item: 'Flat white', yours_eur: 3.2, yours_from: 'Menu costing', area_average_eur: 3 })])
    expect(out.recent_price_changes).toEqual([expect.objectContaining({ competitor: 'Molino Coffee Lab', from_eur: 2.8, to_eur: 3 })])
    expect(out.findings).toContain('On 1 like-for-like items your prices are 7% above the area average.')
    expect(out.findings).toContain('1 of 1 opens before you on weekdays (at 07:30); you open at 08:00.')
  })

  it('adds a competitor by hand (a name that only looks like another’s is a new one), changes what it offers, and keeps notes and ideas', async () => {
    const made = await run('save_competitor', { name: 'Molino', kind: 'cafe', instagram: '@molino2', offers: { terrace: true } }) as { competitor_id: string; added?: boolean }
    expect(made.added).toBe(true)
    await run('save_competitor', { competitor_id: made.competitor_id, offers: { dogs: false }, website: 'molino2.example' })
    expect(row(made.competitor_id)).toMatchObject({ name: 'Molino', features: { terrace: true, dogs: false }, website: 'https://molino2.example' })
    await expect(run('save_competitor', { name: 'X', offers: { wifi: true } })).rejects.toThrow(/Unknown offers: wifi/)

    expect(await run('add_competitor_note', { competitor: 'Molino Coffee Lab', kind: 'idea', text: 'Stamp card: the 10th coffee free' }))
      .toMatchObject({ ok: true, about: 'Molino Coffee Lab' })
    await run('add_competitor_note', { kind: 'other', text: 'Oat milk is the default in three cafés now' })
    expect(db.table('competitor_notes').map(n => [n.competitor_id, n.kind, n.status])).toEqual([['molino', 'idea', 'new'], [null, 'other', null]])
  })
})
