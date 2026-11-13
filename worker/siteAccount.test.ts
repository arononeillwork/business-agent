// Accounts & rewards on the business's own website (worker/siteAccount.ts), through the Worker against
// stand-ins for Supabase and Square. The database's side (who is matched, what's kept on erasing, the
// balance being the rep page's) is proven in supabase/tests/zzzzzzzzzzzzzzz_site_accounts.test.sql. What
// must never break here:
//   - only the website's server: no key or a wrong one (another business's too) is 401, browsers get no
//     CORS headers on any answer, and OPTIONS (or anything but POST) is refused
//   - off, or a number that's no business, is the same 404; email_verified must be true (403); a bad body 400
//   - the email is trimmed and lowercased, never in the address, a log line or an error kept for HQ
//   - points come from Square Loyalty for that one customer, kept a while; none when Square isn't the
//     till, without the programme or an account, and the rest of the summary still comes
//   - so many calls a minute per business, then 429
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { siteAccount, forgetSiteAccountCalls, REQUESTS_A_MINUTE } from './siteAccount'
import { integrations } from './integrations'
import { forgetErrorReports } from './errors'
import type { Env } from './supabase'
import { FakeSupabase, type Row } from './test/fakeSupabase'
import { FakeProviders } from './test/fakeProviders'
import type { SiteAccountSummary, SummaryRow } from '../shared/siteAccount'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key', SQUARE_APP_ID: 'sq-app', SQUARE_APP_SECRET: 'sq-secret', SQUARE_WEBHOOK_SIGNATURE_KEY: 'sq-hook-key',
} as unknown as Env
const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext

const KEY_1 = 'nl_business1websitekey000000000000000000000'
const KEY_2 = 'nl_business2websitekey000000000000000000000'
const ANA = 'ana@example.com'
const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('')

let db: FakeSupabase
let apis: FakeProviders
/** Each call to the site_account_* functions: its arguments and how the audit log will say it was made. */
let calls: { fn: string; args: Row; via: string | null }[]
let summary: SummaryRow
let errorsKept: Row[]
let logged: string[]

beforeEach(async () => {
  forgetSiteAccountCalls()
  forgetErrorReports()
  db = new FakeSupabase()
  apis = new FakeProviders()
  calls = []
  errorsKept = []
  logged = []
  db.tables.business = [{ id: 1, name: 'Easy Beans Coffee', country: 'ES' }, { id: 2, name: 'Bar Dos', country: 'IE' }]
  db.tables.settings = [{ id: 1, business_id: 1, website_accounts: true }, { id: 1, business_id: 2, website_accounts: true }]
  db.tables.newsletter = [
    { id: 1, business_id: 1, enabled: false, key_hash: await sha256(KEY_1) },
    { id: 1, business_id: 2, enabled: true, key_hash: await sha256(KEY_2) },
  ]
  summary = {
    customer: { id: 'c-ana', first_name: 'Ana' }, square_customer_id: 'SQC1',
    credit: { balance: 1.25, pending: 0.4, gift_card_linked: true, lines: [
      { date: '2026-07-11', label: 'Cashback for a post', amount: 0.47, status: 'approved', note: '863 views · 20 likes' },
    ] },
    cashback: { on: true, per_1000_views: 0.5, per_100_likes: 0.2, per_follower: 0.1, max: 15 },
    rep: { code: 'NATASH15', kind: 'customer', reach: 0, boost_by_reach: true, crew_members: 0, this_month: 0.47 },
  }
  db.rpcs.site_account_sync = a => ({ customer_id: 'c-ana', created: true, is_rep: false, ignored: a.p_square_id === 'TAKEN' ? ['square_customer_id'] : [] })
  db.rpcs.site_account_summary = a => (a.p_email === ANA ? summary : { customer: null })
  db.rpcs.site_account_erase = () => ({ found: true, kept: 'ledger', square_ids: ['SQC1'] })
  db.rpcs.record_app_error = a => { errorsKept.push(a); return true }
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, level).mockImplementation((...a: unknown[]) => { logged.push(a.map(x => (x instanceof Error ? `${x.message} ${x.stack}` : typeof x === 'string' ? x : JSON.stringify(x))).join(' ')) })
  }
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const fn = url.match(/\/rest\/v1\/rpc\/(site_account_\w+)$/)?.[1]
    if (fn) calls.push({ fn, args: JSON.parse(String(init?.body ?? '{}')) as Row, via: new Headers(init?.headers).get('x-app-via') })
    const res = db.handle(url, init) ?? apis.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

const call = (path: string, init: RequestInit = {}) => siteAccount.request(`${APP}${path}`, init, env, ctx())
const post = (path: string, body: unknown, key: string | null = KEY_1) => call(path, {
  method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body),
})
const who = (more: Row = {}) => ({ email: ANA, email_verified: true, ...more })
const noCors = (res: Response) => expect([...res.headers.keys()].filter(h => h.startsWith('access-control-'))).toEqual([])

async function connectSquare() {
  const as = { authorization: 'Bearer admin-token', 'content-type': 'application/json' }
  const start = await integrations.request(`${APP}/api/integrations/square/start`, { method: 'POST', headers: as, body: '{}' }, env, ctx())
  const state = new URL((await start.json() as { url: string }).url).searchParams.get('state')!
  const res = await integrations.request(`${APP}/api/integrations/square/callback?code=c&state=${encodeURIComponent(state)}`, {}, env, ctx())
  expect(new URL(res.headers.get('location')!).searchParams.get('connected')).toBe('square')
}

describe('who may call', () => {
  it('needs the business’s website key: none, a wrong one or another business’s is 401, with no CORS header', async () => {
    for (const action of ['sync', 'summary', 'erase']) {
      for (const key of [null, 'nl_wrong', KEY_2]) {
        const res = await post(`/api/site/1/account/${action}`, who(), key)
        expect(res.status, `${action} ${key}`).toBe(401)
        noCors(res)
      }
      const ok = await post(`/api/site/1/account/${action}`, who())
      expect(ok.status, action).toBe(200)
      noCors(ok)
      expect(ok.headers.get('cache-control')).toBe('no-store')
    }
    // Business 2's own key reads business 2 only.
    expect((await post('/api/site/2/account/summary', who(), KEY_2)).status).toBe(200)
    expect(calls.filter(c => c.fn === 'site_account_summary').map(c => c.args.p_business)).toEqual([1, 2])
  })

  it('a business without a key yet turns every key away', async () => {
    db.table('newsletter').find(r => r.business_id === 1)!.key_hash = null
    expect((await post('/api/site/1/account/summary', who())).status).toBe(401)
  })

  it('refuses browsers: OPTIONS and anything but POST are 405, with no CORS header', async () => {
    for (const method of ['OPTIONS', 'GET', 'PUT', 'DELETE']) {
      const res = await call('/api/site/1/account/summary', { method, headers: { origin: 'https://www.easybeanscoffee.com', 'access-control-request-method': 'POST' } })
      expect(res.status, method).toBe(405)
      expect(res.headers.get('allow')).toBe('POST')
      noCors(res)
    }
  })

  it('answers off, or a number that’s no business, with the same 404', async () => {
    db.table('settings').find(r => r.business_id === 1)!.website_accounts = false
    const answers = []
    for (const path of ['/api/site/1/account/summary', '/api/site/7/account/summary', '/api/site/0/account/summary', '/api/site/abc/account/summary']) {
      const res = await post(path, who())
      expect(res.status, path).toBe(404)
      noCors(res)
      answers.push(await res.json())
    }
    expect(new Set(answers.map(a => JSON.stringify(a))).size).toBe(1)
    expect(calls).toEqual([])
  })

  it('needs "email_verified": true (403), and a body that is one (400)', async () => {
    for (const body of [{ email: ANA }, { email: ANA, email_verified: false }, { email: ANA, email_verified: 'true' }]) {
      expect((await post('/api/site/1/account/summary', body)).status, JSON.stringify(body)).toBe(403)
    }
    for (const body of [who({ email: 'not-an-email' }), who({ email: `${'a'.repeat(250)}@x.es` }), who({ email: undefined }), [who()]]) {
      expect((await post('/api/site/1/account/summary', body)).status).toBe(400)
    }
    const res = await call('/api/site/1/account/summary', { method: 'POST', headers: { authorization: `Bearer ${KEY_1}` }, body: 'email=ana@example.com' })
    expect(res.status).toBe(400)
    expect(calls).toEqual([])
  })

  it('takes so many calls a minute from a business, then 429', async () => {
    let now = 1_000_000
    forgetSiteAccountCalls(() => now)
    for (let i = 0; i < REQUESTS_A_MINUTE; i++) expect((await post('/api/site/1/account/summary', who())).status).toBe(200)
    const over = await post('/api/site/1/account/summary', who())
    expect(over.status).toBe(429)
    expect(over.headers.get('retry-after')).toBe('60')
    // Another business has its own.
    expect((await post('/api/site/2/account/summary', who(), KEY_2)).status).toBe(200)
    now += 60_001
    expect((await post('/api/site/1/account/summary', who())).status).toBe(200)
  })
})

describe('sync', () => {
  it('sends the email trimmed and lowercased, the name in two, the phone as saved, and is made via the website', async () => {
    const res = await post('/api/site/1/account/sync', who({
      email: '  Ana@Example.COM ', name: 'Ana García López', phone: '600 000 000', square_customer_id: 'CBASEN1', lang: 'es-ES', rep_code: 'natash15',
    }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ customer_id: 'c-ana', created: true, is_rep: false, ignored: [] })
    expect(calls).toEqual([{ fn: 'site_account_sync', via: 'website', args: {
      p_business: 1, p_email: ANA, p_first_name: 'Ana', p_last_name: 'García López', p_phone: '+34 600 000 000',
      p_square_id: 'CBASEN1', p_lang: 'es', p_rep_code: 'natash15',
    } }])
  })

  it('reads a phone without its country code as the business’s country’s, and says back what it didn’t keep', async () => {
    await post('/api/site/2/account/sync', who({ phone: '087 123 4567' }), KEY_2)
    expect(calls[0].args.p_phone).toBe('+353 87 123 4567')
    const res = await post('/api/site/1/account/sync', who({ phone: 'call me', square_customer_id: 'TAKEN' }))
    expect(await res.json()).toMatchObject({ ignored: ['phone', 'square_customer_id'] })
    expect(calls[1].args.p_phone).toBeNull()
  })

  it('never sends anything about marketing', async () => {
    await post('/api/site/1/account/sync', who({ marketing_consent: true, newsletter: true }))
    expect(Object.keys(calls[0].args).some(k => /consent|marketing|newsletter/.test(k))).toBe(false)
  })
})

describe('summary', () => {
  it('someone not on Customers: customer null, nothing else', async () => {
    const res = await post('/api/site/1/account/summary', who({ email: 'nobody@example.com' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ customer: null })
  })

  it('Square not the connected till: points null, and the rest as the database says, without the Square id', async () => {
    const res = await post('/api/site/1/account/summary', who())
    const s = await res.json() as SiteAccountSummary
    expect(s).toEqual({
      customer: { id: 'c-ana', first_name: 'Ana' },
      points: null,
      credit: summary.credit,
      cashback: { on: true, per_1000_views: 0.5, per_100_likes: 0.2, per_follower: 0.1, max: 15 },
      rep: { code: 'NATASH15', kind: 'customer', earns: 'credit', reach: 0, reach_step: 'Local voice', reach_step_id: 'local', multiplier: 1,
        crew: { leads: false, members: 0 }, this_month: 0.47 },
    })
    expect(JSON.stringify(s)).not.toContain('SQC1')
  })

  it('a rep who reaches more, leads a crew and earns commission is worded so', async () => {
    summary.rep = { code: 'COACH10', kind: 'ambassador', reach: 12_000, boost_by_reach: true, crew_members: 4, this_month: 30 }
    const s = await (await post('/api/site/1/account/summary', who())).json() as SiteAccountSummary
    expect(s.rep).toMatchObject({ earns: 'commission', reach_step: 'Big voice', multiplier: 5, crew: { leads: true, members: 4 } })
    summary.rep.boost_by_reach = false
    expect(((await (await post('/api/site/1/account/summary', who())).json()) as SiteAccountSummary).rep!.multiplier).toBe(1)
  })

  it('no rep row: credit and rep null', async () => {
    summary.credit = null
    summary.rep = null
    const s = await (await post('/api/site/1/account/summary', who())).json() as SiteAccountSummary
    expect(s).toMatchObject({ credit: null, rep: null })
  })

  it('reads their points from Square Loyalty, for them alone, and keeps them a while', async () => {
    await connectSquare()
    const res = await post('/api/site/1/account/summary', who())
    expect(res.status).toBe(200)
    const s = await res.json() as SiteAccountSummary
    expect(s.points).toEqual({ program: { one: 'Stamp', other: 'Stamps', tiers: [{ id: 'T1', name: 'Free coffee', points: 9 }] }, balance: 7, lifetime: 25 })
    expect(apis.square.accountSearches).toBe(1)
    await post('/api/site/1/account/summary', who())
    expect(apis.square.accountSearches).toBe(1)
    // Nobody else's points are kept for them.
    expect(db.table('provider_cache').map(r => r.key).sort()).toEqual(['site-points:SQC1', 'site-points:program'])
  })

  it('no points without an account in the programme, without the programme, or without loyalty allowed', async () => {
    await connectSquare()
    summary.square_customer_id = 'SQC-NOT-A-MEMBER'
    expect((await (await post('/api/site/1/account/summary', who())).json() as SiteAccountSummary).points).toBeNull()
    db.tables.provider_cache = []
    summary.square_customer_id = 'SQC1'
    apis.square.loyaltyScope = false
    const s = await (await post('/api/site/1/account/summary', who())).json() as SiteAccountSummary
    expect(s.points).toBeNull()
    expect(s.credit).not.toBeNull()
    summary.square_customer_id = null
    expect((await (await post('/api/site/1/account/summary', who())).json() as SiteAccountSummary).points).toBeNull()
  })

  it('Square failing is 503, so the website keeps its card hidden rather than show no points', async () => {
    await connectSquare()
    apis.square.revoked = true
    const res = await post('/api/site/1/account/summary', who())
    expect(res.status).toBe(503)
    noCors(res)
  })
})

describe('erase', () => {
  it('erases through the database, via the website, and forgets their points', async () => {
    db.tables.provider_cache = [
      { key: 'site-points:SQC1', data: { account: { balance: 7, lifetime: 25 } }, fetched_at: new Date().toISOString() },
      { key: 'site-points:SQC10', data: { account: { balance: 1, lifetime: 1 } }, fetched_at: new Date().toISOString() },
    ]
    const res = await post('/api/site/1/account/erase', who())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ erased: true, kept: 'ledger', found: true })
    expect(calls).toEqual([{ fn: 'site_account_erase', via: 'website', args: { p_business: 1, p_email: ANA } }])
    expect(db.table('provider_cache').map(r => r.key)).toEqual(['site-points:SQC10'])
  })
})

describe('the email stays private', () => {
  it('is in no log line and no error kept for HQ, even when the database says it back', async () => {
    db.rpcs.site_account_sync = () => { throw new Error(`duplicate key value: Key (email)=(${ANA}) already exists`) }
    db.rpcs.site_account_erase = () => { throw new Error(`could not erase ${ANA}`) }
    expect((await post('/api/site/1/account/sync', who({ name: 'Ana García' }))).status).toBe(503)
    expect((await post('/api/site/1/account/erase', who())).status).toBe(503)
    await post('/api/site/1/account/summary', who({ email_verified: false }))
    await post('/api/site/1/account/summary', who(), 'nl_wrong')
    expect(errorsKept.length).toBe(2)
    expect(errorsKept.map(e => e.p_source)).toEqual(['site account sync', 'site account erase'])
    expect(logged.length).toBeGreaterThan(0)
    for (const text of [...logged, ...errorsKept.map(e => JSON.stringify(e))]) {
      expect(text.toLowerCase()).not.toContain('ana@example.com')
      expect(text).not.toContain('García')
    }
    // Nor in any address the Worker asks for.
    const urls = vi.mocked(fetch).mock.calls.map(([u]) => String(u))
    expect(urls.some(u => u.includes('example.com') || u.includes('%40'))).toBe(false)
  })
})
