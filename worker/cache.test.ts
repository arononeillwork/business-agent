// What's kept from outside services (provider_cache): asked again only once it's old enough, never a
// failure kept, and forgotten by prefix after a change made here.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cached, clearOldCache, forget, oldest } from './cache'
import { businessDb, type Env } from './supabase'
import { FakeSupabase } from './test/fakeSupabase'

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test' } as unknown as Env
let db: FakeSupabase

beforeEach(() => {
  db = new FakeSupabase()
  db.tables.provider_cache = []
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
    db.handle(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, init) ?? new Response('{}', { status: 404 })))
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.parse('2026-10-01T10:00:00Z'))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('provider_cache', () => {
  it('asks the service again only once the answer is old enough, and says when it last asked', async () => {
    const sb = businessDb(env, 1)
    let asked = 0
    const read = async () => ({ n: ++asked })
    expect(await cached(sb, 'sales:square:a:b', 15, read)).toEqual({ data: { n: 1 }, fetched_at: '2026-10-01T10:00:00.000Z' })
    vi.setSystemTime(Date.parse('2026-10-01T10:14:00Z'))
    expect(await cached(sb, 'sales:square:a:b', 15, read)).toEqual({ data: { n: 1 }, fetched_at: '2026-10-01T10:00:00.000Z' })
    expect(await cached(sb, 'sales:square:c:d', 15, read)).toMatchObject({ data: { n: 2 } }) // another period, its own answer
    vi.setSystemTime(Date.parse('2026-10-01T10:15:00Z'))
    expect(await cached(sb, 'sales:square:a:b', 15, read)).toEqual({ data: { n: 3 }, fetched_at: '2026-10-01T10:15:00.000Z' })
  })

  it('keeps no failure: the next look asks again', async () => {
    const sb = businessDb(env, 1)
    await expect(cached(sb, 'ads:meta_ads:a:b', 60, async () => { throw new Error('Meta is down') })).rejects.toThrow('Meta is down')
    expect(db.tables.provider_cache).toEqual([])
    expect((await cached(sb, 'ads:meta_ads:a:b', 60, async () => 'ok')).data).toBe('ok')
  })

  it('can keep an answer as long as the answer itself says', async () => {
    const sb = businessDb(env, 1)
    const keep = (kept: { feed: string }) => (kept.feed === 'places' ? 180 : 60)
    await cached(sb, 'reviews', keep, async () => ({ feed: 'places' }))
    vi.setSystemTime(Date.parse('2026-10-01T12:00:00Z'))
    expect((await cached(sb, 'reviews', keep, async () => ({ feed: 'business_profile' }))).data).toEqual({ feed: 'places' })
    vi.setSystemTime(Date.parse('2026-10-01T13:00:00Z'))
    expect((await cached(sb, 'reviews', keep, async () => ({ feed: 'business_profile' }))).data).toEqual({ feed: 'business_profile' })
  })

  it('forgets by prefix (taken as written), and clears what is over two days old', async () => {
    const sb = businessDb(env, 1)
    for (const key of ['ads:meta_ads:a:b', 'ads:meta_adsX:a:b', 'ads:google_ads:a:b', 'loyalty:a:b']) await cached(sb, key, 60, async () => key)
    await forget(sb, 'ads:meta_ads:')
    expect(db.tables.provider_cache.map(r => r.key).sort()).toEqual(['ads:google_ads:a:b', 'ads:meta_adsX:a:b', 'loyalty:a:b'])
    vi.setSystemTime(Date.parse('2026-10-03T10:00:01Z'))
    await cached(sb, 'search:site:a:b', 360, async () => 'new')
    await clearOldCache(sb)
    expect(db.tables.provider_cache.map(r => r.key)).toEqual(['search:site:a:b'])
  })

  it('a page built from several answers is as up to date as the oldest', () => {
    expect(oldest(['2026-10-01T10:05:00Z', '2026-10-01T09:50:00Z'])).toBe('2026-10-01T09:50:00Z')
    expect(oldest([])).toBeUndefined()
  })
})
