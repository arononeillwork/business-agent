// User analytics (worker/usage.ts): the app's reports of the time spent on each page, kept as the person who sent
// them in their own business, with the device from their browser and the town from Cloudflare. What must never
// break:
//   - only someone signed in reports, only from the app itself, a few a minute, small and cleaned
//   - it's kept for the business they're in (x-business-id), as them, never as anyone they name
//   - the connection's address isn't kept, only the town, region and country
//   - visits go after a year, a business's own only
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REPORTS_A_MINUTE, clearOldUsage, forgetUsageReports, placeOf, usage } from './usage'
import { businessDb, type Env } from './supabase'
import { FakeSupabase, type Row } from './test/fakeSupabase'
import { MAX_REPORT_BYTES } from '../shared/usage'
import { forgetErrorReports } from './errors'

const APP = 'https://app.test'
const env = { SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test' } as unknown as Env
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'
const VISIT = '6f1d3c2a-8b4e-4f7a-9c1d-2e3f4a5b6c7d'

let db: FakeSupabase
let kept: { args: Row; business: string | null }[]
/** What the route left running after answering (ctx.waitUntil): HQ's error report. */
let background: Promise<unknown>[]
const ctx = () => ({ waitUntil: (p: Promise<unknown>) => { background.push(p) }, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext
let clock = 0
/** Supabase not answering at all (an outage), or only keeping reports failing. */
let down: 'all' | 'record' | null = null

beforeEach(() => {
  db = new FakeSupabase()
  kept = []
  background = []
  clock = Date.now()
  down = null
  forgetUsageReports(() => clock)
  forgetErrorReports(() => clock)
  // Someone in another business, to show each is kept as their own.
  db.table('profiles').push({ id: 'dos-1', full_name: 'Pepe', email: 'pepe@dos.test', role: 'employee', active: true, business_id: 2 })
  db.people.set('dos-token', { id: 'dos-1', role: 'employee' })
  db.rpcs.record_usage = () => true
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (down === 'all' && !url.endsWith('/rest/v1/rpc/record_app_error')) return new Response('upstream connect error', { status: 503 })
    if (down === 'record' && url.endsWith('/rest/v1/rpc/record_usage')) return Response.json({ message: 'canceling statement due to statement timeout' }, { status: 500 })
    if (url.endsWith('/rest/v1/rpc/record_usage')) {
      kept.push({ args: JSON.parse(String(init?.body)) as Row, business: new Headers(init?.headers).get('x-business-id') })
    }
    const res = db.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const send = (body: unknown, headers: Record<string, string> = {}) => usage.request(`${APP}/api/usage`, {
  method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
  headers: {
    'content-type': 'application/json', origin: APP, authorization: 'Bearer staff-token', 'user-agent': IPHONE,
    'cf-connecting-ip': '203.0.113.7', 'cf-ipcity': 'San Pedro de Alcántara', 'cf-region': 'Andalusia', 'cf-ipcountry': 'ES', ...headers,
  },
}, env, ctx())
const report = { visit: VISIT, installed: true, touch: true, pages: [{ page: 'rules', views: 1, seconds: 125 }, { page: 'rota', views: 1, seconds: 0 }] }

describe('the app’s usage reports', () => {
  it('keeps one as the person who sent it, in their business, with their device and town, not their address', async () => {
    expect((await send(report)).status).toBe(204)
    expect(kept).toEqual([{ business: '1', args: {
      p_profile: 'staff-1', p_visit: VISIT, p_device: 'phone', p_os: 'iOS', p_browser: 'Safari', p_installed: true,
      p_city: 'San Pedro de Alcántara', p_region: 'Andalusia', p_country: 'ES', p_pages: report.pages,
    } }])
    expect(JSON.stringify(kept)).not.toContain('203.0.113.7')

    expect((await send({ ...report, visit: VISIT.replace('6f', '7a') }, { authorization: 'Bearer dos-token', 'cf-ipcountry': 'XX' })).status).toBe(204)
    expect(kept[1]).toMatchObject({ business: '2', args: { p_profile: 'dos-1', p_country: null } })
  })

  it('takes nobody’s word for whose it is', async () => {
    expect((await send({ ...report, profile: 'admin-1', p_profile: 'admin-1' })).status).toBe(204)
    expect(kept[0].args.p_profile).toBe('staff-1')
  })

  it('cleans what it’s sent, and turns away what isn’t a report', async () => {
    expect((await send({ ...report, pages: [{ page: 'rules', views: 1, seconds: 1e9 }, { page: '../hq', views: 1, seconds: 5 }] })).status).toBe(204)
    expect(kept[0].args.p_pages).toEqual([{ page: 'rules', views: 1, seconds: 3600 }])
    expect((await send('not json')).status).toBe(400)
    expect((await send({ visit: 'nope', pages: [] })).status).toBe(400)
    expect((await send({ ...report, pages: [{ page: 'x'.repeat(MAX_REPORT_BYTES), views: 1, seconds: 1 }] })).status).toBe(413)
    expect(kept).toHaveLength(1)
  })

  it('is only for someone signed in, from the app itself', async () => {
    expect((await send(report, { authorization: '' })).status).toBe(401)
    expect((await send(report, { authorization: 'Bearer nobody' })).status).toBe(401)
    expect((await send(report, { origin: 'https://elsewhere.test' })).status).toBe(403)
    expect((await send(report, { origin: '', 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect(kept).toEqual([])
  })

  it('says to try again when Supabase can’t say who it is (an outage), so the app keeps the report', async () => {
    down = 'all'
    const res = await send(report)
    expect(res.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('60')
    expect(kept).toEqual([])
    // Back up: the same report is kept.
    down = null
    expect((await send(report)).status).toBe(204)
    expect(kept).toHaveLength(1)
  })

  it('tells HQ when a report can’t be kept, and says so to the app', async () => {
    down = 'record'
    expect((await send(report)).status).toBe(502)
    // The report to HQ goes on after the answer: wait for it, however long the machine takes.
    expect(background).toHaveLength(1)
    await Promise.all(background)
    expect(db.table('app_errors')).toEqual([expect.objectContaining({ source: 'usage: keeping a report', business_id: 1, user_id: 'staff-1', last_path: '/api/usage' })])
  })

  it(`takes ${REPORTS_A_MINUTE} a minute from one person`, async () => {
    for (let i = 0; i < REPORTS_A_MINUTE; i++) expect((await send(report)).status).toBe(204)
    expect((await send(report)).status).toBe(429)
    // Someone else still can.
    expect((await send(report, { authorization: 'Bearer dos-token' })).status).toBe(204)
    clock += 60_000
    expect((await send(report)).status).toBe(204)
  })
})

describe('where a request comes from', () => {
  it('is Cloudflare’s place for it, or its headers where there isn’t one', () => {
    const req = new Request(APP, { headers: { 'cf-ipcity': 'Dublin', 'cf-ipcountry': 'ie' } })
    expect(placeOf(req)).toEqual({ city: 'Dublin', region: null, country: 'IE' })
    Object.defineProperty(req, 'cf', { value: { city: 'Marbella', region: 'Andalusia', country: 'ES' } })
    expect(placeOf(req)).toEqual({ city: 'Marbella', region: 'Andalusia', country: 'ES' })
    expect(placeOf(new Request(APP, { headers: { 'cf-ipcountry': 'T1' } })).country).toBeNull()
  })
})

describe('nightly', () => {
  it('clears a business’s visits older than a year, and nobody else’s', async () => {
    const day = 86_400_000
    const now = Date.UTC(2026, 10, 15)
    db.table('usage_visits').push(
      { id: 'old', business_id: 1, started_at: new Date(now - 366 * day).toISOString() },
      { id: 'recent', business_id: 1, started_at: new Date(now - 300 * day).toISOString() },
      { id: 'old-dos', business_id: 2, started_at: new Date(now - 400 * day).toISOString() },
    )
    await clearOldUsage(businessDb(env, 1), now)
    expect(db.table('usage_visits').map(v => v.id)).toEqual(['recent', 'old-dos'])
  })
})
