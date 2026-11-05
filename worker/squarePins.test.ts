// Square PINs through the Worker's routes, against a stand-in for Supabase. What must never break:
//   - owners (admins with pay access) see and change everyone's PIN; anyone else on the team sees only theirs
//   - a shop manager (an admin without pay access) is "anyone else": their own only, and changes none
//   - the PIN is stored encrypted, and the audit log says who looked or changed whose, never the PIN
//   - partners and people outside the team get nothing
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { squarePins } from './squarePins'
import type { Env } from './supabase'
import { FakeSupabase } from './test/fakeSupabase'
import type { SquarePins } from '../shared/squarePins'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key',
} as unknown as Env

let db: FakeSupabase
const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext

beforeEach(() => {
  db = new FakeSupabase()
  db.people.set('manager-token', { id: 'admin-2', role: 'admin' }) // Maria: a shop manager (an admin without pay access)
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => vi.unstubAllGlobals())

const as = (token: string) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' })
const call = (path: string, token: string, init: RequestInit = {}) => squarePins.request(`${APP}${path}`, { ...init, headers: as(token) }, env, ctx())
const save = (id: string, pin: string | null, token = 'admin-token') => call(`/api/square-pins/${id}`, token, { method: 'PUT', body: JSON.stringify({ pin }) })
const show = (id: string, token: string) => call(`/api/square-pins/${id}/show`, token, { method: 'POST', body: '{}' })
const list = async (token: string) => (await (await call('/api/square-pins', token)).json()) as SquarePins

describe('Square PINs', () => {
  it('an owner saves everyone’s, sees them all and changes them; the PIN is kept encrypted', async () => {
    expect((await save('staff-1', ' 52 86 ')).status).toBe(200)
    expect((await save('admin-2', '7390')).status).toBe(200)
    const pins = await list('admin-token')
    expect(pins.owner).toBe(true)
    expect(pins.people.map(p => [p.profile_id, p.set])).toEqual([['admin-1', false], ['admin-2', true], ['staff-1', true]])

    const row = db.table('square_pins').find(r => r.profile_id === 'staff-1')!
    expect(String(row.ciphertext)).not.toContain('5286')
    expect(row.updated_by).toBe('admin-1')
    const res = await show('staff-1', 'admin-token')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ pin: '5286' })

    // Changed, then taken away.
    await save('staff-1', '1199')
    expect(await (await show('staff-1', 'admin-token')).json()).toEqual({ pin: '1199' })
    expect((await save('staff-1', null)).status).toBe(200)
    expect((await show('staff-1', 'admin-token')).status).toBe(404)
  })

  it('anyone else on the team sees only their own, and changes none', async () => {
    await save('staff-1', '5286')
    await save('admin-2', '7390')
    const mine = await list('staff-token')
    expect(mine).toEqual({ owner: false, people: [{ profile_id: 'staff-1', set: true, updated_at: expect.any(String) }] })
    expect(await (await show('staff-1', 'staff-token')).json()).toEqual({ pin: '5286' })
    const other = await show('admin-2', 'staff-token')
    expect(other.status).toBe(403)
    expect(await other.json()).toEqual({ error: 'You can see only your own Square PIN' })
    expect((await save('staff-1', '0000', 'staff-token')).status).toBe(403)

    // A shop manager too: their own, nobody else's, and no changes.
    expect((await list('manager-token')).people.map(p => p.profile_id)).toEqual(['admin-2'])
    expect((await show('staff-1', 'manager-token')).status).toBe(403)
    expect((await save('admin-2', '1111', 'manager-token')).status).toBe(403)
    expect(await (await show('admin-2', 'admin-token')).json()).toEqual({ pin: '7390' })
  })

  it('takes 4 to 6 digits, and only for someone on the team', async () => {
    expect(await (await save('staff-1', '12a4')).json()).toEqual({ error: 'A Square PIN is digits only' })
    expect(await (await save('staff-1', '123')).json()).toEqual({ error: 'A Square PIN is 4 digits (up to 6)' })
    expect(await (await save('staff-1', '1234567')).json()).toEqual({ error: 'A Square PIN is 4 digits (up to 6)' })
    expect((await save('admin-gone', '1234')).status).toBe(404)
    expect((await save('nobody', '1234')).status).toBe(404)
    expect(db.table('square_pins')).toHaveLength(0)
  })

  it('the audit log says who saved, looked at or removed whose PIN, never the PIN', async () => {
    await save('staff-1', '5286')
    await show('staff-1', 'staff-token')
    await save('staff-1', null)
    const log = db.table('audit_log').filter(r => r.table_name === 'square_pins')
    expect(log.map(r => [r.actor, r.row_id, r.action])).toEqual([['admin-1', 'staff-1', 'set'], ['staff-1', 'staff-1', 'show'], ['admin-1', 'staff-1', 'clear']])
    expect(JSON.stringify(log)).not.toContain('5286')
  })

  it('needs someone signed in and on the team', async () => {
    expect((await squarePins.request(`${APP}/api/square-pins`, {}, env, ctx())).status).toBe(401)
    db.table('profiles').push({ id: 'partner-1', full_name: 'Gestoría', role: 'partner', active: true })
    db.people.set('partner-token', { id: 'partner-1', role: 'partner' as 'admin' })
    expect((await call('/api/square-pins', 'partner-token')).status).toBe(403)
  })
})
