// Meta Ads and Google Ads, end to end through the Worker's routes, against stand-ins for Supabase,
// Google and Meta. What must never break:
//   - each shows "Connected" only once its ad accounts were read (and one is picked)
//   - the Ads page's figures are the platforms' own: money from micros and cents, results counted once
//   - changes go to the right campaign on the right platform, and only for admins with pay access
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { integrations } from './integrations'
import { ads } from './ads'
import { checkAll, explain, lasting } from './connections'
import { fromMicros, toMicros } from './providers/googleAds'
import { fromMinor, resultsOf } from './providers/metaAds'
import { serviceClient, type Env } from './supabase'
import { FakeSupabase } from './test/fakeSupabase'
import { FakeProviders } from './test/fakeProviders'
import type { AdsReport } from '../shared/ads'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key', GOOGLE_CLIENT_ID: 'google-id', GOOGLE_CLIENT_SECRET: 'google-secret', GOOGLE_ADS_DEVELOPER_TOKEN: 'dev-token',
  META_APP_ID: 'meta-app', META_APP_SECRET: 'meta-secret',
} as unknown as Env

let db: FakeSupabase
let apis: FakeProviders
const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext

beforeEach(() => {
  db = new FakeSupabase()
  apis = new FakeProviders()
  db.people.set('maria-token', { id: 'admin-2', role: 'admin' }) // an admin without pay access
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init) ?? apis.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => vi.unstubAllGlobals())

const headers = (token = 'admin-token') => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' })
const post = (app: typeof ads | typeof integrations, path: string, body: unknown = {}, token?: string, withEnv = env) =>
  app.request(`${APP}${path}`, { method: 'POST', headers: headers(token), body: JSON.stringify(body) }, withEnv, ctx())
const report = (from = '2026-09-28', to = '2026-09-30', token?: string) => ads.request(`${APP}/api/ads/report?from=${from}&to=${to}`, { headers: headers(token) }, env, ctx())

/** Google Ads: the one Google sign-in (adwords), back with a code. */
async function connectGoogleAds(withEnv = env) {
  const start = await post(integrations, '/api/integrations/connect/google_ads/start', {}, undefined, withEnv)
  if (start.status !== 200) return { start }
  const auth = new URL((await start.json() as { url: string }).url)
  const res = await integrations.request(`${APP}/api/integrations/google/callback?code=c&state=${encodeURIComponent(auth.searchParams.get('state')!)}`, {}, withEnv, ctx())
  return { start, auth, back: new URL(res.headers.get('location')!) }
}
/** Meta Ads: its own Facebook Login, back with a code. */
async function connectMetaAds() {
  const start = await post(integrations, '/api/integrations/meta_ads/start')
  const auth = new URL((await start.json() as { url: string }).url)
  const res = await integrations.request(`${APP}/api/integrations/meta_ads/callback?code=c&state=${encodeURIComponent(auth.searchParams.get('state')!)}`, {}, env, ctx())
  return { auth, back: new URL(res.headers.get('location')!) }
}

describe('Connecting ad platforms: "Connected" once the ad accounts were read', () => {
  it('Google Ads: asks for the adwords permission, finds the one ad account and uses it', async () => {
    const { auth, back } = await connectGoogleAds()
    expect(auth!.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/adwords openid email')
    expect(back!.searchParams.get('connected')).toBe('google_ads')
    const row = db.integration('google_ads')
    expect(row.status).toBe('connected')
    expect(row.account_label).toBe('Easy Beans Coffee')
    expect(row.external).toMatchObject({ account_id: '1112223333', currency: 'EUR' })
    expect(db.secret('google_ads')).toBeTruthy()
  })

  it('Google Ads: an account run through a manager is found under it, and read through it', async () => {
    apis.googleAds.accessible = ['9990001111']
    apis.googleAds.customers = { '9990001111': { name: 'Agency MCC', currency: 'EUR', manager: true, clients: ['1112223333'] },
      '1112223333': { name: 'Easy Beans Coffee', currency: 'EUR', manager: false } }
    await connectGoogleAds()
    expect(db.integration('google_ads').external).toMatchObject({ account_id: '1112223333', accounts: [{ id: '1112223333', login: '9990001111' }] })
    apis.googleAds.logins = []
    expect((await report()).status).toBe(200)
    expect(apis.googleAds.logins.every(l => l === '9990001111')).toBe(true)
  })

  it('Google Ads: without the developer token it needs setup, and says what is missing', async () => {
    const { start } = await connectGoogleAds({ ...env, GOOGLE_ADS_DEVELOPER_TOKEN: undefined } as Env)
    expect(start.status).toBe(400)
    expect((await start.json() as { error: string }).error).toMatch(/developer token/)
  })

  it('Google Ads: a token Google hasn’t approved yet is not connected, in plain words', async () => {
    apis.googleAds.unapproved = true
    const { back } = await connectGoogleAds()
    expect(back!.searchParams.get('connect_error')).toMatch(/Google hasn’t approved Business Agent’s Google Ads access/)
    expect(db.integration('google_ads').status).toBe('disconnected')
    expect(db.secret('google_ads')).toBeFalsy()
  })

  it('Meta Ads: its own sign-in with the ads permissions, the one ad account picked', async () => {
    const { auth, back } = await connectMetaAds()
    expect(auth.searchParams.get('scope')).toBe('ads_read,ads_management,business_management')
    expect(auth.searchParams.get('redirect_uri')).toBe(`${APP}/api/integrations/meta_ads/callback`)
    expect(back.searchParams.get('connected')).toBe('meta_ads')
    const row = db.integration('meta_ads')
    expect(row).toMatchObject({ status: 'connected', account_label: 'Easy Beans Coffee', external: { account_id: 'act_101', can_manage: true } })
    // The Facebook Page connection is a different one and stays as it was.
    expect(db.integration('facebook').status).toBe('disconnected')
  })

  it('Meta Ads: with several ad accounts it waits for the admin to pick one', async () => {
    apis.metaAds.accounts.push({ id: 'act_202', name: 'Deuce Padel', currency: 'EUR', account_status: 1 }, { id: 'act_303', name: 'Closed', currency: 'EUR', account_status: 101 })
    await connectMetaAds()
    expect(db.integration('meta_ads').status).toBe('pending')
    expect((db.integration('meta_ads').external as { accounts: unknown[] }).accounts).toHaveLength(2) // the closed one is left out
    expect((await post(ads, '/api/ads/meta_ads/account', { id: 'act_999' })).status).toBe(400)
    expect((await post(ads, '/api/ads/meta_ads/account', { id: 'act_202' })).status).toBe(200)
    expect(db.integration('meta_ads')).toMatchObject({ status: 'connected', account_label: 'Deuce Padel' })
  })

  it('Meta Ads: until Meta approves the app, outsiders can’t connect, and are told why', async () => {
    apis.metaAds.unapproved = true
    const { back } = await connectMetaAds()
    expect(back.searchParams.get('connect_error')).toMatch(/App Review/)
    expect(lasting('meta_ads', new Error(back.searchParams.get('connect_error')!))).toBe(true)
  })

  it('Meta Ads: reading only (ads_management left out) connects, but changes are refused', async () => {
    apis.facebook.granted = apis.facebook.granted.filter(p => p !== 'ads_management')
    await connectMetaAds()
    expect(db.integration('meta_ads').external).toMatchObject({ can_manage: false })
    const res = await post(ads, '/api/ads/meta_ads/campaigns/2381', { status: 'paused' })
    expect(res.status).toBe(403)
    expect(apis.metaAds.updates).toHaveLength(0)
  })

  it('nightly: the chosen ad account gone turns it red; Meta warns once before its 60 days run out', async () => {
    await connectMetaAds()
    apis.metaAds.accounts = []
    await checkAll(env, serviceClient(env), { retryAfterMs: 0 })
    expect(db.integration('meta_ads').status).toBe('error')
    expect(explain('google_ads', new Error('Google Ads: x (NOT_ADS_USER)'))).toMatch(/no Google Ads account/)
  })
})

describe('The Ads page’s figures and changes', () => {
  it('both platforms, money from micros and cents, results counted once each', async () => {
    await connectGoogleAds()
    await connectMetaAds()
    const res = await report()
    expect(res.status).toBe(200)
    const r = await res.json() as AdsReport
    const google = r.platforms.find(p => p.platform === 'google_ads')!
    const meta = r.platforms.find(p => p.platform === 'meta_ads')!
    expect(google.totals).toEqual({ spend: 6.57, impressions: 450, clicks: 29, results: 1.5 })
    expect(google.campaigns.find(c => c.id === '111')).toMatchObject({ status: 'active', daily_budget: 8, spend: 6.57 })
    expect(google.campaigns.find(c => c.id === '112')).toMatchObject({ status: 'paused', daily_budget: null }) // shared budget
    // Messaging conversations and the lead count; link clicks are the clicks figure, not results.
    expect(meta.totals).toEqual({ spend: 5.12, impressions: 920, clicks: 27, results: 4 })
    expect(meta.campaigns.map(c => c.id)).toEqual(['2381', '2382']) // archived left out
    expect(meta.campaigns[0]).toMatchObject({ daily_budget: 5, results: 4 })
    expect(meta.campaigns[1].daily_budget).toBeNull()
    expect(meta.days.map(d => d.date)).toEqual(['2026-09-28', '2026-09-29'])
  })

  it('pausing, resuming and daily budgets go to the platform', async () => {
    await connectGoogleAds()
    await connectMetaAds()
    expect((await post(ads, '/api/ads/meta_ads/campaigns/2381', { status: 'paused' })).status).toBe(200)
    expect((await post(ads, '/api/ads/meta_ads/campaigns/2381', { daily_budget: 7.5 })).status).toBe(200)
    expect(apis.metaAds.updates).toEqual([{ id: '2381', status: 'PAUSED' }, { id: '2381', daily_budget: '750' }])
    expect((await post(ads, '/api/ads/google_ads/campaigns/111', { status: 'paused' })).status).toBe(200)
    expect((await post(ads, '/api/ads/google_ads/campaigns/111', { daily_budget: 12 })).status).toBe(200)
    expect(apis.googleAds.campaigns[0]).toMatchObject({ status: 'PAUSED', amountMicros: '12000000' })
    // A shared budget would change other campaigns too: refused.
    const shared = await post(ads, '/api/ads/google_ads/campaigns/112', { daily_budget: 5 })
    expect(shared.status).toBe(400)
    expect((await shared.json() as { error: string }).error).toMatch(/shares its budget/)
  })

  it('refuses nonsense: unknown platform, odd ids, budgets out of range, nothing to change', async () => {
    await connectMetaAds()
    expect((await post(ads, '/api/ads/tiktok_ads/campaigns/1', { status: 'paused' })).status).toBe(404)
    expect((await post(ads, '/api/ads/meta_ads/campaigns/act_101', { status: 'paused' })).status).toBe(404)
    expect((await post(ads, '/api/ads/meta_ads/campaigns/2381', { daily_budget: 0.5 })).status).toBe(400)
    expect((await post(ads, '/api/ads/meta_ads/campaigns/2381', { status: 'deleted' })).status).toBe(400)
    expect((await post(ads, '/api/ads/meta_ads/campaigns/2381', {})).status).toBe(400)
    expect((await report('2026-09-30', '2026-09-28')).status).toBe(400)
  })

  it('only admins with pay access see or change ads', async () => {
    await connectMetaAds()
    expect((await report(undefined, undefined, 'staff-token')).status).toBe(403)
    expect((await report(undefined, undefined, 'maria-token')).status).toBe(403)
    expect((await post(ads, '/api/ads/meta_ads/campaigns/2381', { status: 'paused' }, 'maria-token')).status).toBe(403)
    expect(apis.metaAds.updates).toHaveLength(0)
  })

  it('nothing connected says where to connect; one platform failing leaves the other showing', async () => {
    expect((await (await report()).json() as { error: string }).error).toMatch(/Connect Meta Ads or Google Ads/)
    await connectGoogleAds()
    await connectMetaAds()
    apis.metaAds.unapproved = true
    const r = await (await report()).json() as AdsReport
    expect(r.platforms.map(p => p.platform)).toEqual(['google_ads'])
    expect(r.failed?.[0]).toMatchObject({ platform: 'meta_ads' })
    expect(db.integration('meta_ads').status).toBe('error')
  })
})

describe('Units', () => {
  it('Google micros and Meta cents to money; Meta results are purchases, leads and conversations', () => {
    expect(fromMicros('4560000')).toBe(4.56)
    expect(toMicros(12.345)).toBe('12350000')
    expect(fromMinor('500')).toBe(5)
    expect(fromMinor(undefined)).toBeNull()
    expect(resultsOf([{ action_type: 'purchase', value: '2' }, { action_type: 'link_click', value: '40' }, { action_type: 'post_engagement', value: '90' },
      { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '1' }])).toBe(3)
  })
})
