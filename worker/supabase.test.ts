import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { businessDb, businessIdOf, joinBusiness, ownsSecretAccounts, secretPlaceId, serviceClient, userClient, type Env } from './supabase'

const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' } as Env

afterEach(() => vi.unstubAllGlobals())

describe('userClient', () => {
  it('sends the person\'s token exactly once, for auth and data calls', async () => {
    const seen: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get('authorization') ?? '')
      return new Response(JSON.stringify({ id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' }),
        { status: 200, headers: { 'content-type': 'application/json' } })
    }))
    const sb = userClient(env, 'user-jwt', 'ai')
    await sb.auth.getUser('user-jwt')
    await sb.from('profiles').select('id')
    expect(seen).toEqual(['Bearer user-jwt', 'Bearer user-jwt'])
  })
})

// The Worker acting for one business (businessDb): the service role skips row security, so every read,
// change and delete it makes is filtered to that business's rows, and what it writes is that business's.
const serviceEnv = { SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test',
  GOOGLE_PLACE_ID: 'ChIJ-easy-beans' } as unknown as Env

let sent: { method: string; url: URL; business: string | null; body: unknown }[]
const capture = () => {
  sent = []
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    sent.push({ method: init?.method ?? 'GET', url, business: new Headers(init?.headers).get('x-business-id'), body: init?.body ? JSON.parse(String(init.body)) : null })
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
  }))
}

const last = () => sent.at(-1)!

describe('businessDb: the Worker acting for one business', () => {
  beforeEach(capture)

  it('reads, changes and deletes only that business’s rows, and names it to the database', async () => {
    const db = businessDb(serviceEnv, 7)
    await db.from('integrations').select('provider').eq('status', 'connected')
    expect(last().url.searchParams.get('business_id')).toBe('eq.7')
    expect(last().url.searchParams.get('status')).toBe('eq.connected')
    expect(last().business).toBe('7')

    await db.from('settings').update({ menu_source: 'square' }).eq('id', 1)
    expect(last().method).toBe('PATCH')
    expect(last().url.searchParams.get('business_id')).toBe('eq.7')
    expect(last().url.searchParams.get('id')).toBe('eq.1')

    await db.from('provider_cache').delete().like('key', 'sales:%')
    expect(last().method).toBe('DELETE')
    expect(last().url.searchParams.get('business_id')).toBe('eq.7')

    // A count is a read too.
    await db.from('profiles').select('id', { count: 'exact', head: true })
    expect(last().url.searchParams.get('business_id')).toBe('eq.7')
  })

  it('writes for that business: the database fills business_id in from the header', async () => {
    const db = businessDb(serviceEnv, 7)
    await db.from('outbox').insert({ kind: 'email', payload: {} })
    expect(last()).toMatchObject({ method: 'POST', business: '7', body: { kind: 'email', payload: {} } })
    expect(last().url.searchParams.get('business_id')).toBeNull()
    await db.rpc('claim_outbox', { p_limit: 25 })
    expect(last()).toMatchObject({ method: 'POST', business: '7' })
  })

  it('the business row is the business itself; the plans are everyone’s', async () => {
    const db = businessDb(serviceEnv, 7)
    await db.from('business').select('name')
    expect(last().url.searchParams.get('id')).toBe('eq.7')
    expect(last().url.searchParams.get('business_id')).toBeNull()
    await db.from('plan_limits').select('*')
    expect([...last().url.searchParams.keys()]).toEqual(['select'])
  })

  it('says which business it acts for; only one is given Business Agent’s own accounts', () => {
    expect(businessIdOf(businessDb(serviceEnv, 7))).toBe(7)
    expect(businessIdOf(serviceClient(serviceEnv))).toBeNull()
    expect(ownsSecretAccounts(businessDb(serviceEnv, 1))).toBe(true)
    expect(ownsSecretAccounts(businessDb(serviceEnv, 7))).toBe(false)
    expect(secretPlaceId(serviceEnv, businessDb(serviceEnv, 1))).toBe('ChIJ-easy-beans')
    expect(secretPlaceId(serviceEnv, businessDb(serviceEnv, 7))).toBeUndefined()
  })

  it('refuses to act for no business', () => {
    expect(() => businessDb(serviceEnv, 0)).toThrow('No business')
    expect(() => businessDb(serviceEnv, NaN)).toThrow('No business')
  })

  it('puts someone into a business only if they’re in none (or already in it)', async () => {
    await joinBusiness(serviceEnv, 'u1', 7, { role: 'employee', active: true })
    expect(last()).toMatchObject({ method: 'PATCH', business: '7', body: { role: 'employee', active: true, business_id: 7 } })
    expect(last().url.searchParams.get('id')).toBe('eq.u1')
    expect(last().url.searchParams.get('or')).toBe('(business_id.is.null,business_id.eq.7)')
  })
})
