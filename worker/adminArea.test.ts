// The admin area (/admin), through the Worker's routes against a stand-in for Supabase. What must never break:
//   - the PIN goes to the database to check, with the connection as an id that isn't the address; wrong ones
//     and too many come back in plain words
//   - nothing but the PIN opens without a session's token, and an ended one says it's locked
//   - everything is HQ's rows; a business is tidied before it's kept, and a lane must be HQ's salesperson's
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminArea } from './adminArea'
import type { Env } from './supabase'
import { FakeSupabase, type Row } from './test/fakeSupabase'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key',
} as unknown as Env
const HQ = 7
const TOKEN = 'a'.repeat(64)
const MARIA = '0b0e2f6c-1111-4c2d-8e3f-000000000001'
const JULIO = '0b0e2f6c-1111-4c2d-8e3f-000000000002'
const BOOTES = '0b0e2f6c-2222-4c2d-8e3f-000000000001'

let db: FakeSupabase
let calls: { name: string; args: Row; business: string | null }[]
// The business the last request to the database named.
let named: string | null
const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext
const call = (path: string, init: RequestInit = {}) => adminArea.request(`${APP}${path}`, init, env, ctx())
const send = (method: string, path: string, body: unknown, token: string | null = TOKEN) => call(path, {
  method, headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9', ...(token ? { 'x-admin-session': token } : {}) },
  body: JSON.stringify(body),
})
const get = (path: string, token: string | null = TOKEN) => call(path, { headers: token ? { 'x-admin-session': token } : {} })

beforeEach(() => {
  db = new FakeSupabase()
  calls = []
  db.table('business').push({ id: 1, name: 'Easy Beans Coffee' }, { id: HQ, name: 'Business Agent HQ', is_hq: true })
  db.tables.sales_team = [{ id: MARIA, name: 'Maria Cortes', position: 1, business_id: HQ }, { id: JULIO, name: 'Julio Cesar', position: 2, business_id: HQ },
    // Another business's: never HQ's lane.
    { id: '0b0e2f6c-1111-4c2d-8e3f-000000000099', name: 'Lola', position: 1, business_id: 1 }]
  db.tables.sales_prospects = [{ id: BOOTES, member_id: MARIA, name: 'The Bootes Cafe', stage: 'to_contact', instagram: 'the_bootes_cafe', business_id: HQ,
    updated_at: '2026-11-22T10:00:00Z' }]
  const answer = (name: string, out: (args: Row) => unknown) => {
    db.rpcs[name] = args => { calls.push({ name, args, business: named }); return out(args) }
  }
  answer('admin_area_unlock', ({ p_pin }) => (p_pin === '1234568' ? { token: TOKEN, expires_at: '2026-11-22T22:00:00Z' } : p_pin === '9999' ? { error: 'too_many' } : { error: 'wrong' }))
  answer('admin_area_session', ({ p_token }) => p_token === TOKEN)
  answer('admin_area_lock', () => null)
  answer('admin_area_change_pin', ({ p_current, p_new }) => (p_current !== '1234568' ? { error: 'wrong' } : /^\d{4,12}$/.test(String(p_new)) ? { ok: true } : { error: 'bad_pin' }))
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    named = new Headers(init?.headers).get('x-business-id')
    const res = db.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('opening the admin area', () => {
  it('the right PIN gives a session, checked by the database as HQ, never cached', async () => {
    const res = await send('POST', '/api/admin-area/unlock', { pin: ' 1234568 ' }, null)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ token: TOKEN, expires_at: '2026-11-22T22:00:00Z' })
    expect(calls[0].name).toBe('admin_area_unlock')
    expect(calls[0].business).toBe(String(HQ))
    expect(calls[0].args.p_pin).toBe('1234568')
    // The connection, as an id that isn't the address.
    expect(calls[0].args.p_from).toMatch(/^[0-9a-f]{32}$/)
    expect(JSON.stringify(calls[0].args)).not.toContain('203.0.113.9')
  })

  it('a wrong PIN, or too many, in plain words', async () => {
    let res = await send('POST', '/api/admin-area/unlock', { pin: '1111' }, null)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'That isn’t the PIN' })
    res = await send('POST', '/api/admin-area/unlock', { pin: '9999' }, null)
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'Too many wrong PINs. Try again in 15 minutes.' })
    res = await send('POST', '/api/admin-area/unlock', {}, null)
    expect(res.status).toBe(400)
  })

  it('with no HQ, there is nothing to open', async () => {
    for (const b of db.table('business')) b.is_hq = false
    const res = await send('POST', '/api/admin-area/unlock', { pin: '1234568' }, null)
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'The admin area isn’t set up yet' })
  })

  it('nothing else opens without a good session', async () => {
    for (const token of [null, 'nonsense', 'b'.repeat(64)]) {
      const res = await get('/api/admin-area/sales', token)
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: 'Locked: type the PIN to open it again', locked: true })
    }
    expect((await send('POST', '/api/admin-area/sales/prospects', { name: 'X', phone: '600111222' }, null)).status).toBe(401)
    expect(db.tables.sales_prospects).toHaveLength(1)
  })

  it('locking ends the session; a new PIN needs the one in use', async () => {
    expect((await send('POST', '/api/admin-area/lock', {})).status).toBe(200)
    expect(calls.at(-1)).toMatchObject({ name: 'admin_area_lock', args: { p_token: TOKEN } })
    let res = await send('POST', '/api/admin-area/pin', { current: '0000', next: '4321' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'That isn’t the PIN in use now' })
    res = await send('POST', '/api/admin-area/pin', { current: '1234568', next: '12' })
    expect(await res.json()).toEqual({ error: 'The new PIN is 4 to 12 digits' })
    res = await send('POST', '/api/admin-area/pin', { current: '1234568', next: '4321' })
    expect(res.status).toBe(200)
  })
})

describe('the sales team’s board', () => {
  it('HQ’s team and businesses, nobody else’s', async () => {
    const res = await get('/api/admin-area/sales')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const board = await res.json() as { team: { name: string }[]; prospects: { name: string }[] }
    expect(board.team.map(m => m.name)).toEqual(['Maria Cortes', 'Julio Cesar'])
    expect(board.prospects.map(p => p.name)).toEqual(['The Bootes Cafe'])
  })

  it('a business added from its Instagram link: tidied, named from it, in the lane picked', async () => {
    const res = await send('POST', '/api/admin-area/sales/prospects', { instagram: 'https://www.instagram.com/roasted.spain/', member_id: JULIO })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ name: 'Roasted Spain', instagram: 'roasted.spain', stage: 'to_contact', member_id: JULIO })
    expect(db.tables.sales_prospects.at(-1)).toMatchObject({ business_id: HQ, instagram: 'roasted.spain' })
  })

  it('or from a phone number; what isn’t right is said, and nothing is kept', async () => {
    let res = await send('POST', '/api/admin-area/sales/prospects', { name: 'Café Lola', phone: '600 111 222', member_id: MARIA })
    expect(await res.json()).toMatchObject({ name: 'Café Lola', phone: '+34 600 111 222' })
    res = await send('POST', '/api/admin-area/sales/prospects', { name: 'Café Lola' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Add a way to reach them: Instagram, a phone number, an email or a website' })
    // Another business's salesperson isn't a lane here.
    res = await send('POST', '/api/admin-area/sales/prospects', { name: 'Bar Bea', phone: '600 333 444', member_id: '0b0e2f6c-1111-4c2d-8e3f-000000000099' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Choose someone on the sales team' })
    expect(db.tables.sales_prospects).toHaveLength(2)
  })

  it('moved to another stage and lane; taken off the board', async () => {
    let res = await send('PATCH', `/api/admin-area/sales/prospects/${BOOTES}`, { stage: 'demo', member_id: JULIO })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ stage: 'demo', member_id: JULIO, name: 'The Bootes Cafe' })
    res = await send('PATCH', `/api/admin-area/sales/prospects/${BOOTES}`, { stage: 'maybe' })
    expect(res.status).toBe(400)
    res = await send('PATCH', '/api/admin-area/sales/prospects/0b0e2f6c-2222-4c2d-8e3f-000000000404', { stage: 'won' })
    expect(res.status).toBe(404)
    expect((await send('DELETE', `/api/admin-area/sales/prospects/${BOOTES}`, {})).status).toBe(200)
    expect(db.tables.sales_prospects).toHaveLength(0)
  })

  it('someone joins the team at the end, is renamed, and leaves', async () => {
    let res = await send('POST', '/api/admin-area/sales/team', { name: '  Lola   Pérez ' })
    expect(await res.json()).toMatchObject({ name: 'Lola Pérez', position: 3 })
    expect((await send('POST', '/api/admin-area/sales/team', { name: ' ' })).status).toBe(400)
    res = await send('PATCH', `/api/admin-area/sales/team/${JULIO}`, { name: 'Julio César' })
    expect(await res.json()).toMatchObject({ id: JULIO, name: 'Julio César' })
    expect((await send('DELETE', `/api/admin-area/sales/team/${JULIO}`, {})).status).toBe(200)
    expect(db.tables.sales_team.map(m => m.name)).not.toContain('Julio César')
  })
})
