// Referral links, end to end through the Worker against a stand-in Supabase: the code must be this
// business's, joining takes short plain fields, and nobody learns who else has joined.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { referrals } from './referrals'
import { FakeSupabase } from './test/fakeSupabase'
import type { Env } from './supabase'

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test' } as unknown as Env
let db: FakeSupabase

beforeEach(() => {
  db = new FakeSupabase()
  Object.assign(db.table('business')[0], { name: 'Easy Beans', referral_code: 'AB12CD34' })
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${url}`)
    return res
  }))
})
afterEach(() => vi.unstubAllGlobals())

const post = (path: string, body: unknown) =>
  referrals.request(`https://app.test${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, env)

describe('Referral links', () => {
  it('opening a valid link is counted and says who invited you; any case works', async () => {
    const res = await post('/api/referrals/open', { code: 'ab12cd34' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ business: 'Easy Beans' })
    expect(db.table('referral_opens')).toHaveLength(1)
    // The same visit, page opened again: still says who, not counted again.
    expect(await (await post('/api/referrals/open', { code: 'AB12CD34', count: false })).json()).toEqual({ business: 'Easy Beans' })
    expect(db.table('referral_opens')).toHaveLength(1)
  })

  it('a wrong or odd code is refused and not counted', async () => {
    for (const code of ['ZZZZ9999', '<script>', '', 42]) expect((await post('/api/referrals/open', { code })).status).toBe(404)
    expect(db.table('referral_opens')).toHaveLength(0)
    expect((await post('/api/referrals/join', { code: 'ZZZZ9999', business_name: 'X', email: 'x@y.test' })).status).toBe(404)
  })

  it('joining keeps the business, the name and the email (trimmed, lower case)', async () => {
    const res = await post('/api/referrals/join', { code: 'AB12CD34', business_name: '  La Tostadora ', contact_name: ' Pepa ', email: ' Pepa@Tostadora.TEST ' })
    expect(res.status).toBe(200)
    expect(db.table('referrals')).toEqual([expect.objectContaining({ business_name: 'La Tostadora', contact_name: 'Pepa', email: 'pepa@tostadora.test' })])
  })

  it('joining twice says yes both times and keeps one', async () => {
    const join = () => post('/api/referrals/join', { code: 'AB12CD34', business_name: 'La Tostadora', email: 'pepa@tostadora.test' })
    expect((await join()).status).toBe(200)
    expect((await join()).status).toBe(200)
    expect(db.table('referrals')).toHaveLength(1)
  })

  it('missing or too long fields are refused', async () => {
    const base = { code: 'AB12CD34', business_name: 'Café', email: 'a@b.test' }
    expect((await post('/api/referrals/join', { ...base, business_name: '  ' })).status).toBe(400)
    expect((await post('/api/referrals/join', { ...base, business_name: 'x'.repeat(121) })).status).toBe(400)
    expect((await post('/api/referrals/join', { ...base, email: 'not an email' })).status).toBe(400)
    expect((await post('/api/referrals/join', { ...base, contact_name: 'x'.repeat(121) })).status).toBe(400)
    expect(db.table('referrals')).toHaveLength(0)
  })
})
