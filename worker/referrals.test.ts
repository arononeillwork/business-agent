// Referral links, end to end through the Worker against a stand-in Supabase: the code must be this
// business's, and an open is counted once per visit.
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
  })
})

describe('A Business Agent rep’s code (the hq_reps migration)', () => {
  it('not a business’s code: the rep it is, with what their cards offer; counted as asked', async () => {
    const asked: unknown[] = []
    db.rpcs.rep_by_code = args => { asked.push(args); return args.p_code === 'JULIO27' ? { name: 'Julio', categories: ['cafe'], offer: 'Your first month free' } : null }
    const res = await post('/api/referrals/open', { code: 'julio27' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ rep: { name: 'Julio', categories: ['cafe'], offer: 'Your first month free' } })
    await post('/api/referrals/open', { code: 'JULIO27', count: false })
    expect(asked).toEqual([{ p_code: 'JULIO27', p_count: true }, { p_code: 'JULIO27', p_count: false }])
    expect(db.table('referral_opens')).toHaveLength(0)
  })

  it('a business’s code still wins, and a code that’s neither is refused', async () => {
    db.rpcs.rep_by_code = () => ({ name: 'Someone', categories: [], offer: null })
    expect(await (await post('/api/referrals/open', { code: 'AB12CD34' })).json()).toEqual({ business: 'Easy Beans' })
    db.rpcs.rep_by_code = () => null
    expect((await post('/api/referrals/open', { code: 'NOPE99' })).status).toBe(404)
  })
})
