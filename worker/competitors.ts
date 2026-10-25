// Competitors page, Google's side (Places API, the key the Reviews page uses: nothing else to set
// up). What's around the business is looked up when an admin asks, then once a week, and kept in
// competitor_radar, so opening the page never asks Google. A place is followed with everything
// Google knows (rating, price level, hours, what it offers) and checked again every week, keeping a
// snapshot of its rating and review count each time. Admins hear in the bell about new places
// nearby (from the weekly look) and about places Google shows as closed.
import { Hono } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bearer, serviceClient, userClient, type Env } from './supabase'
import { findPlaces, nearbyCafes, placeDetails, type PlaceDetails, type PlaceSummary } from './providers/places'
import {
  DEFAULT_RADIUS, GOOGLE_EVERY_DAYS, NEW_PLACE_MAX_REVIEWS, distanceM, featuresFromGoogle, hoursFromGoogle, kindFromGoogle, priceLevelFromGoogle,
  suggestedThreat, type Competitor, type GoogleStatus, type NearbyPlace,
} from '../shared/localCompetitors'
import { today } from '../shared/time'

export const competitors = new Hono<{ Bindings: Env }>()

competitors.use('/api/competitors/*', async (c, next) => {
  const token = bearer(c.req.header('authorization'))
  const { data } = token ? await userClient(c.env, token, 'app').rpc('is_admin') : { data: false }
  if (data !== true) return c.json({ error: 'Only an admin can see competitors' }, 403)
  await next()
})

export const NO_PLACES = 'Finding places on Google needs the Places API key the Reviews page uses (GOOGLE_PLACES_API_KEY): docs/INTEGRATIONS.md section 16.'
export const NO_CENTRE = 'Google doesn’t know where the business is yet: add its Google place id (GOOGLE_PLACE_ID) or its address on the Business page.'

const STATUS: Record<string, GoogleStatus> = { OPERATIONAL: 'open', CLOSED_TEMPORARILY: 'closed_temporarily', CLOSED_PERMANENTLY: 'closed_permanently' }
type Point = { lat: number; lng: number }
const rating1 = (r: number | null) => (r === null ? null : Math.round(r * 10) / 10)
const problem = (e: unknown) => (e instanceof Error ? e.message : String(e))

async function tellAdmins(db: SupabaseClient, title: string, body: string | null) {
  const { data: admins } = await db.from('profiles').select('id').eq('role', 'admin').eq('active', true)
  if (admins?.length) await db.from('notifications').insert(admins.map(a => ({ profile_id: a.id, title, body, link: '/competitors' })))
}

const ownRow = async (db: SupabaseClient) =>
  (await db.from('competitors').select('*').eq('is_self', true).maybeSingle()).data as Competitor | null

/**
 * Keep what Google says about a place (rating, hours, what it offers, where it is) and a snapshot
 * of its rating for the trend. Admins hear once when Google starts showing it as closed.
 */
async function keepDetails(db: SupabaseClient, row: Competitor, d: PlaceDetails, at: Point | null) {
  const status = d.status ? STATUS[d.status] ?? null : null
  const level = priceLevelFromGoogle(d.priceLevel)
  const { error } = await db.from('competitors').update({
    place_id: d.id, google_rating: rating1(d.rating), google_count: d.count, google_status: status, google_features: featuresFromGoogle(d.raw),
    google_hours: hoursFromGoogle(d.periods), google_checked_at: new Date().toISOString(), maps_url: d.mapsUrl ?? row.maps_url,
    lat: d.location?.lat ?? row.lat, lng: d.location?.lng ?? row.lng,
    ...(level !== null ? { price_level: level } : {}),
    ...(!row.address && d.address ? { address: d.address.slice(0, 200) } : {}),
    ...(!row.website && d.website && /^https?:\/\/\S+$/.test(d.website) ? { website: d.website } : {}),
    ...(!row.is_self && at && d.location ? { distance_m: distanceM(at, d.location) } : {}),
  }).eq('id', row.id)
  if (error) throw new Error(error.message)
  await db.from('competitor_snapshots').upsert({ competitor_id: row.id, taken_on: today(), rating: rating1(d.rating), review_count: d.count }, { onConflict: 'competitor_id,taken_on' })
  if (!row.is_self && status && status !== 'open' && status !== row.google_status) {
    await tellAdmins(db, status === 'closed_permanently' ? `${row.name} has closed for good, says Google` : `${row.name} is closed for now, says Google`,
      row.active ? 'Stop following it on Competitors if it’s gone.' : null)
  }
}

/**
 * Where the business is: its own row's map position, else its Google listing's (GOOGLE_PLACE_ID,
 * kept with everything else about it), else its address looked up on Google.
 */
async function centre(env: Env, db: SupabaseClient): Promise<Point | null> {
  const self = await ownRow(db)
  if (self?.lat != null && self.lng != null) return { lat: self.lat, lng: self.lng }
  const key = env.GOOGLE_PLACES_API_KEY
  if (!key) return null
  if (env.GOOGLE_PLACE_ID) {
    const d = await placeDetails(key, env.GOOGLE_PLACE_ID)
    if (self) await keepDetails(db, self, d, null)
    return d.location
  }
  const { data: b } = await db.from('business').select('name, address').eq('id', 1).maybeSingle()
  if (!b?.address) return null
  const [hit] = await findPlaces(key, `${b.name} ${b.address}`, null)
  if (hit?.location && self) await db.from('competitors').update({ lat: hit.location.lat, lng: hit.location.lng }).eq('id', self.id)
  return hit?.location ?? null
}

const nearbyRow = (p: PlaceSummary, at: Point | null) => ({
  place_id: p.id, name: p.name.slice(0, 200), address: p.address, distance_m: at && p.location ? distanceM(at, p.location) : null,
  rating: rating1(p.rating), review_count: p.count, price_level: priceLevelFromGoogle(p.priceLevel), primary_type: p.primaryType, maps_url: p.mapsUrl,
  lat: p.location?.lat ?? null, lng: p.location?.lng ?? null,
})

/**
 * Ask Google what's around the business and keep it (competitor_radar). With `notify` (the weekly
 * look), admins hear about places that weren't there last time and have few reviews yet: new ones.
 * The first look, or one further out than before, finds what was always there, so it says nothing.
 */
export async function lookAround(env: Env, db: SupabaseClient, { radius, notify = false }: { radius?: number; notify?: boolean } = {}) {
  const key = env.GOOGLE_PLACES_API_KEY
  if (!key) throw new Error(NO_PLACES)
  const at = await centre(env, db)
  if (!at) throw new Error(NO_CENTRE)
  const { data: settings } = await db.from('competitor_settings').select('radius_m, scanned_at').eq('id', 1).maybeSingle()
  const r = radius ?? settings?.radius_m ?? DEFAULT_RADIUS
  const found = (await nearbyCafes(key, at, r)).filter(p => p.id !== env.GOOGLE_PLACE_ID)
  const [{ data: seen }, { data: followed }] = await Promise.all([db.from('competitor_radar').select('place_id'), db.from('competitors').select('place_id, is_self')])
  const known = new Set((seen ?? []).map(x => x.place_id as string))
  const ours = new Set((followed ?? []).filter(x => x.is_self).map(x => x.place_id as string | null).filter(Boolean))
  const followedIds = new Set((followed ?? []).map(x => x.place_id as string | null).filter(Boolean))
  const now = new Date().toISOString()
  const rows = found.filter(p => !ours.has(p.id)).map(p => ({ ...nearbyRow(p, at), last_seen: now }))
  if (rows.length) {
    const { error } = await db.from('competitor_radar').upsert(rows, { onConflict: 'place_id' })
    if (error) throw new Error(error.message)
  }
  await db.from('competitor_settings').update({ scanned_at: now, radius_m: r }).eq('id', 1)
  const sameLook = known.size > 0 && settings?.scanned_at && r <= (settings.radius_m ?? r)
  const fresh = sameLook ? rows.filter(x => !known.has(x.place_id) && !followedIds.has(x.place_id) && (x.review_count ?? 0) < NEW_PLACE_MAX_REVIEWS) : []
  if (notify && fresh.length) {
    await tellAdmins(db, fresh.length === 1 ? `New on Google nearby: ${fresh[0].name}` : `${fresh.length} new places on Google nearby`,
      fresh.slice(0, 5).map(x => `${x.name}${x.distance_m !== null ? ` (${x.distance_m} m)` : ''}`).join(', '))
  }
  return { found: rows.length, fresh: fresh.length }
}

/**
 * The places due their weekly check (the business's own listing first, then the longest
 * unchecked), up to `limit` a night. A place Google can't find is tried again a week later.
 */
export async function checkDue(env: Env, db: SupabaseClient, limit = 12) {
  const key = env.GOOGLE_PLACES_API_KEY
  if (!key) return 0
  const { data } = await db.from('competitors').select('*').eq('active', true)
  const rows = (data ?? []) as Competitor[]
  const self = rows.find(r => r.is_self)
  if (self && !self.place_id && env.GOOGLE_PLACE_ID) self.place_id = env.GOOGLE_PLACE_ID
  // An hour's leeway, so the nightly run doesn't slip a day later each week.
  const due = Date.now() - GOOGLE_EVERY_DAYS * 86_400_000 + 3_600_000
  const list = rows.filter(r => r.place_id && (!r.google_checked_at || Date.parse(r.google_checked_at) < due))
    .sort((a, b) => Number(b.is_self) - Number(a.is_self) || (a.google_checked_at ?? '').localeCompare(b.google_checked_at ?? '')).slice(0, limit)
  let at: Point | null = self?.lat != null && self.lng != null ? { lat: self.lat, lng: self.lng } : null
  let n = 0
  for (const row of list) {
    try {
      const d = await placeDetails(key, row.place_id!)
      await keepDetails(db, row, d, at)
      if (row.is_self && d.location) at = d.location
      n++
    } catch (e) {
      console.error(`competitor check failed: ${row.name}`, problem(e))
      await db.from('competitors').update({ google_checked_at: new Date().toISOString() }).eq('id', row.id)
    }
  }
  return n
}

/** Every night: the places due their weekly check, and the weekly look around once an admin has looked once. */
export async function watchCompetitors(env: Env, db: SupabaseClient) {
  if (!env.GOOGLE_PLACES_API_KEY) return
  await checkDue(env, db)
  const { data: s } = await db.from('competitor_settings').select('scan_weekly, scanned_at').eq('id', 1).maybeSingle()
  if (s?.scan_weekly && s.scanned_at && Date.parse(s.scanned_at as string) < Date.now() - GOOGLE_EVERY_DAYS * 86_400_000 + 3_600_000) {
    await lookAround(env, db, { notify: true })
  }
}

// Is Google set up: the key (everything), and the business's own place id (its rating on the page).
competitors.get('/api/competitors/google', c => c.json({ places: !!c.env.GOOGLE_PLACES_API_KEY, own_place: !!c.env.GOOGLE_PLACE_ID }))

// Look around the business now: { radius_m? }.
competitors.post('/api/competitors/look', async c => {
  const { radius_m } = await c.req.json<{ radius_m?: number }>().catch(() => ({} as { radius_m?: number }))
  if (radius_m !== undefined && !(Number.isInteger(radius_m) && radius_m >= 100 && radius_m <= 20000)) return c.json({ error: 'Look between 100 m and 20 km around' }, 400)
  try {
    return c.json(await lookAround(c.env, serviceClient(c.env), { radius: radius_m }))
  } catch (e) {
    return c.json({ error: problem(e) }, e instanceof Error && (e.message === NO_PLACES || e.message === NO_CENTRE) ? 409 : 502)
  }
})

// Places on Google by name (or "brunch San Pedro"), nearest the business first in Google's eyes: ?q=.
competitors.get('/api/competitors/search', async c => {
  const q = c.req.query('q')?.trim() ?? ''
  if (q.length < 2) return c.json({ error: 'Type at least two letters' }, 400)
  if (!c.env.GOOGLE_PLACES_API_KEY) return c.json({ error: NO_PLACES }, 409)
  try {
    const db = serviceClient(c.env)
    const at = await centre(c.env, db).catch(() => null)
    const found = await findPlaces(c.env.GOOGLE_PLACES_API_KEY, q.slice(0, 120), at)
    const now = new Date().toISOString()
    const places: NearbyPlace[] = found.filter(p => p.id !== c.env.GOOGLE_PLACE_ID).map(p => ({ ...nearbyRow(p, at), first_seen: now, dismissed: false }))
    return c.json({ places })
  } catch (e) {
    return c.json({ error: problem(e) }, 502)
  }
})

// Follow a place from Google with everything Google knows: { place_id, id? } (id: the competitor
// added by hand that it is). Following one again that was stopped starts it again.
competitors.post('/api/competitors/follow', async c => {
  const { place_id, id } = await c.req.json<{ place_id?: string; id?: string }>().catch(() => ({} as { place_id?: string; id?: string }))
  if (!place_id || place_id.length > 300) return c.json({ error: 'Pick a place from Google' }, 400)
  if (!c.env.GOOGLE_PLACES_API_KEY) return c.json({ error: NO_PLACES }, 409)
  if (place_id === c.env.GOOGLE_PLACE_ID) return c.json({ error: 'That’s your own business' }, 400)
  const db = serviceClient(c.env)
  try {
    const d = await placeDetails(c.env.GOOGLE_PLACES_API_KEY, place_id)
    const { data: same } = await db.from('competitors').select('*').eq('place_id', d.id).maybeSingle()
    if (same?.is_self) return c.json({ error: 'That’s your own business' }, 400)
    if (same && id && same.id !== id) return c.json({ error: `${same.name} is already followed with that Google listing` }, 409)
    const at = await centre(c.env, db).catch(() => null)
    let row = (same ?? (id ? (await db.from('competitors').select('*').eq('id', id).maybeSingle()).data : null)) as Competitor | null
    if (!row) {
      const distance = at && d.location ? distanceM(at, d.location) : null
      const kind = kindFromGoogle(d.primaryType)
      const made = await db.from('competitors').insert({ name: d.name.slice(0, 120) || 'Unnamed place', kind, threat: suggestedThreat(kind, distance),
        distance_m: distance, active: true })
        .select('*').single()
      if (made.error) throw new Error(made.error.message)
      row = made.data as Competitor
    } else if (!row.active) {
      await db.from('competitors').update({ active: true }).eq('id', row.id)
    }
    await keepDetails(db, row, d, at)
    return c.json({ id: row.id })
  } catch (e) {
    return c.json({ error: problem(e) }, 502)
  }
})

// Read one place from Google again now: { id }. Asked again within 10 minutes, what's kept stands.
competitors.post('/api/competitors/refresh', async c => {
  const { id } = await c.req.json<{ id?: string }>().catch(() => ({} as { id?: string }))
  if (!c.env.GOOGLE_PLACES_API_KEY) return c.json({ error: NO_PLACES }, 409)
  const db = serviceClient(c.env)
  const row = (await db.from('competitors').select('*').eq('id', id ?? '').maybeSingle()).data as Competitor | null
  if (!row) return c.json({ error: 'No such competitor' }, 404)
  const placeId = row.place_id ?? (row.is_self ? c.env.GOOGLE_PLACE_ID : undefined)
  if (!placeId) return c.json({ error: 'Find it on Google first' }, 400)
  if (row.google_checked_at && Date.now() - Date.parse(row.google_checked_at) < 10 * 60_000) return c.json({ ok: true, kept: true })
  try {
    const self = row.is_self ? row : await ownRow(db)
    const at = self?.lat != null && self.lng != null ? { lat: self.lat, lng: self.lng } : null
    await keepDetails(db, row, await placeDetails(c.env.GOOGLE_PLACES_API_KEY, placeId), at)
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: problem(e) }, 502)
  }
})
